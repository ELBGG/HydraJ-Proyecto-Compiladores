# HydraCode — Frameless Window, File Ops, Activity Nav, Monaco Editor

**Date:** 2026-06-02  
**Status:** Approved

---

## Context

HydraCode is an Electron + Vite + TypeScript IDE for Java, C, and C++ that transpiles code written in natural-language keywords (e.g. Spanish) into standard English source code. The current build has four issues to resolve:

1. A **double navbar** — the native Electron title bar and the custom HTML titlebar both render simultaneously.
2. **File menu items are inert** — New / Open / Save have no implementation.
3. **Activity bar icons don't navigate** — clicking them has no effect on the sidebar.
4. **Editor is a plain `<textarea>`** — no syntax highlighting or line numbers.

---

## Scope

| Feature | Included |
|---|---|
| Frameless window with HTML window controls | ✅ |
| File operations (New / Open / Save / Save As) via Electron dialogs | ✅ |
| Activity bar → sidebar section switching + toggle | ✅ |
| Monaco Editor replacing the textarea in the input pane | ✅ |
| C / C++ Spanish language mappings | ❌ (future) |

---

## Architecture

### 1. Frameless Window

**Goal:** Remove the native OS title bar so only the single custom HTML titlebar is visible.

**Changes:**

- `electron/main.cjs` — Add `frame: false` to `BrowserWindow` options. Add three `ipcMain.on` listeners: `window:minimize`, `window:maximize`, `window:close` that call the corresponding `BrowserWindow` methods.
- `electron/preload.cjs` — Extend the `contextBridge` exposure to include `windowControls: { minimize, maximize, close }` using `ipcRenderer.send`.
- `src/workbench/parts/titlebar/titlebarPart.ts` — Populate the already-existing `titlebar-actions` div with three `<button>` elements (−, □, ×). Each calls `(window as any).api.windowControls.*`. The titlebar root already has `-webkit-app-region: drag`; the actions div already has `-webkit-app-region: no-drag`.
- `src/workbench/parts/titlebar/titlebarPart.css` — Style the three window control buttons to match the VS Code dark theme (hover colors, sizes).

**No changes needed** to `layout.ts`, `workbench.ts`, or any other part.

---

### 2. File Operations

**Goal:** Wire the File menu items and keyboard shortcuts to real file I/O via Electron's native dialogs.

**IPC channels (main process):**

| Channel | Direction | Description |
|---|---|---|
| `file:open` | renderer → main | Shows `showOpenDialog`, reads file, returns `{ path, content }` |
| `file:save` | renderer → main | Writes `{ path, content }` to disk, returns `{ success }` |
| `file:save-as` | renderer → main | Shows `showSaveDialog`, writes content, returns `{ path, success }` |

**Changes:**

- `electron/main.cjs` — Add `ipcMain.handle` for the three channels above. Uses `dialog` and `fs.promises` (Node built-in).
- `electron/preload.cjs` — Add `fileOps: { open, save(path, content), saveAs(content) }` to the `contextBridge` exposure using `ipcRenderer.invoke`.
- `src/workbench/parts/editor/editorPart.ts` — Add `getContent(): string` and `setContent(text: string): void` methods (no file-path awareness — the editor only owns text).
- `src/workbench/parts/titlebar/titlebarPart.ts` — Accept an `EditorPart` reference in the constructor. Track `_currentFilePath: string | null` here (the titlebar owns file-session state). Wire each menu span click:
  - **File > New** → calls `editor.setContent('')`, sets `_currentFilePath = null`.
  - **File > Open** → calls `api.fileOps.open()`, then `editor.setContent(result.content)`, sets `_currentFilePath = result.path`.
  - **File > Save** → if `_currentFilePath` exists, calls `api.fileOps.save(_currentFilePath, editor.getContent())`; otherwise falls back to Save As.
  - **File > Save As** → calls `api.fileOps.saveAs(editor.getContent())`, updates `_currentFilePath = result.path`.
- `src/workbench/workbench.ts` — Pass the `EditorPart` instance to `TitlebarPart` constructor.
- **Keyboard shortcuts** — Register a single `keydown` listener in `workbench.ts` for Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+Shift+S that delegates to the titlebar's file action methods.

---

### 3. Activity Bar Navigation

**Goal:** Clicking activity bar icons switches the sidebar content; clicking the active icon again collapses the sidebar.

**Changes:**

- `src/workbench/parts/activitybar/activitybarPart.ts` — Add an `onIconActivate` event emitter (type: `Emitter<string>`) following the same pattern as `StatusbarPart.onLanguageChange`. Fire it in `_onIconClick` with the icon id. Track `_activeId`; firing the same id twice means "toggle off".
- `src/workbench/parts/sidebar/sidebarPart.ts` — Add `showSection(id: string): void` that re-renders the sidebar content for:
  - `'explorer'` — existing file tree items (current behavior).
  - `'search'` — a text `<input>` for search term + empty results placeholder.
  - `'debug'` — a simple "Run and Debug" placeholder panel.
  - Any unknown id — hides the sidebar content.
