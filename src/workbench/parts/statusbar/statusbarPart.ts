import './statusbarPart.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';
import { LanguageRegistry } from '../../../languages/index.js';
import { Emitter } from '../../../base/common/event.js';
import { iconGlobe, iconBranch, iconPencil, createIconElement } from '../../../base/browser/icons.js';

export class StatusbarPart extends Part {
  private _progLangEl!: HTMLElement;
  private _humanLangEl!: HTMLElement;
  private _transpileStatusEl!: HTMLElement;

  private _progLangs: string[] = ['java'];
  private _currentProgLang = 'java';
  private _currentHumanLang = 'es';

  private static readonly _DISPLAY_NAMES: Record<string, string> = {
    java: 'Java', c: 'C', cpp: 'C++', python: 'Python',
    go: 'Go', rust: 'Rust', csharp: 'C#', kotlin: 'Kotlin',
    typescript: 'TypeScript', javascript: 'JavaScript',
    ruby: 'Ruby', swift: 'Swift', scala: 'Scala',
    powershell: 'PowerShell', dart: 'Dart', julia: 'Julia',
  };

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

  addLanguage(lang: string): void {
    if (!this._progLangs.includes(lang)) {
      this._progLangs.push(lang);
      this._updateLanguageDisplay();
    }
  }

  removeLanguage(lang: string): void {
    if (lang === 'java') return;
    this._progLangs = this._progLangs.filter(l => l !== lang);
    if (this._currentProgLang === lang) {
      this._currentProgLang = 'java';
      this._onLanguageChange.fire({ progLang: 'java', humanLang: this._currentHumanLang });
    }
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
    append(remoteItem, createIconElement(iconGlobe()));
    remoteItem.append(' HydraCode');
    remoteItem.title = 'HydraCode';
    append(left, remoteItem);

    const branchItem = $('div', ['statusbar-item']);
    append(branchItem, createIconElement(iconBranch()));
    branchItem.append(' main');
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
    errorsItem.textContent = '0 0';
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
    const displayName = StatusbarPart._DISPLAY_NAMES[this._currentProgLang] ?? this._currentProgLang;
    const humanNames: Record<string, string> = { en: 'EN', es: 'ES' };
    const progIcon = createIconElement(iconPencil());
    this._progLangEl.textContent = '';
    append(this._progLangEl, progIcon);
    this._progLangEl.append(` ${displayName}`);

    const humanIcon = createIconElement(iconGlobe());
    this._humanLangEl.textContent = '';
    append(this._humanLangEl, humanIcon);
    this._humanLangEl.append(` ${humanNames[this._currentHumanLang] ?? this._currentHumanLang}`);
  }

  private _cycleProgLang(): void {
    if (this._progLangs.length === 0) return;
    const idx = this._progLangs.indexOf(this._currentProgLang);
    this._currentProgLang = this._progLangs[(idx + 1) % this._progLangs.length];
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
