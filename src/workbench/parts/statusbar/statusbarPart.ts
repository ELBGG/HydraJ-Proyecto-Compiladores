import './statusbarPart.css';
import { Part } from '../../part.js';
import { $, append, clearNode } from '../../../base/browser/dom.js';
import { LanguageRegistry } from '../../../languages/index.js';
import { Emitter } from '../../../base/common/event.js';
import { iconGlobe, iconBranch, iconPencil, createIconElement } from '../../../base/browser/icons.js';

export class StatusbarPart extends Part {
  private _progLangEl!: HTMLElement;
  private _humanLangEl!: HTMLElement;
  private _transpileStatusEl!: HTMLElement;
  private _langPickerOverlay: HTMLElement | null = null;

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

    this._progLangEl = $('div', ['statusbar-item', 'statusbar-lang-chip']);
    this._progLangEl.title = 'Seleccionar lenguaje de programación';
    append(left, this._progLangEl);
    this._progLangEl.addEventListener('click', (e) => { e.stopPropagation(); this._showLangPicker(); });

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
    // Language-reactive accent: style.css maps data-hydra-lang to --hydra-accent.
    document.documentElement.setAttribute('data-hydra-lang', this._currentProgLang);
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

  // ── Language mode picker ──────────────────────────────────────────────────
  // A searchable quick-pick (à la VS Code's "Select Language Mode"), not a plain
  // click-to-cycle — with more than a couple of installed languages (which is now the
  // normal case since Extensions can pull in nearly anything Monaco supports),
  // stepping through them one click at a time stops scaling.

  private _showLangPicker(): void {
    if (this._langPickerOverlay) {
      this._langPickerOverlay.remove();
      this._langPickerOverlay = null;
      return;
    }
    if (this._progLangs.length === 0) return;

    const overlay = $('div', ['lang-picker-overlay']);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Seleccionar lenguaje de programación...';
    input.className = 'lang-picker-input';
    append(overlay, input);

    const list = $('div', ['lang-picker-list']);

    const displayName = (lang: string) => StatusbarPart._DISPLAY_NAMES[lang] ?? lang;

    const selectLang = (lang: string) => {
      this._currentProgLang = lang;
      this._updateLanguageDisplay();
      this._onLanguageChange.fire({ progLang: lang, humanLang: this._currentHumanLang });
      overlay.remove();
      this._langPickerOverlay = null;
    };

    const renderList = (filter: string) => {
      clearNode(list);
      const filterLower = filter.toLowerCase();
      const shown = filter
        ? this._progLangs.filter(l => displayName(l).toLowerCase().includes(filterLower))
        : this._progLangs;
      for (const lang of shown) {
        const item = $('div', ['lang-picker-item']);
        if (lang === this._currentProgLang) item.classList.add('active');
        item.textContent = displayName(lang);
        item.addEventListener('click', (e) => { e.stopPropagation(); selectLang(lang); });
        append(list, item);
      }
      if (shown.length === 0) {
        const empty = $('div', ['lang-picker-empty']);
        empty.textContent = 'Sin coincidencias.';
        append(list, empty);
      }
    };

    renderList('');
    input.addEventListener('input', () => renderList(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { overlay.remove(); this._langPickerOverlay = null; }
      else if (e.key === 'Enter') {
        const first = this._progLangs.find(l => !input.value || displayName(l).toLowerCase().includes(input.value.toLowerCase()));
        if (first) selectLang(first);
      }
    });
    append(overlay, list);

    document.body.appendChild(overlay);
    this._langPickerOverlay = overlay;
    input.focus();

    setTimeout(() => {
      const onDocumentClick = (e: MouseEvent) => {
        if (this._langPickerOverlay !== overlay) {
          document.removeEventListener('click', onDocumentClick);
          return;
        }
        if (overlay.contains(e.target as Node)) return;
        document.removeEventListener('click', onDocumentClick);
        overlay.remove();
        this._langPickerOverlay = null;
      };
      document.addEventListener('click', onDocumentClick);
    }, 0);
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
