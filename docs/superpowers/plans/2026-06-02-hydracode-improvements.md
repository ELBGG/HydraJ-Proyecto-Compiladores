# HydraCode — Frameless Window, File Ops, Activity Nav, Monaco Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the double-navbar, wire file operations, make the activity bar navigate the sidebar, and replace the textarea with a Monaco editor with syntax highlighting.

**Architecture:** Four independent slices — (1) Electron main/preload IPC for window controls + file I/O, (2) file ops wired into the titlebar renderer, (3) activitybar→sidebar navigation through the layout, (4) Monaco editor replacing the textarea in the split-pane view.

**Tech Stack:** Electron 42, Vite 6, TypeScript 5, monaco-editor (new dependency)

---

## File Map

| File | Action | Summary |
|---|---|---|
| `electron/main.cjs` | Modify | `frame:false`, IPC for window controls + file dialogs |
| `electron/preload.cjs` | Modify | Expose `windowControls` + `fileOps` via contextBridge |
| `src/workbench/parts/titlebar/titlebarPart.ts` | Modify | Window-control buttons, File dropdown, accepts EditorPart |
| `src/workbench/parts/titlebar/titlebarPart.css` | Modify | Window-control button styles, dropdown styles |
| `src/workbench/parts/activitybar/activitybarPart.ts` | Modify | Add `onIconActivate` event emitter |
| `src/workbench/parts/sidebar/sidebarPart.ts` | Modify | Add `showSection(id)` method |
| `src/workbench/layout.ts` | Modify | Add `setSidebarVisible(visible)` method |
| `src/workbench/workbench.ts` | Modify | Wire activitybar→sidebar, keyboard shortcuts, pass editor to titlebar |
| `src/workbench/parts/editor/editorPart.ts` | Modify | Replace textarea with Monaco, add `getContent`/`setContent` |
| `src/workbench/parts/editor/monacoLanguage.ts` | Create | Monaco worker setup + custom Monarch language registration |
| `vite.config.ts` | Modify | Monaco chunk splitting + optimizeDeps |
| `package.json` | Modify | Add `monaco-editor` dependency |

---

## Task 1: Frameless Window

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/workbench/parts/titlebar/titlebarPart.ts`
- Modify: `src/workbench/parts/titlebar/titlebarPart.css`

- [ ] **Step 1: Make the BrowserWindow frameless and store `win` at module scope**

Replace the entire content of `electron/main.cjs` with:

```js
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'HydraCode',
    backgroundColor: '#1e1e1e',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:maximize', () => {
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.on('window:close', () => win?.close());

// ── File operations ──────────────────────────────────────────────────────────
ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Source Files', extensions: ['java', 'c', 'cpp', 'h'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const filePath = result.filePaths[0];
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return { canceled: false, path: filePath, content };
});

