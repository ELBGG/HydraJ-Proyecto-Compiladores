import './editorPart.css';
import './transpileEditor.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';
import { TranspilerEngine } from '../../../languages/index.js';

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
    { id: 'readme', label: 'README.md', icon: '\u{1F4D6}' },
    { id: 'main', label: 'transpile/Main.java', icon: '\u{1F4C4}' },
  ];
  private _activeTabId = 'readme';
  private _tabElements = new Map<string, HTMLElement>();
  private _tabsContainer: HTMLElement | null = null;
  private _bodyContainer: HTMLElement | null = null;
  private _transpileInput: HTMLTextAreaElement | null = null;
  private _transpileOutput: HTMLElement | null = null;
  private _transpileBtn: HTMLElement | null = null;
  private _currentProgLang = 'java';
  private _currentHumanLang = 'es';

  constructor() {
    super('editor', { hasTitle: false });
  }

  setLanguage(progLang: string, humanLang: string): void {
    this._currentProgLang = progLang;
    this._currentHumanLang = humanLang;
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['editor-content']);
    append(parent, container);

    this._tabsContainer = $('div', ['editor-tabs']);
    append(container, this._tabsContainer);

    this._bodyContainer = $('div', ['editor-body']);
    append(container, this._bodyContainer);

    for (const tab of this._tabs) {
      this._addTab(tab);
    }

    this._showWelcome();

    return container;
  }

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
    close.textContent = '\u2715';
    append(tabEl, close);

    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeTab(tab.id);
    });

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
    this._bodyContainer.innerHTML = '';
    if (id === 'readme') this._showWelcome();
    else this._showTranspileEditor();
  }

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
      '',
    ].join('\n');

    const arrow = document.createElement('div');
    arrow.className = 'arrow';
    arrow.textContent = '\u2192 Transpila a Java estándar automáticamente';
    append(demo, arrow);
    append(welcome, demo);
  }

  private _showTranspileEditor(): void {
    if (!this._bodyContainer) return;

    const container = $('div', ['transpile-container']);
    append(this._bodyContainer, container);

    // ── Header ──
    const header = $('div', ['transpile-header']);

    const label = $('span', ['transpile-label']);
    label.textContent = `\u{1F504} ${this._currentProgLang.toUpperCase()} (${this._currentHumanLang.toUpperCase()} → EN)`;
    append(header, label);

    this._transpileBtn = $('button', ['transpile-btn']);
    this._transpileBtn.textContent = '\u25B6 Transpile';
    append(header, this._transpileBtn);

    append(container, header);

    // ── Split panes ──
    const split = $('div', ['transpile-split']);
    append(container, split);

    // Input pane
    const inputPane = $('div', ['transpile-pane']);

    const inputLabel = $('div', ['transpile-pane-label']);
    inputLabel.textContent = `\u270F Input (${this._currentHumanLang.toUpperCase()})`;
    append(inputPane, inputLabel);

    this._transpileInput = document.createElement('textarea');
    this._transpileInput.className = 'transpile-input';
    this._transpileInput.value = this._getSampleCode();
    this._transpileInput.spellcheck = false;
    append(inputPane, this._transpileInput);

    append(split, inputPane);

    // Output pane
    const outputPane = $('div', ['transpile-pane']);

    const outputLabel = $('div', ['transpile-pane-label']);
    outputLabel.textContent = '\u{1F4CB} Output (EN)';
    append(outputPane, outputLabel);

    this._transpileOutput = $('div', ['transpile-output']);
    append(outputPane, this._transpileOutput);

    append(split, outputPane);

    // ── Events ──
    this._transpileBtn.addEventListener('click', () => this._doTranspile());
    this._doTranspile();

    let debounce: ReturnType<typeof setTimeout> | null = null;
    this._transpileInput.addEventListener('input', () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => this._doTranspile(), 300);
    });
  }

  private _getSampleCode(): string {
    if (this._currentProgLang === 'java' && this._currentHumanLang === 'es') {
      return DEFAULT_SPANISH_JAVA;
    }
    return `// ${this._currentProgLang.toUpperCase()} code\n// No mapping for "${this._currentHumanLang}" yet`;
  }

  private _doTranspile(): void {
    if (!this._transpileInput || !this._transpileOutput || !this._transpileBtn) return;

    const engine = new TranspilerEngine();
    const result = engine.transpile({
      code: this._transpileInput.value,
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

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.flex = '1';
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
  }
}
