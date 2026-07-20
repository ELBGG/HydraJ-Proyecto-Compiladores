import './titlebarPart.css';
import { Part } from '../../part.js';
import { $, append, clearNode } from '../../../base/browser/dom.js';
import type { EditorPart } from '../editor/editorPart.js';
import type { SidebarPart } from '../sidebar/sidebarPart.js';
import type { PanelPart } from '../panel/panelPart.js';
import type { RunEngine } from '../sidebar/runEngine.js';
import type { Layout } from '../../layout.js';
import { iconHydraCode, createIconElement } from '../../../base/browser/icons.js';
import { LanguageRegistry } from '../../../languages/index.js';
import { buildStarterFile } from '../editor/fileTemplates.js';

export class TitlebarPart extends Part {
  private _editor: EditorPart | null = null;
  private _sidebar: SidebarPart | null = null;
  private _panel: PanelPart | null = null;
  private _runEngine: RunEngine | null = null;
  private _layout: Layout | null = null;
  private _dropdownOpen: HTMLElement | null = null;
  private _goToFileOverlay: HTMLElement | null = null;
  private _newFileModal: HTMLElement | null = null;
  private readonly _bodyDropdowns: HTMLElement[] = [];

  constructor() {
    super('titlebar', { hasTitle: false, minimumHeight: 35 });
  }