ipcMain.handle('file:save', async (_event, { path: filePath, content }) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('file:save-as', async (_event, { content }) => {
  const result = await dialog.showSaveDialog(win, {
    filters: [
      { name: 'Source Files', extensions: ['java', 'c', 'cpp', 'h'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  try {
    await fs.promises.writeFile(result.filePath, content, 'utf-8');
    return { canceled: false, path: result.filePath, success: true };
  } catch (err) {
    return { canceled: true, error: String(err) };
  }
});

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
```

- [ ] **Step 2: Expose window controls and file ops in the preload**

Replace `electron/preload.cjs` with:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },
  fileOps: {
    open:   ()                     => ipcRenderer.invoke('file:open'),
    save:   (filePath, content)    => ipcRenderer.invoke('file:save',    { path: filePath, content }),
    saveAs: (content)              => ipcRenderer.invoke('file:save-as', { content }),
  },
});
```

- [ ] **Step 3: Add window-control buttons to the titlebar**

In `src/workbench/parts/titlebar/titlebarPart.ts`, replace the full file with:

```ts
import './titlebarPart.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';
import type { EditorPart } from '../editor/editorPart.js';

export class TitlebarPart extends Part {
  private _editor: EditorPart | null = null;
  private _currentFilePath: string | null = null;
  private _dropdownOpen: HTMLElement | null = null;

  constructor() {
    super('titlebar', { hasTitle: false, minimumHeight: 35 });
  }

  setEditor(editor: EditorPart): void {
    this._editor = editor;
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['titlebar-content']);
    append(parent, container);

    // ── App icon + drag region ───────────────────────────────────────────
    const appIcon = $('div', ['titlebar-app-icon']);
    appIcon.textContent = '🐉';
    append(container, appIcon);

    // ── Menu ─────────────────────────────────────────────────────────────
    const menu = $('div', ['titlebar-menu']);
    const menuItems: Array<{ label: string; items?: Array<{ label: string; action: () => void } | 'separator'> }> = [
      {
        label: 'File',
        items: [
          { label: 'New File',     action: () => this.onNewFile() },
          { label: 'Open File...', action: () => this.onOpenFile() },
          'separator',
          { label: 'Save',         action: () => this.onSave() },
          { label: 'Save As...',   action: () => this.onSaveAs() },
        ],
      },
      { label: 'Edit' },
      { label: 'Selection' },
      { label: 'View' },
      { label: 'Go' },
      { label: 'Run' },
      { label: 'Terminal' },
      { label: 'Help' },
    ];

    for (const item of menuItems) {
      append(menu, this._buildMenuItem(item));
    }
    append(container, menu);

    // Close all dropdowns on outside click
    document.addEventListener('click', () => this._closeDropdown());

    // ── Center title ──────────────────────────────────────────────────────
    const center = $('div', ['titlebar-center']);
    center.textContent = 'HydraCode';
    append(container, center);

    // ── Window controls ───────────────────────────────────────────────────
    const actions = $('div', ['titlebar-actions']);
    if ((window as any).electronAPI?.isElectron) {
      const defs: Array<{ cls: string; text: string; action: () => void }> = [
        { cls: 'minimize', text: '−', action: () => (window as any).electronAPI.windowControls.minimize() },
        { cls: 'maximize', text: '□', action: () => (window as any).electronAPI.windowControls.maximize() },
        { cls: 'close',    text: '×', action: () => (window as any).electronAPI.windowControls.close() },
      ];
      for (const def of defs) {
        const btn = $('button', ['titlebar-control', def.cls]);
        btn.textContent = def.text;
        btn.title = def.cls.charAt(0).toUpperCase() + def.cls.slice(1);
        btn.addEventListener('click', def.action);
        append(actions, btn);
      }
    }
    append(container, actions);

    return container;
  }

  private _buildMenuItem(item: { label: string; items?: Array<{ label: string; action: () => void } | 'separator'> }): HTMLElement {
    const wrapper = $('div', ['menu-item-wrapper']);

    const span = $('span', ['menu-item']);
    span.textContent = item.label;
    append(wrapper, span);

    if (item.items && item.items.length > 0) {
      const dropdown = $('div', ['menu-dropdown']);

      for (const sub of item.items) {
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

  // ── File actions (also called from workbench keyboard shortcuts) ──────────

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
```

- [ ] **Step 4: Update titlebar CSS — window controls + dropdown**

Replace `src/workbench/parts/titlebar/titlebarPart.css` with:

```css
.titlebar-part {
  background-color: var(--vscode-titleBar-activeBackground);
  color: var(--vscode-titleBar-activeForeground);
  border-bottom: 1px solid var(--vscode-titleBar-border);
  -webkit-app-region: drag;
  user-select: none;
}

.titlebar-content {
  display: flex;
  align-items: center;
  height: 100%;
  width: 100%;
}

/* App icon */
.titlebar-app-icon {
  padding: 0 8px;
  font-size: 16px;
  -webkit-app-region: no-drag;
}

/* Menu bar */
.titlebar-menu {
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

.menu-item-wrapper {
  position: relative;
}

.menu-item {
  display: block;
  padding: 4px 8px;
  font-size: 12px;
  cursor: default;
  border-radius: 3px;
}

.menu-item:hover {
  background-color: var(--vscode-list-hoverBackground);
}

/* Dropdown */
.menu-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  background-color: var(--vscode-menu-background, #252526);
  border: 1px solid var(--vscode-menu-border, #454545);
  border-radius: 3px;
  min-width: 160px;
  z-index: 1000;
  flex-direction: column;
  padding: 4px 0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.menu-dropdown.open {
  display: flex;
}

.menu-dropdown-item {
  padding: 5px 16px;
  font-size: 12px;
  cursor: default;
  white-space: nowrap;
}

.menu-dropdown-item:hover {
  background-color: var(--vscode-list-activeSelectionBackground, #094771);
  color: var(--vscode-list-activeSelectionForeground, #fff);
}

.menu-separator {
  height: 1px;
  background-color: var(--vscode-menu-separatorBackground, #454545);
  margin: 4px 0;
}

/* Center title */
.titlebar-center {
  flex: 1;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  opacity: 0.7;
  pointer-events: none;
}

/* Window controls */
.titlebar-actions {
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
  margin-left: auto;
}

.titlebar-control {
  width: 46px;
  height: 35px;
  border: none;
  background: transparent;
  color: var(--vscode-titleBar-activeForeground);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.titlebar-control:hover {
  background-color: var(--vscode-titleBar-hoverBackground, rgba(255,255,255,0.1));
}

.titlebar-control.close:hover {
  background-color: #e81123;
  color: #fff;
}
```

- [ ] **Step 5: Verify the frameless window works**

Run: `npm run electron:dev`

Expected:
- No native title bar visible — only one dark titlebar row with "🐉 HydraCode File Edit … − □ ×"
- Clicking − minimizes, □ maximizes/restores, × closes
- Dragging the titlebar area (not on buttons/menu) moves the window
- Clicking "File" shows dropdown with New File / Open File / Save / Save As

- [ ] **Step 6: Commit**

```
git add electron/main.cjs electron/preload.cjs src/workbench/parts/titlebar/titlebarPart.ts src/workbench/parts/titlebar/titlebarPart.css
git commit -m "feat: frameless window with HTML controls and File dropdown"
```

---

## Task 2: Wire Editor ↔ Titlebar + Keyboard Shortcuts

**Files:**
- Modify: `src/workbench/parts/editor/editorPart.ts` (add `getContent`/`setContent`)
- Modify: `src/workbench/workbench.ts` (pass editor to titlebar, add keyboard shortcuts)

- [ ] **Step 1: Add `getContent` and `setContent` to EditorPart**

In `src/workbench/parts/editor/editorPart.ts`, add these two public methods directly after the `setLanguage` method (line 57):

```ts
getContent(): string {
  if (this._transpileInput) return this._transpileInput.value;
  return '';
}

setContent(text: string): void {
  if (this._transpileInput) {
    this._transpileInput.value = text;
    // Trigger a re-transpile after setting content
    const event = new Event('input');
    this._transpileInput.dispatchEvent(event);
  }
}
```

- [ ] **Step 2: Store titlebar as a field and wire editor + keyboard shortcuts in Workbench**

In `src/workbench/workbench.ts`, replace the full file with:

```ts
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
  private _editor: EditorPart;
  private _statusbar: StatusbarPart;

  private readonly _onDidLayout = this._register(new Emitter<void>());
  readonly onDidLayout = this._onDidLayout.event;

  constructor(parent: HTMLElement) {
    super();

    applyTheme(vsCodeDark);

    this._layout = new Layout(parent);

    this._titlebar = new TitlebarPart();
    const activitybar = new ActivitybarPart();
    const sidebar = new SidebarPart();
    this._editor = new EditorPart();
    const panel = new PanelPart();
    this._statusbar = new StatusbarPart();

    // Give titlebar a reference to the editor for file ops
    this._titlebar.setEditor(this._editor);

    this._registerParts([
      ['titlebar',     this._titlebar],
      ['activitybar',  activitybar],
      ['sidebar',      sidebar],
      ['editor',       this._editor],
      ['panel',        panel],
      ['statusbar',    this._statusbar],
    ]);

    // Connect statusbar ↔ editor language sync
    this._statusbar.onLanguageChange(({ progLang, humanLang }) => {
      this._editor.setLanguage(progLang, humanLang);
    });

    // Listen for transpile events for status bar feedback
    window.addEventListener('hydracode-transpile', ((e: CustomEvent) => {
      const { success, mapping } = e.detail;
      this._statusbar.setTranspileStatus(
        success ? `✅ ${mapping}` : `❌ ${mapping}`,
      );
    }) as EventListener);

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          this._titlebar.onNewFile();
          break;
        case 'o':
          e.preventDefault();
          this._titlebar.onOpenFile();
          break;
        case 's':
          e.preventDefault();
          if (e.shiftKey) this._titlebar.onSaveAs();
          else this._titlebar.onSave();
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
```

- [ ] **Step 3: Verify file operations work**

Run: `npm run electron:dev`

Expected:
- **File > New File**: clears the editor input
- **File > Open File...**: opens a native OS file dialog; selecting a `.java` file loads its text into the editor and transpiles it
- **File > Save**: if a file was opened, saves it back silently
- **File > Save As...**: shows save dialog, writes the file
- Ctrl+N, Ctrl+O, Ctrl+S work as keyboard shortcuts

- [ ] **Step 4: Commit**

```
git add src/workbench/parts/editor/editorPart.ts src/workbench/workbench.ts
git commit -m "feat: wire file ops between titlebar and editor, add keyboard shortcuts"
```

---

## Task 3: Activity Bar Navigation

**Files:**
- Modify: `src/workbench/parts/activitybar/activitybarPart.ts`
- Modify: `src/workbench/parts/sidebar/sidebarPart.ts`
- Modify: `src/workbench/layout.ts`
- Modify: `src/workbench/workbench.ts`

- [ ] **Step 1: Add `onIconActivate` emitter to ActivitybarPart**

In `src/workbench/parts/activitybar/activitybarPart.ts`, add the import and emitter. Replace the full file:

```ts
import './activitybarPart.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';
import { Emitter } from '../../../base/common/event.js';

interface ActivityBarItem {
  id: string;
  icon: string;
  label: string;
  badge?: string;
}

export class ActivitybarPart extends Part {
  private _activeId: string | null = 'explorer';
  private _items: ActivityBarItem[] = [
    { id: 'explorer',      icon: '📁', label: 'Explorer' },
    { id: 'search',        icon: '🔍', label: 'Search' },
    { id: 'source-control',icon: '🔀', label: 'Source Control' },
    { id: 'debug',         icon: '▶',  label: 'Run and Debug' },
    { id: 'extensions',    icon: '▢',  label: 'Extensions' },
  ];

  private _bottomItems: ActivityBarItem[] = [
    { id: 'accounts', icon: '👤', label: 'Accounts' },
    { id: 'settings', icon: '⚙',  label: 'Settings' },
  ];

  private _iconElements = new Map<string, HTMLElement>();

  private readonly _onIconActivate = this._register(new Emitter<string>());
  readonly onIconActivate = this._onIconActivate.event;

  constructor() {
    super('activitybar', { hasTitle: false, minimumWidth: 48 });
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['activitybar-content']);
    append(parent, container);

    const top = $('div', ['activitybar-top']);
    for (const item of this._items) append(top, this._createIcon(item));
    append(container, top);

    const bottom = $('div', ['activitybar-bottom']);
    for (const item of this._bottomItems) append(bottom, this._createIcon(item));
    append(container, bottom);

    return container;
  }

  private _createIcon(item: ActivityBarItem): HTMLElement {
    const el = $('div', ['activitybar-icon']);
    if (item.id === this._activeId) el.classList.add('active');
    el.title = item.label;
    el.textContent = item.icon;
    el.dataset.id = item.id;

    if (item.badge) {
      const badge = $('div', ['badge']);
      badge.textContent = item.badge;
      append(el, badge);
    }

    el.addEventListener('click', () => this._onIconClick(item.id));
    this._iconElements.set(item.id, el);
    return el;
  }

  private _onIconClick(id: string): void {
    this._iconElements.forEach((el, key) => el.classList.toggle('active', key === id));
    this._activeId = id;
    this._onIconActivate.fire(id);
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    this._element.style.display = 'flex';
    this._element.style.flexDirection = 'column';
  }
}
```

- [ ] **Step 2: Add `showSection` to SidebarPart**

Replace `src/workbench/parts/sidebar/sidebarPart.ts` with:

```ts
import './sidebarPart.css';
import { Part } from '../../part.js';
import { $, append, clearNode } from '../../../base/browser/dom.js';

interface TreeItem {
  label: string;
  icon?: string;
}

export class SidebarPart extends Part {
  private _contentEl: HTMLElement | null = null;

  constructor() {
    super('sidebar', { hasTitle: false, minimumWidth: 200 });
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
      case 'explorer':      this._renderExplorer();    break;
      case 'search':        this._renderSearch();      break;
      case 'source-control':this._renderPlaceholder('SOURCE CONTROL', 'No changes detected.'); break;
      case 'debug':         this._renderPlaceholder('RUN AND DEBUG', 'No launch configuration.'); break;
      case 'extensions':    this._renderPlaceholder('EXTENSIONS', 'No extensions installed.'); break;
      default:              this._renderPlaceholder(id.toUpperCase(), ''); break;
    }
  }

  private _renderExplorer(): void {
    if (!this._contentEl) return;
    const items: TreeItem[] = [
      { label: 'src',           icon: '📁' },
      { label: 'electron',      icon: '📁' },
      { label: 'index.html',    icon: '📄' },
      { label: 'package.json',  icon: '📄' },
      { label: 'tsconfig.json', icon: '📄' },
      { label: 'vite.config.ts',icon: '📄' },
    ];
    this._renderSection('WORKSPACE', items);
  }

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

  private _renderSection(label: string, items: TreeItem[]): void {
    if (!this._contentEl) return;
    const section = $('div', ['sidebar-section']);
    const header = $('div', ['sidebar-section-header']);
    header.textContent = label;
    append(section, header);

    for (const item of items) {
      const el = $('div', ['sidebar-item']);
      if (item.icon) {
        const icon = document.createElement('span');
        icon.textContent = `${item.icon} `;
        icon.style.marginRight = '4px';
        append(el, icon);
      }
      const lbl = document.createElement('span');
      lbl.textContent = item.label;
      append(el, lbl);
      el.addEventListener('click', () => {
        section.querySelectorAll('.sidebar-item').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
      });
      append(section, el);
    }
    append(this._contentEl, section);
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
    this._element.style.display = 'flex';
    this._element.style.flexDirection = 'column';
  }
}
```

- [ ] **Step 3: Add `setSidebarVisible` to Layout**

In `src/workbench/layout.ts`, add a `_sidebarVisible` field and the method. Replace the full file:

```ts
import './layout.css';
import { Disposable, DisposableStore } from '../base/common/lifecycle.js';
import { Emitter } from '../base/common/event.js';
import { $, addDisposableListener, getClientArea } from '../base/browser/dom.js';
import { Part } from './part.js';

export type PartLocation = 'titlebar' | 'activitybar' | 'sidebar' | 'editor' | 'panel' | 'statusbar';

export class Layout extends Disposable {
  private _element: HTMLElement;
  private _parts = new Map<PartLocation, Part>();
  private _titleBarContainer: HTMLElement;
  private _bodyContainer: HTMLElement;
  private _mainContainer: HTMLElement;
  private _panelContainer: HTMLElement;
  private _statusBarContainer: HTMLElement;
  private _resizeListeners = new DisposableStore();
  private _sidebarVisible = true;

  private readonly _onDidChange = this._register(new Emitter<void>());
  readonly onDidChange = this._onDidChange.event;

  constructor(parent: HTMLElement) {
    super();

    this._element = $('div', ['hydra-workbench']);
    parent.appendChild(this._element);

    this._titleBarContainer  = $('div', ['part', 'titlebar-container']);
    this._bodyContainer      = $('div', ['body-container']);
    this._mainContainer      = $('div', ['main-container']);
    this._panelContainer     = $('div', ['part', 'panel-container']);
    this._statusBarContainer = $('div', ['part', 'statusbar-container']);

    this._element.appendChild(this._titleBarContainer);
    this._element.appendChild(this._bodyContainer);
    this._element.appendChild(this._statusBarContainer);

    this._bodyContainer.appendChild(this._mainContainer);
    this._bodyContainer.appendChild(this._panelContainer);

    this._register(
      addDisposableListener(window, 'resize', () => this._layoutParts()),
    );
  }

  get element(): HTMLElement { return this._element; }

  registerPart(location: PartLocation, part: Part): void {
    this._parts.set(location, part);
    switch (location) {
      case 'titlebar':   part.create(this._titleBarContainer); break;
      case 'activitybar':
      case 'sidebar':
      case 'editor':     part.create(this._mainContainer);    break;
      case 'panel':      part.create(this._panelContainer);   break;
      case 'statusbar':  part.create(this._statusBarContainer); break;
    }
  }

  setSidebarVisible(visible: boolean): void {
    this._sidebarVisible = visible;
    const sidebar = this._parts.get('sidebar');
    if (sidebar) sidebar.element.style.display = visible ? '' : 'none';
    this._layoutParts();
  }

  private _layoutParts(): void {
    const rootSize = getClientArea(this._element);
    if (rootSize.width <= 0 || rootSize.height <= 0) return;

    const titlebar    = this._parts.get('titlebar');
    const statusbar   = this._parts.get('statusbar');
    const panel       = this._parts.get('panel');
    const activitybar = this._parts.get('activitybar');
    const sidebar     = this._parts.get('sidebar');
    const editor      = this._parts.get('editor');

    const titlebarHeight  = titlebar ? 35 : 0;
    const statusbarHeight = statusbar ? 22 : 0;
    const bodyHeight      = rootSize.height - titlebarHeight - statusbarHeight;

    const activitybarWidth = activitybar ? 48 : 0;
    const sidebarWidth     = (sidebar && this._sidebarVisible) ? Math.max(170, rootSize.width * 0.2) : 0;
    const editorWidth      = rootSize.width - activitybarWidth - sidebarWidth;

    if (titlebar)    titlebar.layout(rootSize.width, titlebarHeight);
    if (activitybar) activitybar.layout(activitybarWidth, bodyHeight);
    if (sidebar)     sidebar.layout(sidebarWidth, bodyHeight);
    if (editor)      editor.layout(editorWidth, bodyHeight);
    if (panel)       panel.layout(rootSize.width, 0);
    if (statusbar)   statusbar.layout(rootSize.width, statusbarHeight);
  }

  layout(): void { this._layoutParts(); }
}
```

- [ ] **Step 4: Wire activitybar → sidebar in Workbench**

In `src/workbench/workbench.ts`, add sidebar/activitybar wiring inside the constructor, after `_registerParts`. Find and replace just the parts-wiring block (add after the existing statusbar language-change subscription):

```ts
// Activity bar → sidebar section switching (toggle on double-click of same icon)
let _lastActiveId: string | null = 'explorer';
activitybar.onIconActivate((id) => {
  if (id === _lastActiveId) {
    this._layout.setSidebarVisible(false);
    _lastActiveId = null;
  } else {
    sidebar.showSection(id);
    this._layout.setSidebarVisible(true);
    _lastActiveId = id;
  }
});
```

To make this compile, `activitybar` and `sidebar` need to be accessible — change their declarations from `const` to named variables that are still visible in the block. The full updated `workbench.ts` is:

```ts
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
  private _editor: EditorPart;
  private _statusbar: StatusbarPart;

  private readonly _onDidLayout = this._register(new Emitter<void>());
  readonly onDidLayout = this._onDidLayout.event;

  constructor(parent: HTMLElement) {
    super();

    applyTheme(vsCodeDark);

    this._layout = new Layout(parent);

    this._titlebar = new TitlebarPart();
    const activitybar = new ActivitybarPart();
    const sidebar = new SidebarPart();
    this._editor = new EditorPart();
    const panel = new PanelPart();
    this._statusbar = new StatusbarPart();

    this._titlebar.setEditor(this._editor);

    this._registerParts([
      ['titlebar',     this._titlebar],
      ['activitybar',  activitybar],
      ['sidebar',      sidebar],
      ['editor',       this._editor],
      ['panel',        panel],
      ['statusbar',    this._statusbar],
    ]);

    // Statusbar ↔ editor language sync
    this._statusbar.onLanguageChange(({ progLang, humanLang }) => {
      this._editor.setLanguage(progLang, humanLang);
    });

    // Transpile status display
    window.addEventListener('hydracode-transpile', ((e: CustomEvent) => {
      const { success, mapping } = e.detail;
      this._statusbar.setTranspileStatus(success ? `✅ ${mapping}` : `❌ ${mapping}`);
    }) as EventListener);

    // Activity bar → sidebar
    let _lastActiveId: string | null = 'explorer';
    activitybar.onIconActivate((id) => {
      if (id === _lastActiveId) {
        this._layout.setSidebarVisible(false);
        _lastActiveId = null;
      } else {
        sidebar.showSection(id);
        this._layout.setSidebarVisible(true);
        _lastActiveId = id;
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 'n': e.preventDefault(); this._titlebar.onNewFile();   break;
        case 'o': e.preventDefault(); this._titlebar.onOpenFile();  break;
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
```

- [ ] **Step 5: Verify activity bar navigation**

Run: `npm run electron:dev`

Expected:
- Clicking 📁 (Explorer): sidebar shows file tree
- Clicking 🔍 (Search): sidebar shows search input
- Clicking ▶ (Debug): sidebar shows "RUN AND DEBUG / No launch configuration."
- Clicking the **same icon again**: sidebar collapses
- Clicking a different icon: sidebar switches section and stays open

- [ ] **Step 6: Commit**

```
git add src/workbench/parts/activitybar/activitybarPart.ts src/workbench/parts/sidebar/sidebarPart.ts src/workbench/layout.ts src/workbench/workbench.ts
git commit -m "feat: activity bar toggles sidebar sections"
```

---

## Task 4: Install Monaco Editor

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/workbench/parts/editor/monacoLanguage.ts`

- [ ] **Step 1: Install monaco-editor**

```
npm install monaco-editor
```

Expected: `monaco-editor` appears in `package.json` dependencies.

- [ ] **Step 2: Update vite.config.ts for Monaco workers**

Replace `vite.config.ts` with:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['monaco-editor'],
  },
});
```

- [ ] **Step 3: Create `monacoLanguage.ts` — worker setup + language registration**

Create `src/workbench/parts/editor/monacoLanguage.ts`:

```ts
import * as monaco from 'monaco-editor';
import type { IHumanLanguageMapping } from '../../../languages/index.js';

// Set up Monaco web worker — must run before any editor is created
(self as any).MonacoEnvironment = {
  getWorker(_workerId: string, _label: string): Worker {
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker', import.meta.url),
      { type: 'module' },
    );
  },
};

const _registered = new Set<string>();

export function getHydraLangId(progLang: string, humanLang: string): string {
  return `hydra-${progLang}-${humanLang}`;
}

export function ensureHydraLanguage(
  progLang: string,
  humanLang: string,
  mapping: IHumanLanguageMapping,
): void {
  const id = getHydraLangId(progLang, humanLang);
  if (_registered.has(id)) return;
  _registered.add(id);

  monaco.languages.register({ id });

  const keywords  = Object.keys(mapping.keywords);
  const modifiers = Object.keys(mapping.modifiers);
  const types     = Object.keys(mapping.types);
  const literals  = Object.keys(mapping.literals);

  monaco.languages.setMonarchTokensProvider(id, {
    keywords,
    modifiers,
    types,
    literals,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\d+(\.\d+)?([eE][+-]?\d+)?[fFdDlL]?/, 'number'],
        [/[{}()\[\]]/, 'delimiter.bracket'],
        [/[;,.]/, 'delimiter'],
        [/[a-zA-Z_áéíóúñüÁÉÍÓÚÑÜ]\w*/, {
          cases: {
            '@keywords':  'keyword',
            '@modifiers': 'keyword.modifier',
            '@types':     'type',
            '@literals':  'constant.language',
            '@default':   'identifier',
          },
        }],
        [/\s+/, 'white'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  } as monaco.languages.IMonarchLanguage);
}
```

- [ ] **Step 4: Verify Monaco builds without errors**

Run: `npm run build`

Expected: No TypeScript or bundler errors. The `dist/` output includes a `monaco-<hash>.js` chunk.

- [ ] **Step 5: Commit**

```
git add package.json package-lock.json vite.config.ts src/workbench/parts/editor/monacoLanguage.ts
git commit -m "feat: add monaco-editor dependency and language registration helper"
```

---

## Task 5: Replace Textarea with Monaco Editor

**Files:**
- Modify: `src/workbench/parts/editor/editorPart.ts`

- [ ] **Step 1: Rewrite editorPart.ts to use Monaco**

Replace the full content of `src/workbench/parts/editor/editorPart.ts` with:

```ts
import './editorPart.css';
import './transpileEditor.css';
import * as monaco from 'monaco-editor';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';
import { TranspilerEngine, LanguageRegistry } from '../../../languages/index.js';
import { ensureHydraLanguage, getHydraLangId } from './monacoLanguage.js';

interface EditorTab {
  id: string;
  label: string;
  icon?: string;
}

const DEFAULT_SPANISH_JAVA = [
  '// HydraCode - Java en Español',
  '// Escribe código Java usando palabras clave en español',
  '',
  'clase HolaMundo {',
  '    publico estatico vacio principal(cadena[] argumentos) {',
  '        sistema.imprimir("Hola desde HydraCode en español!");',
  '',
  '        entero numero = 42;',
  '        si (numero > 10) {',
  '            sistema.imprimir("El número es mayor que 10");',
  '        } sino {',
  '            sistema.imprimir("El número es menor o igual a 10");',
  '        }',
  '',
  '        para (entero i = 0; i < 5; i++) {',
  '            sistema.imprimir("Iteración: " + i);',
  '        }',
  '    }',
  '}',
].join('\n');

export class EditorPart extends Part {
  private _tabs: EditorTab[] = [
    { id: 'readme', label: 'README.md',             icon: '📖' },
    { id: 'main',   label: 'transpile/Main.java',   icon: '📄' },
  ];
  private _activeTabId = 'readme';
  private _tabElements = new Map<string, HTMLElement>();
  private _tabsContainer: HTMLElement | null = null;
  private _bodyContainer: HTMLElement | null = null;
  private _transpileOutput: HTMLElement | null = null;
  private _transpileBtn: HTMLElement | null = null;
  private _monacoEditor: monaco.editor.IStandaloneCodeEditor | null = null;
  private _currentProgLang = 'java';
  private _currentHumanLang = 'es';

  constructor() {
    super('editor', { hasTitle: false });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getContent(): string {
    return this._monacoEditor?.getValue() ?? '';
  }

  setContent(text: string): void {
    if (this._monacoEditor) {
      this._monacoEditor.setValue(text);
    }
  }

  setLanguage(progLang: string, humanLang: string): void {
    this._currentProgLang = progLang;
    this._currentHumanLang = humanLang;
    this._updateEditorLanguage();
  }

  // ── Part lifecycle ────────────────────────────────────────────────────────

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['editor-content']);
    append(parent, container);

    this._tabsContainer = $('div', ['editor-tabs']);
    append(container, this._tabsContainer);

    this._bodyContainer = $('div', ['editor-body']);
    append(container, this._bodyContainer);

    for (const tab of this._tabs) this._addTab(tab);
    this._showWelcome();

    return container;
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  private _addTab(tab: EditorTab): void {
    if (!this._tabsContainer) return;

    const tabEl = $('div', ['editor-tab']);
    if (tab.id === this._activeTabId) tabEl.classList.add('active');

    if (tab.icon) {
      const icon = document.createElement('span');
      icon.textContent = tab.icon;
      icon.style.fontSize = '14px';
      append(tabEl, icon);
    }

    const label = document.createElement('span');
    label.textContent = tab.label;
    append(tabEl, label);

    const close = $('div', ['tab-close']);
    close.textContent = '✕';
    close.addEventListener('click', (e) => { e.stopPropagation(); this._closeTab(tab.id); });

    append(tabEl, close);
    tabEl.addEventListener('click', () => this._activateTab(tab.id));
    this._tabElements.set(tab.id, tabEl);
    append(this._tabsContainer, tabEl);
  }

  private _activateTab(id: string): void {
    this._activeTabId = id;
    this._tabElements.forEach((el, key) => el.classList.toggle('active', key === id));
    this._showTabContent(id);
  }

  private _closeTab(id: string): void {
    if (this._tabs.length <= 1) return;
    const idx = this._tabs.findIndex(t => t.id === id);
    this._tabElements.get(id)?.remove();
    this._tabElements.delete(id);
    this._tabs = this._tabs.filter(t => t.id !== id);
    if (this._activeTabId === id) {
      this._activateTab(this._tabs[Math.min(idx, this._tabs.length - 1)].id);
    }
  }

  private _showTabContent(id: string): void {
    if (!this._bodyContainer) return;
    // Dispose Monaco before clearing the DOM
    if (this._monacoEditor) {
      this._monacoEditor.dispose();
      this._monacoEditor = null;
    }
    this._bodyContainer.innerHTML = '';
    if (id === 'readme') this._showWelcome();
    else this._showTranspileEditor();
  }

  // ── Welcome screen ────────────────────────────────────────────────────────

  private _showWelcome(): void {
    if (!this._bodyContainer) return;

    const welcome = $('div', ['editor-welcome']);
    append(this._bodyContainer, welcome);

    const h1 = document.createElement('h1');
    h1.textContent = 'HydraCode';
    append(welcome, h1);

    const p1 = document.createElement('p');
    p1.textContent = 'El editor de código multilenguaje.';
    append(welcome, p1);

    const p2 = document.createElement('p');
    p2.textContent = 'Escribe en tu idioma. Haz clic en "Main.java" para probar Java en Español.';
    append(welcome, p2);

    const demo = $('div', ['demo-card']);
    demo.textContent = [
      '// Java en Español example:',
      'clase HolaMundo {',
      '    publico estatico vacio principal(cadena[] args) {',
      '        sistema.imprimir("Hola Mundo!");',
      '    }',
      '}',
    ].join('\n');

    const arrow = document.createElement('div');
    arrow.className = 'arrow';
    arrow.textContent = '→ Transpila a Java estándar automáticamente';
    append(demo, arrow);
    append(welcome, demo);
  }

  // ── Transpile editor ──────────────────────────────────────────────────────

  private _showTranspileEditor(): void {
    if (!this._bodyContainer) return;

    const container = $('div', ['transpile-container']);
    append(this._bodyContainer, container);

    // Header
    const header = $('div', ['transpile-header']);
    const label = $('span', ['transpile-label']);
    label.textContent = `🔄 ${this._currentProgLang.toUpperCase()} (${this._currentHumanLang.toUpperCase()} → EN)`;
    append(header, label);

    this._transpileBtn = $('button', ['transpile-btn']);
    this._transpileBtn.textContent = '▶ Transpile';
    append(header, this._transpileBtn);
    append(container, header);

    // Split panes
    const split = $('div', ['transpile-split']);
    append(container, split);

    // ── Input pane (Monaco) ───────────────────────────────────────────────
    const inputPane = $('div', ['transpile-pane']);

    const inputLabel = $('div', ['transpile-pane-label']);
    inputLabel.textContent = `✏ Input (${this._currentHumanLang.toUpperCase()})`;
    append(inputPane, inputLabel);

    const editorHost = $('div', ['monaco-editor-host']);
    append(inputPane, editorHost);
    append(split, inputPane);

    // ── Output pane ───────────────────────────────────────────────────────
    const outputPane = $('div', ['transpile-pane']);

    const outputLabel = $('div', ['transpile-pane-label']);
    outputLabel.textContent = '📋 Output (EN)';
    append(outputPane, outputLabel);

    this._transpileOutput = $('div', ['transpile-output']);
    append(outputPane, this._transpileOutput);
    append(split, outputPane);

    // ── Create Monaco editor ──────────────────────────────────────────────
    const mapping = LanguageRegistry.getMapping(this._currentProgLang, this._currentHumanLang);
    if (mapping) ensureHydraLanguage(this._currentProgLang, this._currentHumanLang, mapping);
    const langId = mapping ? getHydraLangId(this._currentProgLang, this._currentHumanLang) : 'plaintext';

    this._monacoEditor = monaco.editor.create(editorHost, {
      value: this._getSampleCode(),
      language: langId,
      theme: 'vs-dark',
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      minimap: { enabled: false },
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
      tabSize: 4,
    });

    // Wire events
    this._transpileBtn.addEventListener('click', () => this._doTranspile());

    let debounce: ReturnType<typeof setTimeout> | null = null;
    this._monacoEditor.onDidChangeModelContent(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => this._doTranspile(), 300);
    });

    this._doTranspile();
  }

  private _updateEditorLanguage(): void {
    if (!this._monacoEditor) return;
    const mapping = LanguageRegistry.getMapping(this._currentProgLang, this._currentHumanLang);
    if (mapping) ensureHydraLanguage(this._currentProgLang, this._currentHumanLang, mapping);
    const langId = mapping ? getHydraLangId(this._currentProgLang, this._currentHumanLang) : 'plaintext';
    const model = this._monacoEditor.getModel();
    if (model) monaco.editor.setModelLanguage(model, langId);
    this._doTranspile();
  }

  private _getSampleCode(): string {
    if (this._currentProgLang === 'java' && this._currentHumanLang === 'es') {
      return DEFAULT_SPANISH_JAVA;
    }
    return `// ${this._currentProgLang.toUpperCase()} code\n// No mapping for "${this._currentHumanLang}" yet`;
  }

  private _doTranspile(): void {
    if (!this._transpileOutput || !this._transpileBtn) return;

    const engine = new TranspilerEngine();
    const result = engine.transpile({
      code: this.getContent(),
      languageId: this._currentProgLang,
      humanLanguageId: this._currentHumanLang,
    });

    this._transpileOutput.textContent = result.success
      ? result.output
      : `// Transpile error:\n// ${result.error}\n\n${result.output}`;

    this._transpileBtn.style.background = result.success
      ? 'var(--vscode-button-background)'
      : 'var(--vscode-errorForeground)';

    window.dispatchEvent(new CustomEvent('hydracode-transpile', {
      detail: {
        success: result.success,
        mapping: `${this._currentHumanLang.toUpperCase()} → ${this._currentProgLang.toUpperCase()}`,
      },
    }));
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.flex = '1';
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
    this._monacoEditor?.layout();
  }
}
```

- [ ] **Step 2: Add Monaco host styles to editorPart.css**

Open `src/workbench/parts/editor/editorPart.css` and append:

```css
.monaco-editor-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

- [ ] **Step 3: Verify Monaco editor renders and transpiles**

Run: `npm run electron:dev`

Expected:
- Clicking the "transpile/Main.java" tab opens the split pane
- Left pane shows a Monaco editor with line numbers and syntax-highlighted Spanish Java keywords (keywords in blue/purple, types in green, comments in grey)
- Typing in the editor triggers a re-transpile after 300ms
- Output pane shows valid Java English output
- Clicking "▶ Transpile" button manually re-runs
- Changing language via the status bar (📝 Java / 🌐 ES items at the bottom) updates the editor highlighting

- [ ] **Step 4: Verify build is clean**

Run: `npm run build`

Expected: TypeScript compiles with 0 errors, Vite bundles without warnings about unresolved workers.

- [ ] **Step 5: Commit**

```
git add src/workbench/parts/editor/editorPart.ts src/workbench/parts/editor/editorPart.css
git commit -m "feat: replace textarea with Monaco editor, syntax highlighting for Spanish Java"
```

---

## Self-Review Checklist

### Spec coverage
- [x] Frameless window + HTML window controls → Task 1
- [x] IPC for file open/save/save-as → Task 1 (main.cjs) + Task 2 (renderer wiring)
- [x] `getContent` / `setContent` on EditorPart → Task 2 Step 1 + Task 5
- [x] File menu dropdown → Task 1 Step 3 (`titlebarPart.ts`)
- [x] Keyboard shortcuts Ctrl+N/O/S → Task 3 Step 4 (`workbench.ts`)
- [x] `onIconActivate` emitter on activitybar → Task 3 Step 1
- [x] `showSection` on sidebar → Task 3 Step 2
- [x] `setSidebarVisible` on layout → Task 3 Step 3
- [x] Wire activitybar → sidebar toggle in workbench → Task 3 Step 4
- [x] Monaco install + Vite config → Task 4
- [x] `monacoLanguage.ts` with `ensureHydraLanguage` → Task 4 Step 3
- [x] Monaco editor in editorPart replacing textarea → Task 5
- [x] `_updateEditorLanguage` called on `setLanguage` → Task 5 Step 1

### Type consistency check
- `getContent()` / `setContent(text)` defined in Task 2 Step 1 AND used in Task 1 Step 3 (titlebar) ✓
- `ensureHydraLanguage(progLang, humanLang, mapping)` defined in Task 4 Step 3, called with same signature in Task 5 Step 1 ✓
- `getHydraLangId(progLang, humanLang)` same ✓
- `onIconActivate` fires `string`, workbench subscribes `(id: string)` ✓
- `setSidebarVisible(visible: boolean)` defined Task 3 Step 3, called Task 3 Step 4 ✓
- `sidebar.showSection(id)` defined Task 3 Step 2, called Task 3 Step 4 ✓
- `titlebar.setEditor(editor)` defined Task 1 Step 3, called Task 2 Step 2 ✓
