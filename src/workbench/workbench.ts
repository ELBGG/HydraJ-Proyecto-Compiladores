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

export class Workbench extends Disposable {
  private _layout: Layout;
  private _parts = new Map<string, Part>();
  private _titlebar: TitlebarPart;
  private _sidebar: SidebarPart;
  private _editor: EditorPart;
  private _statusbar: StatusbarPart;

  private readonly _onDidLayout = this._register(new Emitter<void>());
  readonly onDidLayout = this._onDidLayout.event;

  constructor(parent: HTMLElement) {
    super();
    applyTheme(vsCodeDark);

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
    this._sidebar.setEditor(this._editor);

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
      const api = (window as any).electronAPI;
      if (!api) return;
      const result = await api.folderOps.readFile(path);
      if (!result.success) return;
      this._editor.openFile({ path, label, content: result.content });
    });

    // Statusbar ↔ editor language sync
    this._statusbar.onLanguageChange(({ progLang, humanLang }) => {
      this._editor.setLanguage(progLang, humanLang);
    });

    // Transpile status display
    window.addEventListener('hydracode-transpile', ((e: CustomEvent) => {
      const { success, mapping } = e.detail;
      this._statusbar.setTranspileStatus(success ? `OK ${mapping}` : `ERR ${mapping}`);
    }) as EventListener);

    // Activity bar → sidebar section switching + blocks mode toggle
    let _lastActiveId: string | null = 'explorer';
    activitybar.onIconActivate((id) => {
      const wasBlocks = _lastActiveId === 'blocks';
      const isBlocks  = id === 'blocks';

      if (id === _lastActiveId) {
        this._layout.setSidebarVisible(false);
        if (isBlocks) this._editor.setBlocksMode(false);
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
        _lastActiveId = id;
      }
    });

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