  setEditor(editor: EditorPart): void { this._editor = editor; }
  setSidebar(sidebar: SidebarPart): void { this._sidebar = sidebar; }
  setPanel(panel: PanelPart): void { this._panel = panel; }
  setRunEngine(runEngine: RunEngine): void { this._runEngine = runEngine; }
  setLayout(layout: Layout): void { this._layout = layout; }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['titlebar-content']);
    append(parent, container);

    const appIcon = $('div', ['titlebar-app-icon']);
    append(appIcon, createIconElement(iconHydraCode()));
    append(container, appIcon);

    const menu = $('div', ['titlebar-menu']);
    for (const def of this._menuDefs()) {
      append(menu, this._buildMenuItem(def));
    }
    append(container, menu);

    const onDocumentClick = () => this._closeDropdown();
    document.addEventListener('click', onDocumentClick);
    this._register({
      dispose: () => {
        document.removeEventListener('click', onDocumentClick);
        for (const dd of this._bodyDropdowns) dd.remove();
        this._bodyDropdowns.length = 0;
      },
    });

    const center = $('div', ['titlebar-center']);
    center.textContent = 'HydraCode';
    append(container, center);

    const actions = $('div', ['titlebar-actions']);
    const api = window.electronAPI;
    if (api?.isElectron) {
      const btns: Array<{ cls: string; text: string; fn: () => void }> = [
        { cls: 'minimize', text: '−', fn: () => api.windowControls.minimize() },
        { cls: 'maximize', text: '□', fn: () => api.windowControls.maximize() },
        { cls: 'close',    text: '×', fn: () => api.windowControls.close() },
      ];
      for (const b of btns) {
        const btn = $('button', ['titlebar-control', b.cls]);
        btn.textContent = b.text;
        btn.addEventListener('click', b.fn);
        append(actions, btn);
      }
    }
    append(container, actions);
    return container;
  }

  private _menuDefs(): Array<{
    label: string;
    items?: Array<{ label: string; action: () => void } | 'separator'>;
  }> {
    return [
      {
        label: 'File',
        items: [
          { label: 'New File',       action: () => this.onNewFile() },
          { label: 'Open File...',   action: () => this.onOpenFile() },
          { label: 'Open Folder...', action: () => this._sidebar?.openFolder() },
          'separator',
          { label: 'Save',           action: () => this.onSave() },
          { label: 'Save As...',     action: () => this.onSaveAs() },
        ],
      },
      {
        label: 'Edit',
        items: [
          { label: 'Undo',           action: () => this._editor?.triggerAction('undo') },
          { label: 'Redo',           action: () => this._editor?.triggerAction('redo') },
          'separator',
          { label: 'Cut',            action: () => this._editor?.triggerAction('editor.action.clipboardCutAction') },
          { label: 'Copy',           action: () => this._editor?.triggerAction('editor.action.clipboardCopyAction') },
          { label: 'Paste',          action: () => this._editor?.triggerAction('editor.action.clipboardPasteAction') },
          'separator',
          { label: 'Find & Replace', action: () => this._editor?.triggerAction('editor.action.startFindReplaceAction') },
        ],
      },
      {
        label: 'Selection',
        items: [
          { label: 'Select All',     action: () => this._editor?.triggerAction('selectAll') },
        ],
      },
      {
        label: 'View',
        items: [
          { label: 'Toggle Sidebar',     action: () => this._toggleSidebar() },
          { label: 'Toggle Panel',       action: () => this._layout?.togglePanel() },
          { label: 'Toggle Output Pane', action: () => this._editor?.toggleOutputPane() },
        ],
      },
      {
        label: 'Go',
        items: [
          { label: 'Go to Line...',  action: () => this._editor?.triggerAction('editor.action.gotoLine') },
          { label: 'Go to File...',  action: () => this._showGoToFile() },
        ],
      },
      {
        label: 'Run',
        items: [
          { label: 'Run File',         action: () => this._runFile(false) },
          { label: 'Run with Debug',   action: () => this._runFile(true) },
        ],
      },
      {
        label: 'Terminal',
        items: [
          { label: 'New Terminal',     action: () => this._showTerminal() },
          { label: 'Toggle Terminal',  action: () => this._layout?.togglePanel() },
        ],
      },
      {
        label: 'Help',
        items: [
          { label: 'Check for Updates...', action: () => this._checkForUpdates() },
          'separator',
          { label: 'About HydraCode', action: () => window.electronAPI?.appOps.about() },
        ],
      },
    ];
  }

  private _buildMenuItem(def: {
    label: string;
    items?: Array<{ label: string; action: () => void } | 'separator'>;
  }): HTMLElement {
    const wrapper = $('div', ['menu-item-wrapper']);
    const span = $('span', ['menu-item']);
    span.textContent = def.label;
    append(wrapper, span);

    if (def.items && def.items.length > 0) {
      const dropdown = $('div', ['menu-dropdown']);
      for (const sub of def.items) {
        if (sub === 'separator') {
          append(dropdown, $('div', ['menu-separator']));
        } else {
          const entry = $('div', ['menu-dropdown-item']);
          entry.textContent = sub.label;
          entry.addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeDropdown();
            sub.action();
          });
          append(dropdown, entry);
        }
      }
      // Appended to document.body (not `wrapper`) and positioned via getBoundingClientRect
      // on open, rather than nested + `position: absolute` inside the titlebar Part. The
      // titlebar and the sidebar/editor/panel Parts are sibling flex items with no z-index-
      // creating stacking context between them, so a z-index on a nested descendant can't
      // reliably paint above sibling Parts' content — this "portal" sidesteps that class of
      // bug entirely, the same way tooltips/modals are conventionally rendered at body level.
      append(document.body, dropdown);
      this._bodyDropdowns.push(dropdown);
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        const alreadyOpen = this._dropdownOpen === dropdown;
        this._closeDropdown();
        if (!alreadyOpen) {
          const rect = span.getBoundingClientRect();
          dropdown.style.left = `${rect.left}px`;
          dropdown.style.top = `${rect.bottom}px`;
          dropdown.classList.add('open');
          this._dropdownOpen = dropdown;
        }
      });
    }
    return wrapper;
  }

  private _closeDropdown(): void {
    this._dropdownOpen?.classList.remove('open');
    this._dropdownOpen = null;
  }

  private _toggleSidebar(): void {
    this._layout?.toggleSidebar();
  }

  private _runFile(debug: boolean): void {
    if (!this._editor || !this._runEngine) return;
    this._runEngine.run(this._editor, { debug });
  }

  private _showTerminal(): void {
    this._layout?.showPanel();
    this._panel?.activateTab('terminal');
  }

  // ── Go to File overlay ────────────────────────────────────────────────────

  private _showGoToFile(): void {
    if (this._goToFileOverlay) {
      this._goToFileOverlay.remove();
      this._goToFileOverlay = null;
      return;
    }
    const files = this._sidebar?.getLoadedFiles() ?? [];
    if (files.length === 0) return;

    const overlay = $('div', ['go-to-file-overlay']);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Go to file...';
    input.className = 'go-to-file-input';
    append(overlay, input);

    const list = $('div', ['go-to-file-list']);

    const renderList = (filter: string) => {
      clearNode(list);
      const shown = filter
        ? files.filter(f => f.label.toLowerCase().includes(filter.toLowerCase()))
        : files;
      for (const f of shown.slice(0, 20)) {
        const item = $('div', ['go-to-file-item']);
        item.textContent = f.label;
        item.title = f.path;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this._openFileFromWorkspace(f.path, f.label);
          overlay.remove();
          this._goToFileOverlay = null;
        });
        append(list, item);
      }
    };

    renderList('');
    input.addEventListener('input', () => renderList(input.value));
    append(overlay, list);

    document.body.appendChild(overlay);
    this._goToFileOverlay = overlay;
    input.focus();

    setTimeout(() => {
      const onDocumentClick = (e: MouseEvent) => {
        if (this._goToFileOverlay !== overlay) {
          // This overlay was already closed through another path (e.g.
          // selecting a file); drop this stale listener without touching
          // whatever overlay may be open now.
          document.removeEventListener('click', onDocumentClick);
          return;
        }
        if (overlay.contains(e.target as Node)) return;
        document.removeEventListener('click', onDocumentClick);
        overlay.remove();
        this._goToFileOverlay = null;
      };
      document.addEventListener('click', onDocumentClick);
    }, 0);
  }

  private async _openFileFromWorkspace(filePath: string, label: string): Promise<void> {
    const api = window.electronAPI;
    if (!api || !this._editor) return;
    const result = await api.folderOps.readFile(filePath);
    if (!result.success) return;
    this._editor.openFile({ path: filePath, label, content: result.content });
  }

  // ── File actions ──────────────────────────────────────────────────────────

  onNewFile(): void {
    this._showNewFileModal();
  }

  // ── New File modal ────────────────────────────────────────────────────────
  // A real "mini window" (centered + backdrop) rather than the anchored quick-pick
  // style of _showGoToFile/_showLangPicker — it asks a single yes/no question (what do
  // you want to name this file?) rather than filtering a list, and clicking anywhere
  // outside it should unambiguously cancel, which a full-screen backdrop gives for free
  // without the click-outside timing dance those overlays need (see their comments).

  private _showNewFileModal(): void {
    if (this._newFileModal) return;

    const backdrop = $('div', ['new-file-backdrop']);
    const modal = $('div', ['new-file-modal']);

    const title = $('div', ['new-file-title']);
    title.textContent = 'Nuevo archivo';
    append(modal, title);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'nombre.ext (p. ej. principal.java)';
    input.className = 'new-file-input';
    append(modal, input);

    const errorEl = $('div', ['new-file-error']);
    append(modal, errorEl);

    const actions = $('div', ['new-file-actions']);
    const cancelBtn = $('button', ['new-file-btn', 'new-file-btn-cancel']);
    cancelBtn.textContent = 'Cancelar';
    const createBtn = $('button', ['new-file-btn', 'new-file-btn-create']);
    createBtn.textContent = 'Crear';
    append(actions, cancelBtn);
    append(actions, createBtn);
    append(modal, actions);

    const close = () => {
      backdrop.remove();
      modal.remove();
      this._newFileModal = null;
    };

    const confirm = async () => {
      const name = input.value.trim();
      if (!name) {
        errorEl.textContent = 'Escribe un nombre de archivo.';
        return;
      }
      errorEl.textContent = '';
      input.disabled = true;
      createBtn.disabled = true;
      const result = await this._createNewFile(name);
      if (result === true) {
        close();
        return;
      }
      input.disabled = false;
      createBtn.disabled = false;
      errorEl.textContent = result;
      requestAnimationFrame(() => input.focus());
    };

    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    createBtn.addEventListener('click', () => { void confirm(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void confirm();
      else if (e.key === 'Escape') close();
    });

    // Whatever currently has focus (most commonly Monaco's own hidden textarea, once a
    // file's editor has been shown at least once) needs to explicitly let go before this
    // input can reliably take over — a bare input.focus() here lost the race often
    // enough in practice (worked opening the very first file, when nothing owned focus
    // yet; silently failed to actually move focus on every subsequent attempt) that a
    // synchronous blur followed by a deferred focus is worth the extra complexity.
    (document.activeElement as HTMLElement | null)?.blur();

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    this._newFileModal = modal;
    requestAnimationFrame(() => input.focus());
  }

  /** Detects the language from `name`'s extension, builds its Spanish starter content,
   *  and creates the file for real inside the open workspace folder — or, if none is
   *  open (or this isn't running under Electron at all), falls back to an in-memory-
   *  only tab the user saves normally later. Returns true on success, or a
   *  user-facing error message string (e.g. a duplicate name) to show inline instead
   *  of closing the modal. */
  private async _createNewFile(name: string): Promise<true | string> {
    if (!this._editor) return 'El editor no está listo todavía.';

    const progLang = this._editor.detectProgLang(name);
    const humanLang = this._editor.getCurrentHumanLang();
    const mapping = LanguageRegistry.getMapping(progLang, humanLang);
    const baseName = name.replace(/\.[^./\\]+$/, '');
    const content = buildStarterFile(mapping, baseName) ?? '';

    const workspacePath = this._sidebar?.getWorkspacePath();
    const api = window.electronAPI;

    if (workspacePath && api) {
      const result = await api.folderOps.createFile(workspacePath, name, content);
      if (!result.success || !result.path) return result.error ?? 'No se pudo crear el archivo.';
      this._editor.openFile({ path: result.path, label: name, content });
      return true;
    }

    this._editor.newFileWithTemplate(name, progLang, content);
    return true;
  }

  async onOpenFile(): Promise<void> {
    const api = window.electronAPI;
    if (!api || !this._editor) return;
    const result = await api.fileOps.open();
    if (result.canceled) return;
    // Open as a real tab (same path openFolder-tree opens through), not setContent() —
    // setContent() only overwrites whatever tab/editor is already showing (or silently
    // no-ops from the welcome screen, where no Monaco editor is mounted yet).
    const label = result.path.split(/[\\/]/).pop() ?? result.path;
    this._editor.openFile({ path: result.path, label, content: result.content });
  }

  async onSave(): Promise<void> {
    if (!this._editor) return;
    const path = this._editor.getActiveTabPath();
    if (path) {
      const api = window.electronAPI;
      if (api) await api.fileOps.save(path, this._editor.getContent());
    } else {
      await this.onSaveAs();
    }
  }

  async onSaveAs(): Promise<void> {
    if (!this._editor) return;
    const api = window.electronAPI;
    if (!api) return;
    const result = await api.fileOps.saveAs(this._editor.getContent());
    if (!result.canceled) {
      const label = result.path.split(/[\\/]/).pop() ?? result.path;
      this._editor.setActiveTabPath(result.path, label);
    }
  }

  /** All the actual found/not-found/downloaded feedback is shown via native dialogs
   *  from the main process itself (main.cjs's setupAutoUpdater) — this only needs to
   *  surface the one failure mode that happens before any of that: the check
   *  couldn't even start (e.g. running un-packaged, where there's no app-update.yml
   *  for electron-updater to read a provider from). */
  private async _checkForUpdates(): Promise<void> {
    const api = window.electronAPI;
    if (!api) return;
    const result = await api.appOps.checkForUpdates();
    if (!result.success) alert(result.error ?? 'No se pudo buscar actualizaciones.');
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    const el = this.element;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.display = 'flex';
    el.style.flexDirection = 'row';
    el.style.alignItems = 'center';
  }
}