- `src/workbench/layout.ts` — Add `setSidebarVisible(visible: boolean): void` that sets `sidebarWidth` to 0 (hidden) or the calculated width (visible) and re-runs `_layoutParts()`.
- `src/workbench/workbench.ts` — Subscribe `activitybar.onIconActivate`:
  - If the id differs from the last active id → `sidebar.showSection(id)`, `layout.setSidebarVisible(true)`.
  - If the id matches the last active id → `layout.setSidebarVisible(false)`, clear active id.

---

### 4. Monaco Editor

**Goal:** Replace the `<textarea>` in the input pane with a Monaco editor instance that highlights the current human-language keywords.

**Dependencies:**

- `npm install monaco-editor`
- `npm install vite-plugin-monaco-editor --save-dev`

**`vite.config.ts`:** Register `monacoEditorPlugin` so Monaco's web workers are bundled correctly for Electron's renderer process.

**Language registration (called once on workbench init):**

A new file `src/workbench/parts/editor/monacoLanguage.ts` exposes `registerHydraLanguage(languageId, mapping)`:
1. Calls `monaco.languages.register({ id: languageId })`.
2. Calls `monaco.languages.setMonarchTokensProvider` with a tokenizer built from the mapping's `keywords`, `types`, `modifiers`, and `literals` arrays. Maps them to standard Monarch token classes (`keyword`, `type`, `keyword.modifier`, `constant.language`).
3. This function is re-called when the language changes (on `StatusbarPart.onLanguageChange`).

**`editorPart.ts` changes:**
- `_showTranspileEditor()` creates a `<div class="monaco-input-host">` instead of a `<textarea>`.
- Calls `monaco.editor.create(div, { language: hydraLangId, theme: 'vs-dark', value: initialCode, ... })`.
- `getContent()` → `editor.getValue()`.
- `setContent(text)` → `editor.setValue(text)`.
- `onDidChangeModelContent` replaces the `input` event for the debounced transpile.
- Output pane stays as a `<div class="transpile-output">` rendered with `<pre>` text (read-only).

**Language id naming convention:** `hydra-java-es`, `hydra-c-es`, `hydra-cpp-es` — avoids collision with Monaco's built-in language ids.

---

## Data Flow (end-to-end transpile)

```
User types in Monaco editor
  → onDidChangeModelContent (debounced 300ms)
  → EditorPart._doTranspile()
  → TranspilerEngine.transpile({ code, languageId, humanLanguageId })
  → LanguageRegistry.getMapping(languageId, humanLanguageId)
  → _transpileCode(code, mapping)  [token replacement]
  → result.output rendered in output pane
  → CustomEvent 'hydracode-transpile' fired
  → StatusbarPart updates transpile status display
```

---

## Error Handling

- **IPC file ops**: All `ipcMain.handle` callbacks are wrapped in try/catch; errors are returned as `{ success: false, error: string }` so the renderer can show a status-bar message without crashing.
- **Monaco worker load failure**: If `vite-plugin-monaco-editor` workers fail to load (e.g. CSP mismatch in Electron), fall back to `MonacoEnvironment.getWorker` pointing to the same-thread worker blob. This is a known Electron edge case.
- **Frameless window resize on Windows**: `frame: false` disables native resize handles on some Windows versions. Mitigation: add `resizable: true` (default) and confirm resize still works; if not, use `BrowserWindowConstructorOptions.transparent: false` with a custom resize handler.

---

## File Changelist

| File | Change |
|---|---|
| `electron/main.cjs` | `frame: false`, IPC handlers for window controls + file ops |
| `electron/preload.cjs` | Expose `windowControls` and `fileOps` via contextBridge |
| `src/workbench/parts/titlebar/titlebarPart.ts` | Window control buttons, file menu wiring, accepts `EditorPart` ref |
| `src/workbench/parts/titlebar/titlebarPart.css` | Window control button styles |
| `src/workbench/parts/activitybar/activitybarPart.ts` | `onIconActivate` emitter |
| `src/workbench/parts/sidebar/sidebarPart.ts` | `showSection(id)` method |
| `src/workbench/layout.ts` | `setSidebarVisible(visible)` method |
| `src/workbench/workbench.ts` | Wire activitybar → sidebar, keyboard shortcuts, pass editor to titlebar |
| `src/workbench/parts/editor/editorPart.ts` | Monaco editor, `getContent/setContent`, file path tracking |
| `src/workbench/parts/editor/monacoLanguage.ts` | New: Monaco language registration helper |
| `vite.config.ts` | `vite-plugin-monaco-editor` registration |
| `package.json` | Add `monaco-editor`, `vite-plugin-monaco-editor` |
