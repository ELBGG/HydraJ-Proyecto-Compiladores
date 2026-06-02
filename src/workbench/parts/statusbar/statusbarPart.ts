import './statusbarPart.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';
import { LanguageRegistry } from '../../../languages/index.js';
import { Emitter } from '../../../base/common/event.js';

export class StatusbarPart extends Part {
  private _progLangEl!: HTMLElement;
  private _humanLangEl!: HTMLElement;
  private _transpileStatusEl!: HTMLElement;

  private _currentProgLang = 'java';
  private _currentHumanLang = 'es';

  private readonly _onLanguageChange = this._register(new Emitter<{ progLang: string; humanLang: string }>());
  readonly onLanguageChange = this._onLanguageChange.event;

  constructor() {
    super('statusbar', { hasTitle: false, minimumHeight: 22 });
  }

  get currentProgLang(): string { return this._currentProgLang; }
  get currentHumanLang(): string { return this._currentHumanLang; }

  setLanguage(progLang: string, humanLang: string): void {
    this._currentProgLang = progLang;
    this._currentHumanLang = humanLang;
    this._updateLanguageDisplay();
  }

  setTranspileStatus(text: string): void {
    this._transpileStatusEl.textContent = text;
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['statusbar-content']);
    append(parent, container);

    const left = $('div', ['statusbar-left']);

    const remoteItem = $('div', ['statusbar-item']);
    remoteItem.textContent = '\u{1F310} HydraCode';
    remoteItem.title = 'HydraCode';
    append(left, remoteItem);

    const branchItem = $('div', ['statusbar-item']);
    branchItem.textContent = '\u{1F500} main';
    branchItem.title = 'Source Control (main)';
    append(left, branchItem);

    this._progLangEl = $('div', ['statusbar-item']);
    this._progLangEl.title = 'Click to change programming language';
    append(left, this._progLangEl);
    this._progLangEl.addEventListener('click', () => this._cycleProgLang());

    this._humanLangEl = $('div', ['statusbar-item']);
    this._humanLangEl.title = 'Click to change human language';
    append(left, this._humanLangEl);
    this._humanLangEl.addEventListener('click', () => this._cycleHumanLang());

    append(container, left);

    const right = $('div', ['statusbar-right']);

    const errorsItem = $('div', ['statusbar-item']);
    errorsItem.textContent = '\u2713 0 \u2717 0';
    errorsItem.title = 'No errors, no warnings';
    append(right, errorsItem);

    this._transpileStatusEl = $('div', ['statusbar-item']);
    this._transpileStatusEl.textContent = 'ES: activo';
    this._transpileStatusEl.title = 'Transpiler status';
    append(right, this._transpileStatusEl);

    const encodingItem = $('div', ['statusbar-item']);
    encodingItem.textContent = 'UTF-8';
    encodingItem.title = 'File encoding';
    append(right, encodingItem);

    const indentItem = $('div', ['statusbar-item']);
    indentItem.textContent = 'Spaces: 2';
    indentItem.title = 'Indentation';
    append(right, indentItem);

    const lnItem = $('div', ['statusbar-item']);
    lnItem.textContent = 'Ln 1, Col 1';
    lnItem.title = 'Line 1, Column 1';
    append(right, lnItem);

    append(container, right);

    this._updateLanguageDisplay();

    return container;
  }

  private _updateLanguageDisplay(): void {
    const progNames: Record<string, string> = { java: 'Java', c: 'C', cpp: 'C++' };
    const humanNames: Record<string, string> = { en: 'EN', es: 'ES' };
    this._progLangEl.textContent = `\u{1F4DD} ${progNames[this._currentProgLang] || this._currentProgLang}`;
    this._humanLangEl.textContent = `\u{1F310} ${humanNames[this._currentHumanLang] || this._currentHumanLang}`;
  }

  private _cycleProgLang(): void {
    const langs = ['java', 'cpp', 'c'];
    const idx = langs.indexOf(this._currentProgLang);
    this._currentProgLang = langs[(idx + 1) % langs.length];
    this._updateLanguageDisplay();
    this._onLanguageChange.fire({ progLang: this._currentProgLang, humanLang: this._currentHumanLang });
  }

  private _cycleHumanLang(): void {
    const mappings = LanguageRegistry.getMappingsForLanguage(this._currentProgLang);
    if (mappings.length === 0) return;
    const ids = mappings.map(m => m.id);
    const idx = ids.indexOf(this._currentHumanLang);
    this._currentHumanLang = ids[(idx + 1) % ids.length];
    this._updateLanguageDisplay();
    this._onLanguageChange.fire({ progLang: this._currentProgLang, humanLang: this._currentHumanLang });
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
    this._element.style.display = 'flex';
    this._element.style.flexDirection = 'row';
    this._element.style.alignItems = 'center';
  }
}
