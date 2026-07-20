import './editorPart.css';
import './transpileEditor.css';
import * as monaco from 'monaco-editor';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';
import { Emitter } from '../../../base/common/event.js';
import { TranspilerEngine, LanguageRegistry } from '../../../languages/index.js';
import { ensureLanguage, getMonacoLangId } from './monacoLanguage.js';
import { getExtToLangMap } from '../sidebar/extensionLoader.js';
import { parseCodeToBlocks } from './codeParser.js';
import type { ExtensionRegistry } from '../sidebar/extensionRegistry.js';
import { registerIntelligence, refreshDiagnostics } from './languageIntelligence.js';
import { settingsStore } from '../sidebar/settingsStore.js';

import {
  iconFile, iconFileCode, iconClose, iconTranspile,
  iconLightning, iconChevronDown, iconChevronUp, iconBlocks,
  createIconElement,
} from '../../../base/browser/icons.js';
import { BlocklySession, isBlocksModeSupported } from './blocklyRenderer.js';

interface OpenTab {
  id: string;
  path: string | null;
  label: string;
  icon: string;
  progLang: string;
}

export class EditorPart extends Part {
  private _tabs: OpenTab[] = [
    { id: 'readme', path: null, label: 'README.md', icon: 'file-code', progLang: '' },
  ];
  private _activeTabId = 'readme';
  private _tabElements = new Map<string, HTMLElement>();
  private _tabContents = new Map<string, string>();
  private _tabsContainer: HTMLElement | null = null;
  private _bodyContainer: HTMLElement | null = null;
  private _outputPane: HTMLElement | null = null;
  private _transpileBtn: HTMLElement | null = null;
  private _outputToggleBtn: HTMLButtonElement | null = null;
  private _monacoEditor: monaco.editor.IStandaloneCodeEditor | null = null;
  private _outputEditor: monaco.editor.IStandaloneCodeEditor | null = null;
  private _outputVisible = false;
  private _currentProgLang = settingsStore.get<string>('workbench.defaultProgLanguage', 'java');
  private _currentHumanLang = settingsStore.get<string>('workbench.humanLanguage', 'es');
  private _extensionRegistry: ExtensionRegistry | null = null;

  // ── Block canvas state ────────────────────────────────────────────────────
  private _blocksMode = false;
  private _blocklySession = new BlocklySession();

  /** Fires whenever the active tab's detected prog language becomes known — on
   *  opening a file and on switching tabs — so the status bar chip (which owns its
   *  own independent language state, only otherwise updated by the user manually
   *  picking a language) stays in sync with whatever file is actually showing. */
  private readonly _onActiveLanguageChange = this._register(new Emitter<{ progLang: string; humanLang: string }>());
  readonly onActiveLanguageChange = this._onActiveLanguageChange.event;

  /** Fires whenever the active tab changes (switching tabs, opening/closing a file) with
   *  that tab's on-disk path (null for unsaved/untitled tabs) — lets the Explorer keep its
   *  own "active file" highlight in sync with whatever's actually showing, the same way
   *  VS Code's Explorer follows the editor regardless of which tab was clicked to get there. */
  private readonly _onActiveTabChange = this._register(new Emitter<{ path: string | null }>());
  readonly onActiveTabChange = this._onActiveTabChange.event;

  constructor() {
    super('editor', { hasTitle: false });
    this._register(settingsStore.onChange(({ id, value }) => {
      if (id.startsWith('editor.')) {
        this._applyEditorSettings();
      } else if (id === 'workbench.defaultProgLanguage') {
        // Only the fallback used by getActiveTabProgLang() for tabs with no detected
        // language of their own (README, unrecognized extensions) — never retroactively
        // reinterprets a tab that already has a real progLang, so this is safe to apply
        // live without disturbing whatever the user currently has open.
        this._currentProgLang = String(value);
      }
    }));
  }

  setExtensionRegistry(registry: ExtensionRegistry): void { this._extensionRegistry = registry; }

