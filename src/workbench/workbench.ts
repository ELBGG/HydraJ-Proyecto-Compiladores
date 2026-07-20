import './media/style.css';
import { Layout, PartLocation } from './layout.js';
import { Part } from './part.js';
import { TitlebarPart } from './parts/titlebar/titlebarPart.js';
import { ActivitybarPart } from './parts/activitybar/activitybarPart.js';
import { SidebarPart } from './parts/sidebar/sidebarPart.js';
import { EditorPart } from './parts/editor/editorPart.js';
import { PanelPart } from './parts/panel/panelPart.js';
import { StatusbarPart } from './parts/statusbar/statusbarPart.js';
import { applyTheme, vsCodeDark } from './themes/theme.js';
import { Emitter } from '../base/common/event.js';
import { Disposable } from '../base/common/lifecycle.js';
import { ExtensionRegistry } from './parts/sidebar/extensionRegistry.js';
import { RunEngine } from './parts/sidebar/runEngine.js';
import { settingsStore } from './parts/sidebar/settingsStore.js';
import { loadAndRegisterAllMappings } from './parts/sidebar/mappingSourceStore.js';
import { getStatus as getGitStatus } from './parts/sidebar/gitService.js';
import { registerGoLanguages } from '../languages/index.js';

export class Workbench extends Disposable {
  private _layout: Layout;
  private _parts = new Map<string, Part>();
  private _titlebar: TitlebarPart;
  private _sidebar: SidebarPart;
  private _editor: EditorPart;
  private _statusbar: StatusbarPart;
  private _extensionRegistry: ExtensionRegistry;
  private _runEngine: RunEngine;

  private readonly _onDidLayout = this._register(new Emitter<void>());
  readonly onDidLayout = this._onDidLayout.event;

