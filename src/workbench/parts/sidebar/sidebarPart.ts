import './sidebarPart.css';
import { Part } from '../../part.js';
import { $, append, clearNode } from '../../../base/browser/dom.js';
import { Emitter } from '../../../base/common/event.js';
import type { EditorPart } from '../editor/editorPart.js';
import { STTEngine } from './sttEngine.js';
import { STTPanel } from './sttPanel.js';
import { AIInterpreter } from './aiInterpreter.js';
import { ExtensionRegistry } from './extensionRegistry.js';
import { ExtensionStore } from './extensionStore.js';
import { ExtensionsPanel } from './extensionsPanel.js';
import { RunEngine } from './runEngine.js';
import { RunPanel } from './runPanel.js';
import { SettingsPanel } from './settingsPanel.js';
import { MappingsPanel } from './mappingsPanel.js';
import { SourceControlPanel } from './sourceControlPanel.js';
import type { GitStatus } from './gitService.js';
import {
  iconFolder, iconFolderOpen, iconFile, iconFileCode, createIconElement,
  iconNewFile, iconNewFolder, iconRefresh, iconCollapseAll,
} from '../../../base/browser/icons.js';

interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}



export class SidebarPart extends Part {
  private _contentEl: HTMLElement | null = null;
  private _workspacePath: string | null = null;
  private _loadedFiles: Array<{ path: string; label: string }> = [];
  private _editor: EditorPart | null = null;
  private _sttEngine: STTEngine | null = null;
  private _sttPanel: STTPanel | null = null;
  private _aiInterpreter: AIInterpreter | null = null;
  private _extensionRegistry: ExtensionRegistry | null = null;
  private _runEngine: RunEngine | null = null;
  private _runPanel: RunPanel | null = null;
  private _settingsPanel: SettingsPanel | null = null;
  private _mappingsPanel: MappingsPanel | null = null;
  private _sourceControlPanel: SourceControlPanel | null = null;

  // ── Explorer state ────────────────────────────────────────────────────────
  private _expandedDirs = new Set<string>();
  private _fileRowElements = new Map<string, HTMLElement>();
  private _activeFilePath: string | null = null;
  private _pendingCreate: { dirPath: string; depth: number; kind: 'file' | 'dir' } | null = null;
  private _contextMenuEl: HTMLElement | null = null;
  private _contextMenuCloseHandlers: Array<() => void> = [];
  private _activeSection = 'explorer';

  private readonly _onFileOpen = this._register(new Emitter<{ path: string; label: string }>());
  readonly onFileOpen = this._onFileOpen.event;

  /** Fired whenever the open workspace folder changes (including to null) — lets
   *  workbench.ts keep the status bar's branch indicator in sync without SidebarPart
   *  needing to know anything about the status bar itself. */
  private readonly _onWorkspaceChange = this._register(new Emitter<string | null>());
  readonly onWorkspaceChange = this._onWorkspaceChange.event;

  /** Fired whenever the Source Control panel (re)fetches git status — reuses that
   *  fetch for the status bar branch indicator too, instead of a second independent
   *  git:status call every time either one needs to refresh. */
  private readonly _onGitStatusChange = this._register(new Emitter<GitStatus | null>());
  readonly onGitStatusChange = this._onGitStatusChange.event;

  constructor() {
    super('sidebar', { hasTitle: false, minimumWidth: 200 });
  }

  setEditor(editor: EditorPart): void {
    this._editor = editor;
    this._sttPanel?.setEditor(editor);
    // Keeps the Explorer's "active file" highlight following whatever tab is actually
    // showing — including tab switches/closes that didn't originate from an Explorer
    // click (clicking a tab directly, opening via Source Control, etc).
    editor.onActiveTabChange(({ path }) => {
      this._activeFilePath = path;
      this._syncActiveFileHighlight();
    });
  }

  setExtensionRegistry(registry: ExtensionRegistry): void {
    this._extensionRegistry = registry;
  }

  setRunEngine(engine: RunEngine): void {
    this._runEngine = engine;
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['sidebar-content']);
    append(parent, container);
    this._contentEl = container;

