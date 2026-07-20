import { $, append } from '../../../base/browser/dom.js';
import type { IDisposable } from '../../../base/common/lifecycle.js';
import { settingsStore, SETTINGS_SCHEMA } from './settingsStore.js';
import type { SettingDefinition, SettingValue } from './settingsStore.js';
import { iconCross, createIconElement } from '../../../base/browser/icons.js';

/**
 * A VS Code-style settings view: search-as-you-type, grouped by category, one row per
 * setting rendered with a control matching its type — reusing extensionsPanel.ts's
 * search-input + debounced-filter pattern (search here is purely synchronous, filtering
 * the static SETTINGS_SCHEMA array, so it doesn't need that panel's async generation
 * guard against out-of-order network responses).
 *
 * No raw "open settings.json" text-edit mode by design — every setting HydraCode has is
 * already representable by one of the five typed controls below, and this app's
 * audience (students inside a guided IDE) gains nothing from a second, JSON-shaped
 * source of truth to keep in sync with the GUI.
 */
export class SettingsPanel {
  private _mainContent!: HTMLElement;
  private _searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private _filterText = '';
  private readonly _changeListener: IDisposable;

  constructor(private readonly _container: HTMLElement) {
    // Keep the panel in sync if a setting changes from elsewhere (e.g. AIInterpreter
    // resetting a bad value, or — in principle — a future second Settings view/window).
    this._changeListener = settingsStore.onChange(() => this._renderSections());
    this._render();
  }

  dispose(): void {
    this._changeListener.dispose();
  }

  private _render(): void {
    const header = $('div', ['sidebar-section-header']);
    header.textContent = 'CONFIGURACIÓN';
    append(this._container, header);

    this._mainContent = $('div', ['settings-main-content']);
    append(this._container, this._mainContent);

    const searchWrap = $('div', ['settings-search-wrap']);
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'sidebar-search-input';
    searchInput.placeholder = 'Buscar configuración...';
    searchInput.style.margin = '0';
    searchInput.style.width = '100%';
    append(searchWrap, searchInput);
    append(this._mainContent, searchWrap);

    searchInput.addEventListener('input', () => {
      if (this._searchTimeout) clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(() => {
        this._filterText = searchInput.value.trim().toLowerCase();
        this._renderSections();
      }, 250);
    });

    this._renderSections();
  }

  private _renderSections(): void {
    // Sections themselves are rebuilt fresh each time (simplest correct thing — this
    // list is small and re-filtering/re-rendering is cheap), but the search input above
    // is untouched, so it never loses focus/cursor position while the user types.
    this._mainContent.querySelectorAll('.settings-section').forEach(el => el.remove());

    const matches = (def: SettingDefinition): boolean => {
      if (!this._filterText) return true;
      return def.label.toLowerCase().includes(this._filterText)
        || def.description.toLowerCase().includes(this._filterText)
        || def.id.toLowerCase().includes(this._filterText);
    };

    const categories: string[] = [];
    for (const def of SETTINGS_SCHEMA) {
      if (!categories.includes(def.category)) categories.push(def.category);
    }

    let anyShown = false;
    for (const category of categories) {
      const defsInCategory = SETTINGS_SCHEMA.filter(d => d.category === category && matches(d));
      if (defsInCategory.length === 0) continue;
      anyShown = true;

      const section = $('div', ['settings-section']);
      const title = $('div', ['settings-section-title']);
      title.textContent = category;
      append(section, title);

      for (const def of defsInCategory) {
        append(section, this._renderRow(def));
      }
      append(this._mainContent, section);
    }

    if (!anyShown) {
      const empty = $('div', ['settings-section', 'settings-empty']);
      empty.textContent = 'Sin coincidencias.';
      append(this._mainContent, empty);
    }
  }

  private _renderRow(def: SettingDefinition): HTMLElement {
    const row = $('div', ['settings-row']);
    row.dataset.settingId = def.id;
    if (!settingsStore.isDefault(def.id)) row.classList.add('settings-modified');

    const main = $('div', ['settings-row-main']);
    const label = $('div', ['settings-label']);
    label.textContent = def.label;
    append(main, label);
    const desc = $('div', ['settings-desc']);
    desc.textContent = def.description;
    append(main, desc);
    append(row, main);

    const controlWrap = $('div', ['settings-control-wrap']);
    append(controlWrap, this._renderControl(def));

    const resetBtn = $('button', ['settings-reset-btn']);
    append(resetBtn, createIconElement(iconCross()));
    resetBtn.title = 'Restablecer valor predeterminado';
    resetBtn.style.display = settingsStore.isDefault(def.id) ? 'none' : 'flex';
    resetBtn.addEventListener('click', () => {
      void settingsStore.resetToDefault(def.id).then(() => this._renderSections());
    });
    append(controlWrap, resetBtn);

    append(row, controlWrap);
    return row;
  }

  private _renderControl(def: SettingDefinition): HTMLElement {
    const current = settingsStore.get(def.id);

    const commit = (value: SettingValue) => {
      void settingsStore.set(def.id, value).then(() => {
        const row = this._mainContent.querySelector(`[data-setting-id="${CSS.escape(def.id)}"]`);
        const isDefault = settingsStore.isDefault(def.id);
        row?.classList.toggle('settings-modified', !isDefault);
        const btn = row?.querySelector('.settings-reset-btn') as HTMLElement | null;
        if (btn) btn.style.display = isDefault ? 'none' : 'flex';
      });
    };

    switch (def.type) {
      case 'boolean': {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'settings-checkbox';
        input.checked = Boolean(current);
        input.addEventListener('change', () => commit(input.checked));
        return input;
      }
      case 'enum': {
        const select = document.createElement('select');
        select.className = 'settings-select';
        for (const opt of def.enumOptions?.() ?? []) {
          const optionEl = document.createElement('option');
          optionEl.value = opt.value;
          optionEl.textContent = opt.label;
          if (opt.value === current) optionEl.selected = true;
          select.appendChild(optionEl);
        }
        select.addEventListener('change', () => commit(select.value));
        return select;
      }
      case 'number': {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'settings-input';
        input.value = String(current);
        if (def.min !== undefined) input.min = String(def.min);
        if (def.max !== undefined) input.max = String(def.max);
        input.addEventListener('change', () => {
          let n = Number(input.value);
          if (!Number.isFinite(n)) { input.value = String(current); return; }
          // input.min/max above are HTML attributes only — the browser doesn't enforce
          // them on a typed/pasted value, so an out-of-range number would otherwise
          // commit as-is (e.g. run.timeoutMs=1 kills every run almost instantly).
          if (def.min !== undefined) n = Math.max(def.min, n);
          if (def.max !== undefined) n = Math.min(def.max, n);
          input.value = String(n);
          commit(n);
        });
        return input;
      }
      case 'secret': {
        const input = document.createElement('input');
        input.type = 'password';
        input.className = 'settings-input';
        input.autocomplete = 'off';
        input.value = String(current);
        input.addEventListener('change', () => commit(input.value));
        return input;
      }
      case 'string':
      default: {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'settings-input';
        input.value = String(current);
        input.addEventListener('change', () => commit(input.value));
        return input;
      }
    }
  }
}
