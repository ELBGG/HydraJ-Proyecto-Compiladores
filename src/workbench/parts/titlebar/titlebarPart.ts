import './titlebarPart.css';
import { Part } from '../../part.js';
import { $, append, clearNode } from '../../../base/browser/dom.js';
import type { EditorPart } from '../editor/editorPart.js';
import type { SidebarPart } from '../sidebar/sidebarPart.js';
import type { Layout } from '../../layout.js';
import { iconHydraCode, iconSearch, createIconElement } from '../../../base/browser/icons.js';

export class TitlebarPart extends Part {
  private _editor: EditorPart | null = null;
  private _sidebar: SidebarPart | null = null;
  private _layout: Layout | null = null;
  private _currentFilePath: string | null = null;
  private _dropdownOpen: HTMLElement | null = null;
  private _goToFileOverlay: HTMLElement | null = null;
  private _sidebarVisible = true;

  constructor() {
    super('titlebar', { hasTitle: false, minimumHeight: 35 });
  }

  setEditor(editor: EditorPart): void { this._editor = editor; }
  setSidebar(sidebar: SidebarPart): void { this._sidebar = sidebar; }
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

    document.addEventListener('click', () => this._closeDropdown());

    const center = $('div', ['titlebar-center']);
    center.textContent = 'HydraCode';
    append(container, center);

    const actions = $('div', ['titlebar-actions']);
    if ((window as any).electronAPI?.isElectron) {
      const btns: Array<{ cls: string; text: string; fn: () => void }> = [
        { cls: 'minimize', text: '−', fn: () => (window as any).electronAPI.windowControls.minimize() },
        { cls: 'maximize', text: '□', fn: () => (window as any).electronAPI.windowControls.maximize() },
        { cls: 'close',    text: '×', fn: () => (window as any).electronAPI.windowControls.close() },
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
      { label: 'Run' },
      { label: 'Terminal' },
      {
        label: 'Help',
        items: [
          { label: 'About HydraCode', action: () => (window as any).electronAPI?.appOps.about() },
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
      append(wrapper, dropdown);
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        const alreadyOpen = this._dropdownOpen === dropdown;
        this._closeDropdown();
        if (!alreadyOpen) {
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
    this._sidebarVisible = !this._sidebarVisible;
    this._layout?.setSidebarVisible(this._sidebarVisible);
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
      document.addEventListener('click', () => {
        overlay.remove();
        this._goToFileOverlay = null;
      }, { once: true });
    }, 0);
  }

  private async _openFileFromWorkspace(filePath: string, label: string): Promise<void> {
    const api = (window as any).electronAPI;
    if (!api || !this._editor) return;
    const result = await api.folderOps.readFile(filePath);
    if (!result.success) return;
    this._editor.openFile({ path: filePath, label, content: result.content });
  }

  // ── File actions ──────────────────────────────────────────────────────────

  onNewFile(): void {
    this._currentFilePath = null;
    this._editor?.setContent('');
  }

  async onOpenFile(): Promise<void> {
    const api = (window as any).electronAPI;
    if (!api) return;
    const result = await api.fileOps.open();
    if (result.canceled) return;
    this._currentFilePath = result.path;
    this._editor?.setContent(result.content);
  }

  async onSave(): Promise<void> {
    if (!this._editor) return;
    if (this._currentFilePath) {
      const api = (window as any).electronAPI;
      if (api) await api.fileOps.save(this._currentFilePath, this._editor.getContent());
    } else {
      await this.onSaveAs();
    }
  }

  async onSaveAs(): Promise<void> {
    if (!this._editor) return;
    const api = (window as any).electronAPI;
    if (!api) return;
    const result = await api.fileOps.saveAs(this._editor.getContent());
    if (!result.canceled) this._currentFilePath = result.path;
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
