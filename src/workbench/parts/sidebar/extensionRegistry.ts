import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { getBuiltinExtensions, waitReady } from './extensionLoader.js';

export interface InstalledExtension {
  id: string;
  displayName: string;
  languages: Array<{ id: string; extensions: string[] }>;
  grammars: Array<{ language: string; scopeName: string; path: string }>;
  installPath: string;
  builtin: boolean;
}

export class ExtensionRegistry extends Disposable {
  private _installed: InstalledExtension[] = [];
  private _loadPromise: Promise<void> | null = null;

  private readonly _onDidInstall = this._register(new Emitter<InstalledExtension>());
  readonly onDidInstall = this._onDidInstall.event;

  private readonly _onDidUninstall = this._register(new Emitter<InstalledExtension>());
  readonly onDidUninstall = this._onDidUninstall.event;

  // Single-slot error callback for persistence failures (full disk, file locked by AV/
  // OneDrive, etc.). A plain callback rather than an Emitter is deliberate: ExtensionsPanel
  // is re-created without disposal on every visit to the Extensions section, so an Emitter's
  // accumulating listener list would leak one stale subscriber per visit — a single mutable
  // slot is simply overwritten by the latest panel instead of accumulating.
  private _persistErrorHandler: ((message: string) => void) | null = null;

  setPersistErrorHandler(handler: ((message: string) => void) | null): void {
    this._persistErrorHandler = handler;
  }

  /** Memoized like settingsStore.load()/mappingSourceStore.load() — every call after the
   *  first (in flight or already settled) returns the SAME promise instead of re-running
   *  the load. install()/uninstall() await this before mutating (see below) for the same
   *  reason those two stores' set()/addOrUpdate() do: without it, a fast Install click
   *  landing before this resolves would push onto a still-empty `_installed` and
   *  persist() would silently overwrite every previously-installed extension on disk. */
  loadInstalled(): Promise<void> {
    if (!this._loadPromise) this._loadPromise = this._doLoadInstalled();
    return this._loadPromise;
  }

  private async _doLoadInstalled(): Promise<void> {
    // Wait for extensionLoader._init() to parse manifests before querying builtins.
    await waitReady();
    const preinstalled = getBuiltinExtensions() as InstalledExtension[];

    const api = window.electronAPI;
    if (!api) {
      this._installed = [...preinstalled];
      for (const ext of this._installed) this._onDidInstall.fire(ext);
      return;
    }
    const result = await api.extensionOps.load();
    if (!result.success) {
      // Load genuinely failed (corrupt JSON, permission error — NOT the normal
      // missing-file-on-first-run case, main.cjs already distinguishes that as success:true
      // with an empty list). Fall back to builtins for this session but do NOT persist:
      // saving here would silently overwrite the corrupt file before the user ever finds
      // out their installed extensions were lost.
      this._installed = [...preinstalled];
      this._persistErrorHandler?.(
        'No se pudieron cargar las extensiones instaladas (archivo dañado o inaccesible). ' +
        'Se muestran solo las extensiones integradas; vuelve a instalar las demás si las necesitas.'
      );
      for (const ext of this._installed) this._onDidInstall.fire(ext);
      return;
    }
    const loaded: InstalledExtension[] = Array.isArray(result.extensions)
      ? result.extensions.filter((e: any): e is InstalledExtension =>
          typeof e.displayName === 'string' && Array.isArray(e.languages))
      : [];
    if (loaded.length > 0) {
      // Merge: builtins always included, user-installed appended.
      const userInstalled = loaded.filter(e => !e.builtin);
      this._installed = [...preinstalled, ...userInstalled];
    } else {
      // Genuinely empty/first run: seed builtins and persist them.
      this._installed = [...preinstalled];
      await this._persist();
    }
    for (const ext of this._installed) {
      this._onDidInstall.fire(ext);
    }
  }

  getInstalled(): InstalledExtension[] {
    return [...this._installed];
  }

  isInstalled(id: string): boolean {
    return this._installed.some(e => e.id === id);
  }

  /** True if any currently-installed extension (builtin or marketplace) already provides
   *  the given language id — regardless of that extension's own id namespace. Use this
   *  (rather than isInstalled with a marketplace id) to decide whether a marketplace result
   *  should be offered as installable, so e.g. searching "Python" doesn't show an active
   *  "Install" for ms-python.python when builtin.python already provides `python`. */
  isLanguageInstalled(langId: string): boolean {
    return this._installed.some(e => e.languages.some(l => l.id === langId));
  }

  /** Looks up which installed extension's language (if any) claims a given file
   *  extension (e.g. '.go' → 'go' after installing Go from the marketplace) — lets
   *  file-open language detection cover marketplace-installed languages, not just
   *  the bundled java/c/cpp/python extensions. `fileExt` must include the leading dot. */
  getLanguageForExtension(fileExt: string): string | null {
    const lower = fileExt.toLowerCase();
    for (const ext of this._installed) {
      for (const lang of ext.languages) {
        if (lang.extensions.some(e => e.toLowerCase() === lower)) return lang.id;
      }
    }
    return null;
  }

  async install(ext: InstalledExtension): Promise<void> {
    await this.loadInstalled();
    if (this.isInstalled(ext.id)) return;
    this._installed.push(ext);
    await this._persist();
    this._onDidInstall.fire(ext);
  }

  async uninstall(id: string): Promise<void> {
    await this.loadInstalled();
    const ext = this._installed.find(e => e.id === id);
    if (!ext) return;
    this._installed = this._installed.filter(e => e.id !== id);
    await this._persist();

    // Only report languages no longer provided by any remaining installed extension: a
    // consumer (workbench.ts) strips every language in the fired event from the statusbar's
    // language cycle unconditionally, so uninstalling a redundant marketplace entry (e.g.
    // ms-python.python) must not report `python` here while builtin.python still provides
    // it — otherwise Python silently vanishes from the cycle until app restart.
    const stillProvided = new Set<string>();
    for (const e of this._installed) {
      for (const l of e.languages) stillProvided.add(l.id);
    }
    const orphanedLanguages = ext.languages.filter(l => !stillProvided.has(l.id));
    this._onDidUninstall.fire({ ...ext, languages: orphanedLanguages });
  }

  private async _persist(): Promise<void> {
    const api = window.electronAPI;
    if (!api) return;
    const result = await api.extensionOps.save(this._installed.filter(e => !e.builtin));
    if (!result.success) {
      this._persistErrorHandler?.(result.error ?? 'No se pudieron guardar las extensiones en disco.');
    }
  }
}
