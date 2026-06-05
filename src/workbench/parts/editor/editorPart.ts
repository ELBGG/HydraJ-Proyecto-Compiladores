import './editorPart.css';
import './transpileEditor.css';
import * as monaco from 'monaco-editor';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';
import { TranspilerEngine, LanguageRegistry } from '../../../languages/index.js';
import { ensureHydraLanguage, getHydraLangId } from './monacoLanguage.js';
import { parseCodeToBlocks } from './codeParser.js';

import {
  iconFile, iconFileCode, iconClose, iconTranspile,
  iconLightning, iconChevronDown, iconChevronUp, iconBlocks,
  createIconElement,
} from '../../../base/browser/icons.js';
import { BlocklySession } from './blocklyRenderer.js';

interface OpenTab {
  id: string;
  path: string | null;
  label: string;
  icon: string;
  progLang: string;
}

const DEFAULT_SPANISH_JAVA = [
  '// HydraCode - Java en Español',
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
  private _tabs: OpenTab[] = [
    { id: 'readme', path: null, label: 'README.md',           icon: 'file-code', progLang: '' },
    { id: 'main',   path: null, label: 'transpile/Main.java', icon: 'file-code', progLang: 'java' },
  ];
  private _activeTabId = 'readme';
  private _tabElements = new Map<string, HTMLElement>();
  private _tabContents = new Map<string, string>();
  private _tabsContainer: HTMLElement | null = null;
  private _bodyContainer: HTMLElement | null = null;
  private _transpileOutput: HTMLElement | null = null;
  private _outputPane: HTMLElement | null = null;
  private _transpileBtn: HTMLElement | null = null;
  private _outputToggleBtn: HTMLButtonElement | null = null;
  private _monacoEditor: monaco.editor.IStandaloneCodeEditor | null = null;
  private _outputVisible = false;
  private _currentProgLang = 'java';
  private _currentHumanLang = 'es';

  // ── Block canvas state ────────────────────────────────────────────────────
  private _blocksMode = false;
  private _blocklySession = new BlocklySession();

  constructor() {
    super('editor', { hasTitle: false });
    this._tabContents.set('main', DEFAULT_SPANISH_JAVA);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getContent(): string {
    return this._monacoEditor?.getValue() ?? '';
  }

  setContent(text: string): void {
    this._monacoEditor?.setValue(text);
  }

  setLanguage(progLang: string, humanLang: string): void {
    this._currentProgLang = progLang;
    this._currentHumanLang = humanLang;
    if (this._monacoEditor) {
      const mapping = LanguageRegistry.getMapping(progLang, humanLang);
      if (mapping) ensureHydraLanguage(progLang, humanLang, mapping);
      const langId = mapping ? getHydraLangId(progLang, humanLang) : 'plaintext';
      const model = this._monacoEditor.getModel();
      if (model) monaco.editor.setModelLanguage(model, langId);
      this._doTranspile();
    }
  }

  openFile(params: { path: string; label: string; content: string }): void {
    const existing = this._tabs.find(t => t.path === params.path);
    if (existing) { this._activateTab(existing.id); return; }
    const progLang = this._detectProgLang(params.label);
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
    this._blocksMode = enabled;
    if (!this._bodyContainer) return;

    if (enabled) {
      const code = this._monacoEditor?.getValue() ?? this._tabContents.get(this._activeTabId) ?? '';
      const parsed = parseCodeToBlocks(code);

      if (this._monacoEditor) { this._monacoEditor.dispose(); this._monacoEditor = null; }
      this._bodyContainer.innerHTML = '';
      this._showBlockCanvas(parsed);
    } else {
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
    const h1 = document.createElement('h1'); h1.textContent = 'HydraCode';
    append(welcome, h1);
    const p1 = document.createElement('p'); p1.textContent = 'El editor de código multilenguaje.';
    append(welcome, p1);
    const p2 = document.createElement('p'); p2.textContent = 'Abre una carpeta desde el explorador o haz clic en "Main.java" para probar.';
    append(welcome, p2);
    const demo = $('div', ['demo-card']);
    demo.textContent = ['// Java en Español:','clase HolaMundo {','    publico estatico vacio principal(cadena[] args) {','        sistema.imprimir("Hola Mundo!");','    }','}'].join('\n');
    const arrow = document.createElement('div');
    arrow.className = 'arrow'; arrow.textContent = '→ Transpila a Java estándar automáticamente';
    append(demo, arrow); append(welcome, demo);
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
    this._transpileOutput = $('div', ['transpile-output']);
    append(this._outputPane, this._transpileOutput);
    append(split, this._outputPane);
    if (!this._outputVisible || !progLang) this._outputPane.style.display = 'none';

    let monacoLangId = 'plaintext';
    if (progLang) {
      const mapping = LanguageRegistry.getMapping(progLang, this._currentHumanLang);
      if (mapping) { ensureHydraLanguage(progLang, this._currentHumanLang, mapping); monacoLangId = getHydraLangId(progLang, this._currentHumanLang); }
    }

    this._monacoEditor = monaco.editor.create(editorHost, {
      value: initialContent, language: monacoLangId, theme: 'vs-dark', fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      minimap: { enabled: false }, lineNumbers: 'on', scrollBeyondLastLine: false,
      wordWrap: 'on', automaticLayout: true, tabSize: 4,
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
    if (!this._transpileOutput || !this._transpileBtn) return;
    const engine = new TranspilerEngine();
    const result = engine.transpile({ code: this.getContent(), languageId: this._currentProgLang, humanLanguageId: this._currentHumanLang });
    this._transpileOutput.textContent = result.success ? result.output : `// Transpile error:\n// ${result.error}\n\n${result.output}`;
    this._transpileBtn.style.background = result.success ? 'var(--vscode-button-background)' : 'var(--vscode-errorForeground)';
    window.dispatchEvent(new CustomEvent('hydracode-transpile', { detail: { success: result.success, mapping: `${this._currentHumanLang.toUpperCase()} → ${this._currentProgLang.toUpperCase()}` } }));
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
    genBtn.addEventListener('click', () => {
      const code = this._blocklySession.getCode();
      this._blocklySession.dispose();
      this._blocksMode = false;
      if (this._bodyContainer) this._bodyContainer.innerHTML = '';
      const tab = this._tabs.find(t => t.id === this._activeTabId);
      const progLang = tab?.progLang ?? 'java';
      this._tabContents.set(this._activeTabId, code);
      this._showTranspileEditor(code, progLang);
    });
    append(actions, genBtn);
    append(header, actions);
    append(canvas, header);

    const workspaceHost = $('div', ['bc-workspace']);
    append(canvas, workspaceHost);

    this._blocklySession.create(workspaceHost);
    this._blocklySession.loadBlocks(parsedBlocks);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _detectProgLang(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    return ({ java: 'java', c: 'c', cpp: 'cpp', h: 'cpp' } as Record<string, string>)[ext] ?? '';
  }

  private _fileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const codeExts = ['java', 'c', 'cpp', 'h', 'js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go'];
    return codeExts.includes(ext) ? 'file-code' : 'file';
  }

  dispose(): void {
    this._blocklySession.dispose();
    if (this._monacoEditor) { this._monacoEditor.dispose(); this._monacoEditor = null; }
    super.dispose();
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.flex = '1';
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
    this._monacoEditor?.layout();
    if (this._blocksMode) this._blocklySession.resize();
  }
}