  constructor(parent: HTMLElement) {
    super();
    applyTheme(vsCodeDark);

    // Kick off the settings load as early as possible — it's an async IPC round-trip,
    // so this races harmlessly alongside the synchronous Part construction below; any
    // Part reading a setting during its own constructor still gets the schema default
    // until this resolves, then corrects itself via settingsStore.onChange.
    void settingsStore.load();

    // Java/C/C++/Python's mappings are fetched from their GitHub repos (see
    // mappingSourceStore.ts's DEFAULT_SOURCES) rather than imported as static TS modules
    // — each fetch falls back to a local cache (seeded with today's mapping data, so
    // this still works fully offline / before a source repo exists yet) if the network
    // is unavailable or a given repo can't be reached. Fired here, as early as possible,
    // for the same reason as settingsStore.load() above — LanguageRegistry.register()
    // calls land whenever each source resolves; nothing in the synchronous construction
    // below requires them to already be registered (getMapping() returning undefined
    // this briefly is already a handled case everywhere it's read).
    void loadAndRegisterAllMappings().then(outcomes => {
      for (const o of outcomes) {
        if (!o.ok) console.error(`[HydraCode] No se pudo cargar el mapping de "${o.languageId}" desde ${o.repoUrl}:`, o.error);
        else if (o.source === 'cache') console.warn(`[HydraCode] "${o.languageId}": usando mapping en caché (no se pudo contactar ${o.repoUrl}).`);
      }
    });

    this._layout = new Layout(parent);

    this._titlebar    = new TitlebarPart();
    const activitybar = new ActivitybarPart();
    this._sidebar     = new SidebarPart();
    this._editor      = new EditorPart();
    const panel       = new PanelPart();
    this._statusbar   = new StatusbarPart();

    // Pass refs
    this._titlebar.setEditor(this._editor);
    this._titlebar.setSidebar(this._sidebar);
    this._titlebar.setLayout(this._layout);
    this._titlebar.setPanel(panel);
    this._sidebar.setEditor(this._editor);

    // Go's mapping is still a bundled static module (out of scope for the GitHub-source
    // migration above — nobody asked for a Go-mappings-hydracode repo) so it registers
    // synchronously, same as it always has.
    registerGoLanguages();

    this._extensionRegistry = this._register(new ExtensionRegistry());

    this._extensionRegistry.onDidInstall(ext => {
      for (const lang of ext.languages) {
        this._statusbar.addLanguage(lang.id);
      }
    });

    this._extensionRegistry.onDidUninstall(ext => {
      for (const lang of ext.languages) {
        this._statusbar.removeLanguage(lang.id);
      }
    });

    this._sidebar.setExtensionRegistry(this._extensionRegistry);
    this._editor.setExtensionRegistry(this._extensionRegistry);
    this._extensionRegistry.loadInstalled();

    // Run engine
    this._runEngine = this._register(new RunEngine());
    this._runEngine.onOutput(({ text, type }) => {
      panel.appendOutput(text, type);
    });
    this._runEngine.onStateChange(state => {
      if (state === 'running') {
        panel.clearOutput();
        this._layout.showPanel();
        panel.activateTab('output');
      }
    });
    this._runEngine.onRequestTerminalRun(({ command }) => {
      this._layout.showPanel();
      panel.runInTerminal(command);
    });
    this._sidebar.setRunEngine(this._runEngine);
    this._titlebar.setRunEngine(this._runEngine);

    this._registerParts([
      ['titlebar',    this._titlebar],
      ['activitybar', activitybar],
      ['sidebar',     this._sidebar],
      ['editor',      this._editor],
      ['panel',       panel],
      ['statusbar',   this._statusbar],
    ]);

    // Sidebar file click → read file via IPC → open in editor
    this._sidebar.onFileOpen(async ({ path, label }) => {
      const api = window.electronAPI;
      if (!api) return;
      const result = await api.folderOps.readFile(path);
      if (!result.success) return;
      this._editor.openFile({ path, label, content: result.content });
    });

    // Statusbar ↔ editor language sync
    this._statusbar.onLanguageChange(({ progLang, humanLang }) => {
      this._editor.setLanguage(progLang, humanLang);
    });
    // ...and the reverse direction: when the editor discovers a language on its own
    // (opening a file, switching tabs), push it back into the status bar chip —
    // otherwise the chip keeps showing whatever it last had (e.g. "Java" at
    // startup) regardless of what file is actually open.
    this._editor.onActiveLanguageChange(({ progLang, humanLang }) => {
      this._statusbar.setLanguage(progLang, humanLang);
    });

    // Transpile status display
    window.addEventListener('hydracode-transpile', ((e: CustomEvent) => {
      const { success, mapping } = e.detail;
      this._statusbar.setTranspileStatus(success ? `OK ${mapping}` : `ERR ${mapping}`);
    }) as EventListener);

    // Activity bar → sidebar section switching + blocks mode toggle
    let _lastActiveId: string | null = 'explorer';
    const activateSection = (id: string) => {
      const wasBlocks = _lastActiveId === 'blocks';
      const isBlocks  = id === 'blocks';

      if (id === _lastActiveId) {
        this._layout.setSidebarVisible(false);
        if (isBlocks) this._editor.setBlocksMode(false);
        activitybar.setActiveIcon(null);
        _lastActiveId = null;
      } else {
        if (isBlocks) {
          // Blocks mode: hide sidebar to give Blockly full width
          this._layout.setSidebarVisible(false);
          this._editor.setBlocksMode(true);
        } else {
          this._sidebar.showSection(id);
          this._layout.setSidebarVisible(true);
        }
        if (wasBlocks) this._editor.setBlocksMode(false);
        activitybar.setActiveIcon(id);
        _lastActiveId = id;
      }
    };
    activitybar.onIconActivate(activateSection);

    // Status bar branch indicator ↔ real git state. Reflects whatever workspace is
    // actually open instead of the permanently hardcoded "main" label this used to be.
    const refreshBranchStatus = async (cwd: string | null) => {
      if (!cwd) { this._statusbar.setBranchStatus(null); return; }
      try {
        const status = await getGitStatus(cwd);
        this._statusbar.setBranchStatus(
          status.isRepo && status.branch
            ? { branch: status.branch, dirty: status.staged.length + status.unstaged.length > 0 }
            : null,
        );
      } catch {
        this._statusbar.setBranchStatus(null);
      }
    };
    this._sidebar.onWorkspaceChange(path => { void refreshBranchStatus(path); });
    // Reuses the Source Control panel's own fetch instead of a second independent
    // git:status call every time that panel refreshes (after a commit/push/pull/...).
    this._sidebar.onGitStatusChange(status => {
      this._statusbar.setBranchStatus(
        status && status.isRepo && status.branch
          ? { branch: status.branch, dirty: status.staged.length + status.unstaged.length > 0 }
          : null,
      );
    });
    // Clicking the branch indicator opens Source Control, the same way VS Code's own does.
    this._statusbar.onBranchClick(() => activateSection('source-control'));

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 'n': e.preventDefault(); this._titlebar.onNewFile();  break;
        case 'o': e.preventDefault(); this._titlebar.onOpenFile(); break;
        case 's':
          e.preventDefault();
          if (e.shiftKey) this._titlebar.onSaveAs();
          else            this._titlebar.onSave();
          break;
      }
    });

    this._layout.layout();
  }

  private _registerParts(parts: [PartLocation, Part][]): void {
    for (const [location, part] of parts) {
      this._parts.set(location, part);
      this._layout.registerPart(location, part);
      this._register(part);
    }
  }

  layout(): void {
    this._layout.layout();
    this._onDidLayout.fire();
  }
}
