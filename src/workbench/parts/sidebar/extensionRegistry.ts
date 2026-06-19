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

  private readonly _onDidInstall = this._register(new Emitter<InstalledExtension>());
  readonly onDidInstall = this._onDidInstall.event;

  private readonly _onDidUninstall = this._register(new Emitter<InstalledExtension>());
  readonly onDidUninstall = this._onDidUninstall.event;

  async loadInstalled(): Promise<void> {
    // Wait for extensionLoader._init() to parse manifests before querying builtins.
    await waitReady();
    const preinstalled = getBuiltinExtensions() as InstalledExtension[];

    const api = (window as any).electronAPI;
    if (!api) {
      this._installed = [...preinstalled];
      for (const ext of this._installed) this._onDidInstall.fire(ext);
      return;
    }
    const result = await api.extensionOps.load();
    const loaded: InstalledExtension[] = result.success && Array.isArray(result.extensions)
      ? result.extensions.filter((e: any) =>
          typeof e.displayName === 'string' && Array.isArray(e.languages))
      : [];
    if (loaded.length > 0) {
      // Merge: builtins always included, user-installed appended.
      const userInstalled = loaded.filter(e => !e.builtin);
      this._installed = [...preinstalled, ...userInstalled];
    } else {
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

  async install(ext: InstalledExtension): Promise<void> {
    if (this.isInstalled(ext.id)) return;
    this._installed.push(ext);
    await this._persist();
    this._onDidInstall.fire(ext);
  }

  async uninstall(id: string): Promise<void> {
    const ext = this._installed.find(e => e.id === id);
    if (!ext) return;
    this._installed = this._installed.filter(e => e.id !== id);
    await this._persist();
    this._onDidUninstall.fire(ext);
  }

  private async _persist(): Promise<void> {
    const api = (window as any).electronAPI;
    if (!api) return;
    await api.extensionOps.save(this._installed.filter(e => !e.builtin));
  }
}
