import './sidebarPart.css';
import { Part } from '../../part.js';
import { $, append, clearNode } from '../../../base/browser/dom.js';
import { Emitter } from '../../../base/common/event.js';
import type { EditorPart } from '../editor/editorPart.js';
import { STTEngine } from './sttEngine.js';
import { STTPanel } from './sttPanel.js';
import { ExtensionRegistry } from './extensionRegistry.js';
import { ExtensionStore } from './extensionStore.js';
import { ExtensionsPanel } from './extensionsPanel.js';
import { RunEngine } from './runEngine.js';
import { RunPanel } from './runPanel.js';
import { iconFolder, iconFolderOpen, iconFile, iconFileCode, createIconElement } from '../../../base/browser/icons.js';

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
  private _extensionRegistry: ExtensionRegistry | null = null;
  private _runEngine: RunEngine | null = null;
  private _runPanel: RunPanel | null = null;

  private readonly _onFileOpen = this._register(new Emitter<{ path: string; label: string }>());
  readonly onFileOpen = this._onFileOpen.event;

  constructor() {
    super('sidebar', { hasTitle: false, minimumWidth: 200 });
  }

  setEditor(editor: EditorPart): void {
    this._editor = editor;
    this._sttPanel?.setEditor(editor);
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
    this._renderExplorer();
    return container;
  }

  showSection(id: string): void {
    if (!this._contentEl) return;
    clearNode(this._contentEl);
    switch (id) {
      case 'explorer':        this._renderExplorer();    break;
      case 'search':          this._renderSearch();      break;
      case 'blocks':          this._renderBlocks();      break;
      case 'source-control':  this._renderPlaceholder('SOURCE CONTROL', 'No changes detected.'); break;
      case 'debug':           this._renderDebug();       break;
      case 'extensions':      this._renderExtensions(); break;
      case 'stt':             this._renderSTT();         break;
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

  // ── Explorer ───────────────────────────────────────────────────────────────

  private async _renderExplorer(): Promise<void> {
    if (!this._contentEl) return;

    const header = $('div', ['sidebar-section-header']);
    header.textContent = this._workspacePath
      ? this._workspacePath.split(/[\\/]/).pop() ?? 'WORKSPACE'
      : 'WORKSPACE';
    header.title = this._workspacePath ?? '';
    append(this._contentEl, header);

    if (!this._workspacePath) {
      const btn = $('div', ['sidebar-open-folder-btn']);
      append(btn, createIconElement(iconFolderOpen()));
      btn.append(' Abrir Carpeta');
      btn.addEventListener('click', () => this.openFolder());
      append(this._contentEl, btn);
      return;
    }

    await this._renderDir(this._workspacePath, this._contentEl, 0);
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

    for (const entry of result.entries as DirEntry[]) {
      const row = $('div', ['sidebar-file-row']);
      row.style.paddingLeft = `${8 + depth * 14}px`;

      const icon = $('span', ['sidebar-file-icon']);
      const name = $('span', ['sidebar-file-name']);
      name.textContent = entry.name;

      if (entry.isDirectory) {
        append(icon, createIconElement(iconFolder()));
        append(row, icon);
        append(row, name);
        container.appendChild(row);

        const children = $('div', ['sidebar-dir-children']);
        container.appendChild(children);
        let loaded = false;

        row.addEventListener('click', async (e) => {
          e.stopPropagation();
          const open = children.style.display !== 'none';
          if (open) {
            children.style.display = 'none';
            icon.innerHTML = '';
            append(icon, createIconElement(iconFolder()));
          } else {
            if (!loaded) {
              await this._renderDir(entry.path, children, depth + 1);
              loaded = true;
            }
            children.style.display = '';
            icon.innerHTML = '';
            append(icon, createIconElement(iconFolderOpen()));
          }
        });
      } else {
        append(icon, this._makeFileIcon(entry.name));
        append(row, icon);
        append(row, name);
        container.appendChild(row);

        this._loadedFiles.push({ path: entry.path, label: entry.name });

        row.addEventListener('click', () => {
          container.querySelectorAll('.sidebar-file-row.active')
            .forEach(el => el.classList.remove('active'));
          row.classList.add('active');
          this._onFileOpen.fire({ path: entry.path, label: entry.name });
        });
      }
    }
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

    // Create engine singleton (persists across section switches)
    if (!this._sttEngine) {
      this._sttEngine = new STTEngine();
    }

    // Dispose the previous panel's listeners before re-creating (DOM was cleared) — mirrors
    // _renderDebug()'s RunPanel disposal, so switching to STT and back doesn't accumulate
    // stale listeners on the long-lived sttEngine singleton.
    this._sttPanel?.dispose();
    this._sttPanel = new STTPanel(this._contentEl, this._sttEngine);
    if (this._editor) this._sttPanel.setEditor(this._editor);
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
    this._element.style.display = 'flex';
    this._element.style.flexDirection = 'column';
  }
}