  /** Builds the subset of Monaco IEditorOptions driven by Configuración → Editor —
   *  read fresh on every editor creation and reapplied live via updateOptions() so an
   *  already-open editor picks up a settings change without needing to reopen the tab. */
  private _editorOptionsFromSettings(): monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions {
    return {
      fontSize: settingsStore.get<number>('editor.fontSize', 13),
      fontFamily: settingsStore.get<string>('editor.fontFamily', "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace"),
      tabSize: settingsStore.get<number>('editor.tabSize', 4),
      wordWrap: settingsStore.get<'on' | 'off'>('editor.wordWrap', 'on'),
      minimap: { enabled: settingsStore.get<boolean>('editor.minimapEnabled', false) },
      lineNumbers: settingsStore.get<'on' | 'off'>('editor.lineNumbers', 'on'),
    };
  }

  /** Live-applies the current editor.* settings to whichever Monaco instances exist
   *  right now — a no-op for either editor that isn't currently mounted (e.g. Blocks
   *  mode, or the welcome screen with no tab open yet). */
  private _applyEditorSettings(): void {
    const options = this._editorOptionsFromSettings();
    this._monacoEditor?.updateOptions(options);
    this._outputEditor?.updateOptions(options);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getContent(): string {
    return this._monacoEditor?.getValue() ?? '';
  }

  getActiveTabProgLang(): string {
    return this._tabs.find(t => t.id === this._activeTabId)?.progLang ?? this._currentProgLang;
  }

  /** The active tab's on-disk path, or null for an unsaved/untitled tab. Save/Save As must
   *  key off this (per-tab) rather than a single shared field — otherwise saving with
   *  multiple tabs open silently targets whichever tab was last opened/created, not
   *  necessarily the one currently visible and being saved. */
  getActiveTabPath(): string | null {
    return this._tabs.find(t => t.id === this._activeTabId)?.path ?? null;
  }

  /** Records where the active tab was just saved to (Save As on a previously-unsaved tab),
   *  so a subsequent plain Save on the same tab writes straight back to that path instead
   *  of prompting Save As again — and updates the tab's displayed label to match. */
  setActiveTabPath(path: string, label: string): void {
    const tab = this._tabs.find(t => t.id === this._activeTabId);
    if (!tab) return;
    tab.path = path;
    tab.label = label;
    tab.icon = this._fileIcon(label);
    const labelEl = this._tabElements.get(tab.id)?.querySelector('.tab-label');
    if (labelEl) labelEl.textContent = label;
  }

  getCurrentHumanLang(): string {
    return this._currentHumanLang;
  }

  setContent(text: string): void {
    this._monacoEditor?.setValue(text);
  }

  /** Opens a brand-new, in-memory-only tab (no disk path) with the given label/language/
   *  content already filled in — the fallback New File path (titlebarPart.ts) uses when
   *  no workspace folder is open to create a real file into. Unlike openFile(), never
   *  dedups against existing tabs by path (every such tab's path is null, so an
   *  equality check would incorrectly treat them all as "the same file"). Works
   *  correctly from any state, including the initial welcome screen where no Monaco
   *  editor is mounted yet — setContent() alone would silently no-op there. */
  newFileWithTemplate(label: string, progLang: string, content: string): void {
    const id = `untitled-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tab: OpenTab = { id, path: null, label, icon: this._fileIcon(label), progLang };
    this._tabs.push(tab);
    this._tabContents.set(id, content);
    this._addTab(tab);
    this._activateTab(id);
  }

  setLanguage(progLang: string, humanLang: string): void {
    this._currentProgLang = progLang;
    this._currentHumanLang = humanLang;
    // Keep the block generator in sync even if this fires while Blocks mode is active
    // (no-op if the session isn't currently active).
    this._blocklySession.setLanguage(progLang, humanLang);
    if (this._monacoEditor) {
      const langId = getMonacoLangId(progLang, humanLang);
      ensureLanguage(progLang, humanLang).catch(err => console.error('Failed to register grammar for', progLang, humanLang, err)); // async; Monaco retokenizes when provider registers
      registerIntelligence(langId, progLang, humanLang); // completion+hover; sync, no need to await ensureLanguage
      const model = this._monacoEditor.getModel();
      if (model) monaco.editor.setModelLanguage(model, langId);
      this._doTranspile();
    }
  }

  openFile(params: { path: string; label: string; content: string }): void {
    const existing = this._tabs.find(t => t.path === params.path);
    if (existing) { this._activateTab(existing.id); return; }
    const progLang = this.detectProgLang(params.label);
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tab: OpenTab = { id, path: params.path, label: params.label, icon: this._fileIcon(params.label), progLang };
    this._tabs.push(tab);
    this._tabContents.set(id, params.content);
    this._addTab(tab);
    this._activateTab(id);
  }

  toggleOutputPane(): void {
    this._outputVisible = !this._outputVisible;
    this._applyOutputVisibility();
  }

  setOutputVisible(visible: boolean): void {
    this._outputVisible = visible;
    this._applyOutputVisibility();
  }

  triggerAction(action: string): void {
    this._monacoEditor?.trigger('menu', action, null);
  }

  insertSnippet(text: string): void {
    const editor = this._monacoEditor;
    if (!editor) return;
    const sel = editor.getSelection();
    if (!sel) return;
    editor.executeEdits('blocks', [{ range: sel, text }]);
    editor.focus();
  }

  setBlocksMode(enabled: boolean): void {
    if (this._blocksMode === enabled) return;
    if (!this._bodyContainer) return;

    if (enabled) {
      const progLang = this.getActiveTabProgLang();
      if (!isBlocksModeSupported(progLang, this._currentHumanLang)) {
        alert(`El modo de bloques no está disponible para "${progLang || 'este archivo'}" todavía: su mapping no define una plantilla de bloques (blockTemplate). Consulta LANGUAGE_MAPPINGS.md para añadirla.`);
        return; // stay in text mode; _blocksMode is untouched and no canvas is shown
      }
      // isBlocksModeSupported() above already confirmed LanguageRegistry has a mapping
      // with a blockTemplate for this exact pair, so this lookup is guaranteed to
      // succeed — parseCodeToBlocks() itself still tolerates a missing blockTemplate
      // defensively, but that path is unreachable from here.
      const mapping = LanguageRegistry.getMapping(progLang, this._currentHumanLang)!;
      const code = this._monacoEditor?.getValue() ?? this._tabContents.get(this._activeTabId) ?? '';
      let parsed: import('./blockModel.js').Block[];
      try {
        parsed = parseCodeToBlocks(code, mapping);
      } catch (e) {
        console.error('Failed to parse code into blocks:', e);
        alert('No se pudo cambiar a modo de bloques: el código es demasiado complejo o tiene un formato inesperado.');
        return; // stay in text mode; _blocksMode is untouched and no canvas is shown
      }

      this._blocksMode = true;
      if (this._monacoEditor) { this._monacoEditor.dispose(); this._monacoEditor = null; }
      if (this._outputEditor) { this._outputEditor.dispose(); this._outputEditor = null; }
      this._bodyContainer.innerHTML = '';
      this._showBlockCanvas(parsed);
    } else {
      // Always persist the live block graph before leaving Blocks mode, regardless
      // of which UI path triggered the exit (in-canvas button or activity-bar icon).
      let code: string | null = null;
      try {
        code = this._blocklySession.getCode();
      } catch (e) {
        console.error('Failed to generate code from blocks; keeping last saved content:', e);
      }
      if (code !== null) this._tabContents.set(this._activeTabId, code);

      this._blocksMode = false;
      this._blocklySession.dispose();
      this._bodyContainer.innerHTML = '';
      const tab = this._tabs.find(t => t.id === this._activeTabId);
      if (!tab) return;
      if (this._activeTabId === 'readme' && tab.path === null) {
        this._showWelcome();
      } else {
        this._showTranspileEditor(this._tabContents.get(this._activeTabId) ?? '', tab.progLang);
      }
    }
  }

  // ── Part lifecycle ─────────────────────────────────────────────────────────

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

  // ── Tabs ───────────────────────────────────────────────────────────────────

  private _addTab(tab: OpenTab): void {
    if (!this._tabsContainer) return;
    const tabEl = $('div', ['editor-tab']);
    if (tab.id === this._activeTabId) tabEl.classList.add('active');
    const icon = createIconElement(tab.icon === 'file-code' ? iconFileCode() : iconFile());
    icon.style.fontSize = '13px';
    append(tabEl, icon);
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.label;
    append(tabEl, label);
    const close = $('div', ['tab-close']);
    append(close, createIconElement(iconClose()));
    close.style.fontSize = '10px';
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
    const tab = this._tabs.find(t => t.id === id);
    if (tab?.progLang) this._onActiveLanguageChange.fire({ progLang: tab.progLang, humanLang: this._currentHumanLang });
    this._onActiveTabChange.fire({ path: tab?.path ?? null });
  }

  private _closeTab(id: string): void {
    if (this._tabs.length <= 1) return;
    const idx = this._tabs.findIndex(t => t.id === id);
    this._tabElements.get(id)?.remove();
    this._tabElements.delete(id);
    this._tabContents.delete(id);
    this._tabs = this._tabs.filter(t => t.id !== id);
    if (this._activeTabId === id) this._activateTab(this._tabs[Math.min(idx, this._tabs.length - 1)].id);
  }

  private _showTabContent(id: string): void {
    if (!this._bodyContainer) return;
    if (this._monacoEditor) { this._monacoEditor.dispose(); this._monacoEditor = null; }
    if (this._outputEditor) { this._outputEditor.dispose(); this._outputEditor = null; }
    this._bodyContainer.innerHTML = '';
    const tab = this._tabs.find(t => t.id === id);
    if (!tab) return;
    if (id === 'readme' && tab.path === null) this._showWelcome();
    else this._showTranspileEditor(this._tabContents.get(id) ?? '', tab.progLang);
  }

  // ── Welcome ────────────────────────────────────────────────────────────────

  private _showWelcome(): void {
    if (!this._bodyContainer) return;
    const welcome = $('div', ['editor-welcome']);
    append(this._bodyContainer, welcome);

    const h1 = document.createElement('h1');
    h1.className = 'welcome-wordmark';
    h1.textContent = 'HydraCode';
    append(welcome, h1);

    const p1 = document.createElement('p');
    p1.textContent = 'Escribe en español. Compila en cualquiera de sus cabezas.';
    append(welcome, p1);

    // The hydra's heads: one chip per target language, in its accent color.
    const heads = $('div', ['welcome-heads']);
    for (const [id, label] of [['java', 'Java'], ['c', 'C'], ['cpp', 'C++'], ['python', 'Python']]) {
      const chip = $('span', ['welcome-head', `welcome-head-${id}`]);
      chip.textContent = label;
      append(heads, chip);
    }
    append(welcome, heads);

    const demo = $('div', ['demo-card']);
    demo.textContent = ['// Java en Español:','clase HolaMundo {','    publico estatico vacio principal(cadena[] args) {','        sistema.imprimir("Hola Mundo!");','    }','}'].join('\n');
    const arrow = document.createElement('div');
    arrow.className = 'arrow'; arrow.textContent = '→ Transpila a Java estándar automáticamente';
    append(demo, arrow); append(welcome, demo);

    const p2 = document.createElement('p');
    p2.className = 'welcome-hint';
    p2.textContent = 'Abre un archivo o carpeta desde el explorador lateral para empezar.';
    append(welcome, p2);
  }

  // ── Transpile editor ───────────────────────────────────────────────────────

  private _showTranspileEditor(initialContent: string, progLang: string): void {
    if (!this._bodyContainer) return;
    const container = $('div', ['transpile-container']);
    append(this._bodyContainer, container);

    const header = $('div', ['transpile-header']);
    const label = $('span', ['transpile-label']);
    label.innerHTML = '';
    append(label, createIconElement(iconTranspile()));
    label.append(` ${progLang ? `${progLang.toUpperCase()} (${this._currentHumanLang.toUpperCase()} → EN)` : 'Text file'}`);
    append(header, label);

    if (progLang) {
      this._transpileBtn = $('button', ['transpile-btn']);
      append(this._transpileBtn, createIconElement(iconTranspile()));
      this._transpileBtn.append(' Transpile');
      append(header, this._transpileBtn);
    }

    this._outputToggleBtn = document.createElement('button');
    this._outputToggleBtn.className = 'output-toggle-btn';
    append(this._outputToggleBtn, createIconElement(this._outputVisible ? iconChevronUp() : iconChevronDown()));
    this._outputToggleBtn.title = this._outputVisible ? 'Hide Output' : 'Show Output';
    this._outputToggleBtn.addEventListener('click', () => this.toggleOutputPane());
    append(header, this._outputToggleBtn);
    append(container, header);

    const split = $('div', ['transpile-split']);
    append(container, split);

    const inputPane = $('div', ['transpile-pane']);
    const inputLabel = $('div', ['transpile-pane-label']);
    inputLabel.innerHTML = '';
    append(inputLabel, createIconElement(iconFileCode()));
    inputLabel.append(` ${progLang ? `Input (${this._currentHumanLang.toUpperCase()})` : 'Input'}`);
    append(inputPane, inputLabel);
    const editorHost = $('div', ['monaco-editor-host']);
    append(inputPane, editorHost);
    append(split, inputPane);

    this._outputPane = $('div', ['transpile-pane']);
    const outputLabel = $('div', ['transpile-pane-label']);
    append(outputLabel, createIconElement(iconLightning()));
    outputLabel.append(' Output (EN)');
    append(this._outputPane, outputLabel);
    const outputEditorHost = $('div', ['monaco-editor-host']);
    append(this._outputPane, outputEditorHost);
    append(split, this._outputPane);
    if (!this._outputVisible || !progLang) this._outputPane.style.display = 'none';

    const monacoLangId = progLang ? getMonacoLangId(progLang, this._currentHumanLang) : 'plaintext';
    if (progLang) {
      ensureLanguage(progLang, this._currentHumanLang).catch(err => console.error('Failed to register input grammar for', progLang, err)); // registers hydra-<lang>-es for input
      ensureLanguage(progLang, 'en').catch(err => console.error('Failed to register output grammar for', progLang, err));                 // registers <lang> plain TextMate for output
      registerIntelligence(monacoLangId, progLang, this._currentHumanLang); // completion+hover for input
    }

    this._monacoEditor = monaco.editor.create(editorHost, {
      value: initialContent, language: monacoLangId, theme: 'hydra-dark-plus',
      scrollBeyondLastLine: false, automaticLayout: true,
      ...this._editorOptionsFromSettings(),
    });

    this._outputEditor = monaco.editor.create(outputEditorHost, {
      value: '', language: progLang || 'plaintext', theme: 'hydra-dark-plus',
      scrollBeyondLastLine: false, automaticLayout: true,
      ...this._editorOptionsFromSettings(),
      readOnly: true,
    });

    if (progLang) {
      if (this._transpileBtn) this._transpileBtn.addEventListener('click', () => this._doTranspile());
      let debounce: ReturnType<typeof setTimeout> | null = null;
      this._monacoEditor.onDidChangeModelContent(() => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => this._doTranspile(), 300);
      });
      this._doTranspile();
    }
  }

  private _applyOutputVisibility(): void {
    if (this._outputPane) this._outputPane.style.display = this._outputVisible ? 'flex' : 'none';
    if (this._outputToggleBtn) {
      this._outputToggleBtn.innerHTML = '';
      append(this._outputToggleBtn, createIconElement(this._outputVisible ? iconChevronUp() : iconChevronDown()));
      this._outputToggleBtn.title = this._outputVisible ? 'Hide Output' : 'Show Output';
    }
  }

  private _doTranspile(): void {
    if (!this._outputEditor || !this._transpileBtn) return;
    // Must use the ACTIVE TAB's prog language, not this._currentProgLang (which only
    // changes when the user manually picks a language from the status bar) — otherwise
    // opening e.g. a .cpp file transpiles its content as if it were still Java, the
    // last-selected language from before the file was opened.
    const progLang = this.getActiveTabProgLang();
    const engine = new TranspilerEngine();
    const result = engine.transpile({ code: this.getContent(), languageId: progLang, humanLanguageId: this._currentHumanLang });
    this._outputEditor.setValue(result.success ? result.output : `// Transpile error:\n// ${result.error}\n\n${result.output}`);
    this._transpileBtn.style.background = result.success ? 'var(--vscode-button-background)' : 'var(--vscode-errorForeground)';
    window.dispatchEvent(new CustomEvent('hydracode-transpile', { detail: { success: result.success, mapping: `${this._currentHumanLang.toUpperCase()} → ${progLang.toUpperCase()}` } }));

    const model = this._monacoEditor?.getModel();
    if (model) refreshDiagnostics(model, progLang);
  }

  // ── Block canvas (Blockly) ────────────────────────────────────────────────

  private _showBlockCanvas(parsedBlocks: import('./blockModel.js').Block[] = []): void {
    if (!this._bodyContainer) return;
    const canvas = $('div', ['block-canvas']);
    append(this._bodyContainer, canvas);

    const header = $('div', ['block-canvas-header']);
    const title = $('span', ['block-canvas-title']);
    append(title, createIconElement(iconBlocks()));
    title.append(' Editor de Bloques');
    append(header, title);

    const actions = $('div', ['block-canvas-actions']);
    const clearBtn = $('button', ['bc-btn', 'bc-btn-clear']);
    clearBtn.textContent = 'Limpiar';
    clearBtn.addEventListener('click', () => { this._blocklySession.clear(); });
    append(actions, clearBtn);

    const genBtn = $('button', ['bc-btn', 'bc-btn-gen']);
    append(genBtn, createIconElement(iconLightning()));
    genBtn.append(' Generar Código');
    // Route through setBlocksMode(false) so there is exactly one exit path —
    // it already generates code from the live session and saves it before switching back.
    genBtn.addEventListener('click', () => this.setBlocksMode(false));
    append(actions, genBtn);
    append(header, actions);
    append(canvas, header);

    const workspaceHost = $('div', ['bc-workspace']);
    append(canvas, workspaceHost);

    this._blocklySession.create(workspaceHost, this.getActiveTabProgLang(), this._currentHumanLang);
    this._blocklySession.loadBlocks(parsedBlocks);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Detects a prog language purely from a filename's extension — no disk access, safe
   *  to call on a name that doesn't exist yet (the New File flow in titlebarPart.ts
   *  uses this on the user's just-typed name before the file is created). */
  detectProgLang(filename: string): string {
    const ext = '.' + (filename.split('.').pop()?.toLowerCase() ?? '');
    return getExtToLangMap()[ext]
      // Marketplace-installed languages (e.g. Go, Rust) aren't in the bundled
      // extensionLoader map above — they're only known to ExtensionRegistry, since
      // that's where their file-extension associations get attached on install.
      ?? this._extensionRegistry?.getLanguageForExtension(ext)
      ?? ({ '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.h': 'cpp', '.py': 'python' } as Record<string, string>)[ext]
      ?? '';
  }

  private _fileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const codeExts = ['java', 'c', 'cpp', 'h', 'js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go'];
    return codeExts.includes(ext) ? 'file-code' : 'file';
  }

  dispose(): void {
    this._blocklySession.dispose();
    if (this._monacoEditor) { this._monacoEditor.dispose(); this._monacoEditor = null; }
    if (this._outputEditor) { this._outputEditor.dispose(); this._outputEditor = null; }
    super.dispose();
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.flex = '1';
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
    this._monacoEditor?.layout();
    this._outputEditor?.layout();
    if (this._blocksMode) this._blocklySession.resize();
  }
}