    // Bound once (not per-render, since _renderExplorer() re-runs many times over this
    // same persistent container) — guarded so it only acts while Explorer is the active
    // section. Right-click on genuinely empty tree space: row-level contextmenu handlers
    // call stopPropagation(), so this only fires when nothing was actually under the cursor.
    container.addEventListener('contextmenu', (e) => {
      if (this._activeSection !== 'explorer' || !this._workspacePath) return;
      e.preventDefault();
      const ws = this._workspacePath;
      this._showContextMenu(e.clientX, e.clientY, [
        { label: 'Nuevo Archivo…', onClick: () => { this._pendingCreate = { dirPath: ws, depth: 0, kind: 'file' }; void this._renderExplorer(); } },
        { label: 'Nueva Carpeta…', onClick: () => { this._pendingCreate = { dirPath: ws, depth: 0, kind: 'dir' }; void this._renderExplorer(); } },
        { separator: true },
        { label: 'Actualizar', onClick: () => void this._renderExplorer() },
      ]);
    });

    this._renderExplorer();
    return container;
  }

  showSection(id: string): void {
    if (!this._contentEl) return;
    this._activeSection = id;
    clearNode(this._contentEl);
    switch (id) {
      case 'explorer':        this._renderExplorer();    break;
      case 'search':          this._renderSearch();      break;
      case 'blocks':          this._renderBlocks();      break;
      case 'source-control':  this._renderSourceControl();  break;
      case 'debug':           this._renderDebug();       break;
      case 'extensions':      this._renderExtensions(); break;
      case 'mappings':        this._renderMappings();    break;
      case 'stt':             this._renderSTT();         break;
      case 'settings':        this._renderSettings();    break;
      default:                this._renderPlaceholder(id.toUpperCase(), ''); break;
    }
  }

  async openFolder(): Promise<void> {
    const api = window.electronAPI;
    if (!api) return;
    const result = await api.folderOps.open();
    if (result.canceled) return;
    this._workspacePath = result.path;
    this._loadedFiles = [];
    this._onWorkspaceChange.fire(this._workspacePath);
    if (this._contentEl) {
      clearNode(this._contentEl);
      await this._renderExplorer();
    }
  }

  getLoadedFiles(): Array<{ path: string; label: string }> {
    return [...this._loadedFiles];
  }

  /** The currently open workspace folder's root path, or null if none is open. Used by
   *  the New File flow (titlebarPart.ts) to decide whether a new file can be created
   *  for real on disk, or must fall back to an in-memory-only tab. */
  getWorkspacePath(): string | null {
    return this._workspacePath;
  }

  // ── Blocks placeholder ─────────────────────────────────────────────────────

  private _renderBlocks(): void {
    if (!this._contentEl) return;

    const header = $('div', ['sidebar-section-header']);
    header.textContent = 'BLOQUES DE CÓDIGO';
    append(this._contentEl, header);

    const msg = $('div', ['sidebar-placeholder', 'blocks-placeholder']);
    msg.textContent = 'Los bloques están disponibles en el toolbox de Blockly dentro del editor.';
    append(this._contentEl, msg);
  }

  // ── Run & Debug ───────────────────────────────────────────────────────────

  private _renderDebug(): void {
    if (!this._contentEl || !this._runEngine || !this._editor) return;
    this._runPanel?.dispose();
    this._runPanel = new RunPanel(this._contentEl, this._runEngine, this._editor);
  }

  // ── Extensions ────────────────────────────────────────────────────────────

  private _renderExtensions(): void {
    if (!this._contentEl || !this._extensionRegistry) return;
    new ExtensionsPanel(this._contentEl, this._extensionRegistry, new ExtensionStore());
  }

  // ── Mappings ──────────────────────────────────────────────────────────────

  private _renderMappings(): void {
    if (!this._contentEl) return;
    this._mappingsPanel?.dispose();
    this._mappingsPanel = new MappingsPanel(this._contentEl);
  }

  // ── Source Control ───────────────────────────────────────────────────────

  private _renderSourceControl(): void {
    if (!this._contentEl) return;
    this._sourceControlPanel?.dispose();
    this._sourceControlPanel = new SourceControlPanel(
      this._contentEl,
      () => this._workspacePath,
      (path, label) => this._onFileOpen.fire({ path, label }),
      (status) => this._onGitStatusChange.fire(status),
    );
  }

  // ── Explorer ───────────────────────────────────────────────────────────────

  private async _renderExplorer(): Promise<void> {
    if (!this._contentEl) return;
    // Self-clearing (like MappingsPanel/SourceControlPanel's own _render()) rather than
    // relying on the caller: this is now called directly from many places (toolbar
    // buttons, context-menu actions, after create/rename/delete) that aren't routed
    // through showSection()'s clearNode, unlike the original first-render-only version.
    clearNode(this._contentEl);
    this._closeContextMenu();
    this._fileRowElements.clear();
    this._loadedFiles = [];

    const headerRow = $('div', ['sidebar-section-header', 'sidebar-section-header-flex']);
    const title = $('span', ['sidebar-section-header-title']);
    title.textContent = this._workspacePath
      ? this._workspacePath.split(/[\\/]/).pop() ?? 'WORKSPACE'
      : 'WORKSPACE';
    title.title = this._workspacePath ?? '';
    append(headerRow, title);

    if (this._workspacePath) {
      const actions = $('span', ['sidebar-section-header-actions']);
      const ws = this._workspacePath;
      append(actions, this._makeIconBtn(iconNewFile, 'Nuevo archivo…', () => {
        this._pendingCreate = { dirPath: ws, depth: 0, kind: 'file' };
        void this._renderExplorer();
      }));
      append(actions, this._makeIconBtn(iconNewFolder, 'Nueva carpeta…', () => {
        this._pendingCreate = { dirPath: ws, depth: 0, kind: 'dir' };
        void this._renderExplorer();
      }));
      append(actions, this._makeIconBtn(iconRefresh, 'Actualizar', () => void this._renderExplorer()));
      append(actions, this._makeIconBtn(iconCollapseAll, 'Contraer todas las carpetas', () => {
        this._expandedDirs.clear();
        void this._renderExplorer();
      }));
      append(headerRow, actions);
    }
    append(this._contentEl, headerRow);

    if (!this._workspacePath) {
      const btn = $('div', ['sidebar-open-folder-btn']);
      append(btn, createIconElement(iconFolderOpen()));
      btn.append(' Abrir Carpeta');
      btn.addEventListener('click', () => this.openFolder());
      append(this._contentEl, btn);
      return;
    }

    if (this._pendingCreate?.dirPath === this._workspacePath) {
      this._renderCreateInputRow(this._contentEl, this._pendingCreate.depth, this._pendingCreate.kind);
    }

    await this._renderDir(this._workspacePath, this._contentEl, 0);
    this._syncActiveFileHighlight();
  }

  private async _renderDir(
    dirPath: string,
    container: HTMLElement,
    depth: number,
  ): Promise<void> {
    const api = window.electronAPI;
    if (!api) return;

    const result = await api.folderOps.readDir(dirPath);
    if (!result.success) return;

    // Directories first, then files, each alphabetical — matches VS Code Explorer's
    // default sort instead of the raw filesystem-listing order.
    const entries = (result.entries as DirEntry[]).slice().sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      const row = $('div', ['sidebar-file-row']);
      row.style.paddingLeft = `${8 + depth * 14}px`;

      const icon = $('span', ['sidebar-file-icon']);
      const name = $('span', ['sidebar-file-name']);
      name.textContent = entry.name;

      if (entry.isDirectory) {
        const expanded = this._expandedDirs.has(entry.path);
        append(icon, createIconElement(expanded ? iconFolderOpen() : iconFolder()));
        append(row, icon);
        append(row, name);
        container.appendChild(row);

        const children = $('div', ['sidebar-dir-children']);
        if (!expanded) children.style.display = 'none';
        container.appendChild(children);

        const loadChildren = async () => {
          clearNode(children);
          if (this._pendingCreate?.dirPath === entry.path) {
            this._renderCreateInputRow(children, depth + 1, this._pendingCreate.kind);
          }
          await this._renderDir(entry.path, children, depth + 1);
        };
        if (expanded) void loadChildren();

        row.addEventListener('click', async (e) => {
          e.stopPropagation();
          const nowExpanded = this._expandedDirs.has(entry.path);
          if (nowExpanded) {
            this._expandedDirs.delete(entry.path);
            children.style.display = 'none';
            icon.innerHTML = '';
            append(icon, createIconElement(iconFolder()));
          } else {
            this._expandedDirs.add(entry.path);
            await loadChildren();
            children.style.display = '';
            icon.innerHTML = '';
            append(icon, createIconElement(iconFolderOpen()));
          }
        });

        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._showContextMenu(e.clientX, e.clientY, [
            { label: 'Nuevo Archivo…', onClick: () => { this._expandedDirs.add(entry.path); this._pendingCreate = { dirPath: entry.path, depth: depth + 1, kind: 'file' }; void this._renderExplorer(); } },
            { label: 'Nueva Carpeta…', onClick: () => { this._expandedDirs.add(entry.path); this._pendingCreate = { dirPath: entry.path, depth: depth + 1, kind: 'dir' }; void this._renderExplorer(); } },
            { separator: true },
            { label: 'Cambiar Nombre', onClick: () => this._startRename(entry, name) },
            { label: 'Eliminar', danger: true, onClick: () => void this._deleteEntry(entry) },
            { separator: true },
            { label: 'Copiar Ruta', onClick: () => void navigator.clipboard.writeText(entry.path) },
          ]);
        });
      } else {
        append(icon, this._makeFileIcon(entry.name));
        append(row, icon);
        append(row, name);
        container.appendChild(row);
        this._fileRowElements.set(entry.path, row);

        this._loadedFiles.push({ path: entry.path, label: entry.name });

        row.addEventListener('click', () => {
          this._activeFilePath = entry.path;
          this._syncActiveFileHighlight();
          this._onFileOpen.fire({ path: entry.path, label: entry.name });
        });

        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._showContextMenu(e.clientX, e.clientY, [
            { label: 'Cambiar Nombre', onClick: () => this._startRename(entry, name) },
            { label: 'Eliminar', danger: true, onClick: () => void this._deleteEntry(entry) },
            { separator: true },
            { label: 'Copiar Ruta', onClick: () => void navigator.clipboard.writeText(entry.path) },
          ]);
        });
      }
    }
  }

  private _syncActiveFileHighlight(): void {
    this._fileRowElements.forEach((el, path) => {
      el.classList.toggle('active', path === this._activeFilePath);
    });
  }

  // ── Explorer: inline create/rename ──────────────────────────────────────────

  private _renderCreateInputRow(container: HTMLElement, depth: number, kind: 'file' | 'dir'): void {
    const row = $('div', ['sidebar-file-row', 'sidebar-file-row-editing']);
    row.style.paddingLeft = `${8 + depth * 14}px`;
    const icon = $('span', ['sidebar-file-icon']);
    append(icon, createIconElement(kind === 'dir' ? iconFolder() : iconFile()));
    append(row, icon);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sidebar-inline-input';
    input.placeholder = kind === 'dir' ? 'Nombre de carpeta' : 'Nombre de archivo';
    append(row, input);
    // Appended (not prepended): the caller always invokes this before anything else has
    // been added to `container` at this call site — the root case has only the header
    // row already in place (a sibling, not a child, of this list), and the nested-folder
    // case just cleared its children container — so append still lands the input first
    // among this directory's entries, with the real entries appended after it.
    container.appendChild(row);
    input.focus();

    let settled = false;
    const cancel = () => {
      if (settled) return;
      settled = true;
      this._pendingCreate = null;
      void this._renderExplorer();
    };
    const commit = async () => {
      if (settled) return;
      const value = input.value.trim();
      if (!value) { cancel(); return; }
      settled = true;
      const pending = this._pendingCreate;
      this._pendingCreate = null;
      if (!pending) return;
      const api = window.electronAPI;
      if (!api) return;
      const result = pending.kind === 'dir'
        ? await api.folderOps.createDir(pending.dirPath, value)
        : await api.folderOps.createFile(pending.dirPath, value, '');
      if (!result.success) {
        alert(result.error ?? 'No se pudo crear el elemento.');
        await this._renderExplorer();
        return;
      }
      await this._renderExplorer();
      if (pending.kind === 'file' && result.path) {
        this._onFileOpen.fire({ path: result.path, label: value });
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); void commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => void commit());
  }

  private _startRename(entry: DirEntry, nameEl: HTMLElement): void {
    const original = entry.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sidebar-inline-input';
    input.value = original;
    nameEl.replaceWith(input);
    input.focus();
    const dot = original.lastIndexOf('.');
    if (!entry.isDirectory && dot > 0) input.setSelectionRange(0, dot);
    else input.select();

    let settled = false;
    const restore = () => {
      if (settled) return;
      settled = true;
      input.replaceWith(nameEl);
    };
    const commit = async () => {
      if (settled) return;
      const value = input.value.trim();
      if (!value || value === original) { restore(); return; }
      settled = true;
      const api = window.electronAPI;
      if (!api) { input.replaceWith(nameEl); return; }
      const result = await api.folderOps.rename(entry.path, value);
      if (!result.success) {
        alert(result.error ?? 'No se pudo cambiar el nombre.');
      }
      void this._renderExplorer();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); void commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); restore(); }
    });
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('blur', () => void commit());
  }

  private async _deleteEntry(entry: DirEntry): Promise<void> {
    const kind = entry.isDirectory ? 'la carpeta' : 'el archivo';
    if (!confirm(`¿Eliminar ${kind} "${entry.name}"? Se moverá a la papelera de reciclaje.`)) return;
    const api = window.electronAPI;
    if (!api) return;
    const result = await api.folderOps.delete(entry.path);
    if (!result.success) {
      alert(result.error ?? 'No se pudo eliminar.');
      return;
    }
    this._expandedDirs.delete(entry.path);
    await this._renderExplorer();
  }

  // ── Explorer: toolbar + context menu ─────────────────────────────────────────

  private _makeIconBtn(icon: () => string, title: string, onClick: () => void): HTMLElement {
    const btn = $('button', ['sidebar-icon-btn']);
    btn.title = title;
    append(btn, createIconElement(icon()));
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  private _closeContextMenu(): void {
    this._contextMenuEl?.remove();
    this._contextMenuEl = null;
    for (const off of this._contextMenuCloseHandlers) off();
    this._contextMenuCloseHandlers = [];
  }

  private _showContextMenu(
    x: number,
    y: number,
    items: Array<{ label: string; onClick: () => void; danger?: boolean } | { separator: true }>,
  ): void {
    this._closeContextMenu();

    const menu = $('div', ['sidebar-context-menu']);
    for (const item of items) {
      if ('separator' in item) {
        append(menu, $('div', ['sidebar-context-menu-separator']));
        continue;
      }
      const row = $('div', ['sidebar-context-menu-item']);
      if (item.danger) row.classList.add('sidebar-context-menu-item-danger');
      row.textContent = item.label;
      row.addEventListener('click', () => {
        this._closeContextMenu();
        item.onClick();
      });
      append(menu, row);
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.appendChild(menu);
    this._contextMenuEl = menu;

    // Clamp inside the viewport — a menu opened near the right/bottom edge shouldn't
    // render partially off-screen.
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;

    const onDocMouseDown = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) this._closeContextMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this._closeContextMenu();
    };
    // Deferred so the contextmenu event that opened this menu doesn't itself trigger
    // an immediate close via the same mousedown/click cycle.
    setTimeout(() => {
      document.addEventListener('mousedown', onDocMouseDown);
      document.addEventListener('keydown', onKeyDown);
    }, 0);
    this._contextMenuCloseHandlers.push(() => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    });
  }

  // ── Search / Placeholders ─────────────────────────────────────────────────

  private _renderSearch(): void {
    if (!this._contentEl) return;
    const header = $('div', ['sidebar-section-header']);
    header.textContent = 'SEARCH';
    append(this._contentEl, header);
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search';
    input.className = 'sidebar-search-input';
    append(this._contentEl, input);
    const results = $('div', ['sidebar-search-results']);
    results.textContent = 'Type to search…';
    append(this._contentEl, results);
  }

  private _renderPlaceholder(title: string, message: string): void {
    if (!this._contentEl) return;
    const header = $('div', ['sidebar-section-header']);
    header.textContent = title;
    append(this._contentEl, header);
    if (message) {
      const msg = $('div', ['sidebar-placeholder']);
      msg.textContent = message;
      append(this._contentEl, msg);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _makeFileIcon(name: string): HTMLElement {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const codeExts = ['java', 'c', 'cpp', 'h', 'js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go'];
    return createIconElement(codeExts.includes(ext) ? iconFileCode() : iconFile());
  }

  private _renderSTT(): void {
    if (!this._contentEl) return;

    // Create engine/interpreter singletons (persist across section switches so a
    // recording in progress, or a pending init, isn't torn down just by navigating away
    // and back — AIInterpreter itself is now stateless, reading settings live from the
    // shared settingsStore, but keeping one instance around is still the simplest thing).
    if (!this._sttEngine) {
      this._sttEngine = new STTEngine();
    }
    if (!this._aiInterpreter) {
      this._aiInterpreter = new AIInterpreter();
    }

    // Dispose the previous panel's listeners before re-creating (DOM was cleared) — mirrors
    // _renderDebug()'s RunPanel disposal, so switching to STT and back doesn't accumulate
    // stale listeners on the long-lived sttEngine singleton.
    this._sttPanel?.dispose();
    this._sttPanel = new STTPanel(this._contentEl, this._sttEngine, this._aiInterpreter);
    if (this._editor) this._sttPanel.setEditor(this._editor);
  }

  private _renderSettings(): void {
    if (!this._contentEl) return;
    this._settingsPanel?.dispose();
    this._settingsPanel = new SettingsPanel(this._contentEl);
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
    this._element.style.display = 'flex';
    this._element.style.flexDirection = 'column';
  }
}
