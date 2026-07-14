import { $, append } from '../../../base/browser/dom.js';
import type { ExtensionRegistry } from './extensionRegistry.js';
import type { ExtensionStore, MarketplaceExtension } from './extensionStore.js';
import { MONACO_LANG_FILE_EXTENSIONS } from './extensionStore.js';
import { LanguageRegistry, HumanLanguageMapping } from '../../../languages/index.js';

const EXAMPLE_MAPPINGS: Array<{
  label: string;
  langId: string;
  file: string;
}> = [
  { label: 'Java 17',   langId: 'java',   file: 'java-es.json' },
  { label: 'C11',       langId: 'c',      file: 'c-es.json' },
  { label: 'C++20',     langId: 'cpp',    file: 'cpp-es.json' },
  { label: 'Python 3',  langId: 'python', file: 'python-es.json' },
];

export class ExtensionsPanel {
  private _mainContent!: HTMLElement;
  private _installedSection!: HTMLElement;
  private _resultsSection!: HTMLElement;
  private _importSection!: HTMLElement;
  private _detailEl: HTMLElement | null = null;
  private _searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private _searchGeneration = 0;

  constructor(
    private readonly _container: HTMLElement,
    private readonly _registry: ExtensionRegistry,
    private readonly _store: ExtensionStore,
  ) {
    // Surface extension persistence failures (disk full, file locked, etc.) the same way
    // every other error in this panel is surfaced. See extensionRegistry.ts for why this is
    // a plain callback rather than an Emitter subscription.
    this._registry.setPersistErrorHandler(msg => alert(`No se pudieron guardar los cambios de extensiones: ${msg}`));
    this._render();
  }

  private _render(): void {
    const header = $('div', ['sidebar-section-header']);
    header.textContent = 'EXTENSIONES';
    append(this._container, header);

    this._mainContent = $('div', ['ext-main-content']);
    append(this._container, this._mainContent);

    const searchWrap = $('div', ['ext-search-wrap']);
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'sidebar-search-input';
    searchInput.placeholder = 'Buscar extensiones...';
    searchInput.style.margin = '0';
    searchInput.style.width = '100%';
    append(searchWrap, searchInput);
    append(this._mainContent, searchWrap);

    this._installedSection = $('div', ['ext-section']);
    append(this._mainContent, this._installedSection);

    this._resultsSection = $('div', ['ext-section']);
    append(this._mainContent, this._resultsSection);

    this._importSection = $('div', ['ext-section']);
    append(this._mainContent, this._importSection);
    this._renderImportSection();

    this._refreshInstalled();
    this._loadResults('');

    searchInput.addEventListener('input', () => {
      if (this._searchTimeout) clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(
        () => this._loadResults(searchInput.value.trim()),
        400,
      );
    });
  }

  private _showDetail(ext: MarketplaceExtension): void {
    this._mainContent.style.display = 'none';

    if (!this._detailEl) {
      this._detailEl = $('div', ['ext-detail']);
      append(this._container, this._detailEl);
    }
    this._detailEl.style.display = 'block';
    this._renderDetail(ext);
  }

  private _hideDetail(): void {
    if (this._detailEl) this._detailEl.style.display = 'none';
    this._mainContent.style.display = '';
  }

  private _renderDetail(ext: MarketplaceExtension): void {
    const el = this._detailEl!;
    el.innerHTML = '';

    const backBtn = document.createElement('button');
    backBtn.className = 'ext-detail-back';
    backBtn.textContent = '← Volver';
    backBtn.addEventListener('click', () => this._hideDetail());
    append(el, backBtn);

    const headerRow = $('div', ['ext-detail-header']);

    const iconEl = $('div', ['ext-detail-icon']);
    if (ext.iconUrl) {
      const img = document.createElement('img');
      img.src = ext.iconUrl;
      img.alt = '';
      img.onerror = () => { img.style.display = 'none'; iconEl.textContent = ext.name.charAt(0).toUpperCase(); };
      append(iconEl, img);
    } else {
      iconEl.textContent = ext.name.charAt(0).toUpperCase();
    }
    append(headerRow, iconEl);

    const nameCol = $('div', ['ext-detail-name-col']);
    const nameEl = $('div', ['ext-detail-name']);
    nameEl.textContent = ext.name;
    const pubEl = $('div', ['ext-detail-pub']);
    pubEl.textContent = ext.publisher;
    const statsEl = $('div', ['ext-detail-stats-row']);
    statsEl.textContent = `${this._fmtDownloads(ext.downloads)} · v${ext.version}`;
    append(nameCol, nameEl);
    append(nameCol, pubEl);
    append(nameCol, statsEl);
    append(headerRow, nameCol);
    append(el, headerRow);

    const exactInstalled = this._registry.isInstalled(ext.id);
    // A marketplace result can name a language already provided by a differently-namespaced
    // installed extension (e.g. builtin.python vs. ms-python.python) — treat that as
    // installed too, instead of offering a redundant "Instalar".
    const languageProvidedElsewhere = !exactInstalled
      && !!ext.monacoLang
      && this._registry.isLanguageInstalled(ext.monacoLang);

    const btn = document.createElement('button');
    btn.className = (exactInstalled || languageProvidedElsewhere)
      ? 'ext-btn ext-btn-installed ext-detail-btn'
      : 'ext-btn ext-btn-install ext-detail-btn';
    btn.textContent = exactInstalled ? 'Desinstalar' : languageProvidedElsewhere ? 'Instalado ✓' : 'Instalar';
    if (languageProvidedElsewhere) {
      btn.disabled = true;
      btn.title = 'Este lenguaje ya está disponible mediante otra extensión instalada.';
    } else {
      btn.addEventListener('click', async () => {
        if (this._registry.isInstalled(ext.id)) {
          await this._registry.uninstall(ext.id);
          btn.className = 'ext-btn ext-btn-install ext-detail-btn';
          btn.textContent = 'Instalar';
          this._refreshInstalled();
        } else {
          btn.disabled = true;
          btn.textContent = 'Instalando...';
          await this._registry.install({
            id: ext.id,
            displayName: ext.name,
            languages: ext.monacoLang
              ? [{ id: ext.monacoLang, extensions: MONACO_LANG_FILE_EXTENSIONS[ext.monacoLang] ?? [] }]
              : [],
            grammars: [],
            installPath: '',
            builtin: false,
          });
          btn.disabled = false;
          btn.className = 'ext-btn ext-btn-installed ext-detail-btn';
          btn.textContent = 'Desinstalar';
          this._refreshInstalled();
        }
      });
    }
    append(el, btn);

    if (ext.description) {
      const descEl = $('div', ['ext-detail-desc']);
      descEl.textContent = ext.description;
      append(el, descEl);
    }

    const meta = $('div', ['ext-detail-meta']);
    const rows: Array<[string, string]> = [
      ['Identificador', ext.id],
      ['Versión', ext.version],
      ['Descargas', this._fmtDownloads(ext.downloads)],
    ];
    if (ext.monacoLang) rows.push(['Lenguaje', ext.monacoLang]);
    for (const [label, value] of rows) {
      const row = $('div', ['ext-detail-meta-row']);
      const k = $('span', ['ext-detail-meta-key']);
      k.textContent = label;
      const v = $('span', ['ext-detail-meta-val']);
      v.textContent = value;
      append(row, k);
      append(row, v);
      append(meta, row);
    }
    append(el, meta);
  }

  private _renderImportSection(): void {
    const container = this._importSection;
    container.innerHTML = '';

    const header = $('div', ['ext-section-title']);
    header.textContent = 'IMPORTAR MAPPINGS';
    append(container, header);

    const desc = $('div', ['ext-import-desc']);
    desc.textContent = 'Carga mappings de idioma desde archivos JSON o desde ejemplos predefinidos.';
    append(container, desc);

    const fileBtn = $('div', ['ext-import-btn']);
    fileBtn.textContent = '📂 Importar archivo JSON';
    fileBtn.title = 'Seleccionar un archivo .json con un mapping';
    fileBtn.addEventListener('click', () => this._importMapping());
    append(container, fileBtn);

    const examplesHeader = $('div', ['ext-section-subtitle']);
    examplesHeader.textContent = 'EJEMPLOS INTEGRADOS';
    append(container, examplesHeader);

    const grid = $('div', ['ext-examples-grid']);
    for (const ex of EXAMPLE_MAPPINGS) {
      const card = $('div', ['ext-example-card']);
      const name = $('span', ['ext-example-name']);
      name.textContent = ex.label;
      append(card, name);

      const langTag = $('span', ['ext-example-lang']);
      langTag.textContent = ex.langId;
      append(card, langTag);

      const loadBtn = $('div', ['ext-example-load']);
      loadBtn.textContent = 'Cargar';
      loadBtn.addEventListener('click', () => this._loadExample(ex.file, ex.langId));
      append(card, loadBtn);

      append(grid, card);
    }
    append(container, grid);
  }

  private _refreshInstalled(): void {
    const container = this._installedSection;
    container.innerHTML = '';
    const installed = this._registry.getInstalled();
    if (installed.length === 0) return;

    const header = $('div', ['ext-section-title']);
    header.textContent = `INSTALADAS (${installed.length})`;
    append(container, header);

    for (const ext of installed) {
      const item = $('div', ['ext-item']);

      const info = $('div', ['ext-item-info']);
      const name = $('span', ['ext-item-name']);
      name.textContent = ext.displayName ?? (ext as any).name ?? ext.id;
      const pub = $('span', ['ext-item-publisher']);
      pub.textContent = (ext.languages ?? []).map(l => l.id).join(' · ') || 'builtin';
      append(info, name);
      append(info, pub);

      const btn = document.createElement('button');
      btn.className = 'ext-btn ext-btn-installed';
      btn.textContent = 'Instalado ✓';

      if (ext.id.startsWith('builtin.')) {
        btn.disabled = true;
        btn.title = 'Lenguaje integrado, no se puede desinstalar.';
      } else {
        btn.addEventListener('click', async () => {
          await this._registry.uninstall(ext.id);
          this._refreshInstalled();
        });
      }

      append(item, info);
      append(item, btn);
      append(container, item);
    }
  }

  private async _loadResults(text: string): Promise<void> {
    // Generation guard: the debounce timer already coalesces keystrokes into one firing, but
    // two in-flight searches ("j" then "java") can still resolve out of order. Only the
    // response that matches the latest search when it resolves may render.
    const generation = ++this._searchGeneration;

    const container = this._resultsSection;
    container.innerHTML = '';

    const spinner = $('div', ['ext-loading']);
    spinner.textContent = 'Cargando...';
    append(container, spinner);

    let results: MarketplaceExtension[];
    try {
      results = await this._store.search(text);
    } catch {
      if (generation !== this._searchGeneration) return; // superseded by a newer search
      container.innerHTML = '';
      const err = $('div', ['sidebar-placeholder']);
      err.textContent = 'Error al conectar con el marketplace.';
      append(container, err);
      return;
    }

    if (generation !== this._searchGeneration) return; // superseded by a newer search

    container.innerHTML = '';

    if (results.length === 0) {
      const empty = $('div', ['sidebar-placeholder']);
      empty.textContent = text ? 'No se encontraron extensiones.' : 'Sin resultados.';
      append(container, empty);
      return;
    }

    const sectionHeader = $('div', ['ext-section-title']);
    sectionHeader.textContent = 'RESULTADOS';
    append(container, sectionHeader);

    for (const ext of results) {
      this._renderResultItem(container, ext);
    }
  }

  private _renderResultItem(container: HTMLElement, ext: MarketplaceExtension): void {
    const item = $('div', ['ext-item']);

    const info = $('div', ['ext-item-info', 'ext-item-info-clickable']);
    info.title = 'Ver detalles';
    info.addEventListener('click', () => this._showDetail(ext));

    const name = $('span', ['ext-item-name']);
    name.textContent = ext.name;

    const langTag = ext.monacoLang
      ? ` · ${ext.monacoLang}`
      : ' · lenguaje no identificado';
    const meta = $('span', ['ext-item-meta']);
    meta.textContent = `${ext.publisher}${langTag} · ${this._fmtDownloads(ext.downloads)}`;
    const desc = $('div', ['ext-item-desc']);
    desc.textContent = ext.description;
    append(info, name);
    append(info, meta);
    append(info, desc);

    const btn = document.createElement('button');

    const doInstall = async () => {
      btn.textContent = '...';
      btn.disabled = true;
      await this._registry.install({
        id: ext.id,
        displayName: ext.name,
        languages: ext.monacoLang
          ? [{ id: ext.monacoLang, extensions: MONACO_LANG_FILE_EXTENSIONS[ext.monacoLang] ?? [] }]
          : [],
        grammars: [],
        installPath: '',
        builtin: false,
      });
      btn.className = 'ext-btn ext-btn-installed';
      btn.textContent = 'Instalado ✓';
      btn.disabled = false;
      btn.replaceWith(btn.cloneNode(true));
      const newBtn = item.querySelector('button')!;
      newBtn.addEventListener('click', async () => {
        await this._registry.uninstall(ext.id);
        newBtn.className = 'ext-btn ext-btn-install';
        newBtn.textContent = 'Install';
        this._refreshInstalled();
      });
      this._refreshInstalled();
    };

    const exactInstalled = this._registry.isInstalled(ext.id);
    // See _renderDetail() for why a language already covered by another installed extension
    // (e.g. a builtin) must not be shown as freely installable via this differently-
    // namespaced marketplace id.
    const languageProvidedElsewhere = !exactInstalled
      && !!ext.monacoLang
      && this._registry.isLanguageInstalled(ext.monacoLang);

    if (exactInstalled) {
      btn.className = 'ext-btn ext-btn-installed';
      btn.textContent = 'Instalado ✓';
      btn.addEventListener('click', async () => {
        await this._registry.uninstall(ext.id);
        btn.className = 'ext-btn ext-btn-install';
        btn.textContent = 'Install';
        this._refreshInstalled();
      });
    } else if (languageProvidedElsewhere) {
      btn.className = 'ext-btn ext-btn-installed';
      btn.textContent = 'Instalado ✓';
      btn.disabled = true;
      btn.title = 'Este lenguaje ya está disponible mediante otra extensión instalada.';
    } else {
      btn.className = 'ext-btn ext-btn-install';
      btn.textContent = 'Install';
      if (!ext.monacoLang) {
        btn.title = 'Lenguaje no identificado automáticamente.';
      }
      btn.addEventListener('click', doInstall);
    }

    append(item, info);
    append(item, btn);
    append(container, item);
  }

  private _fmtDownloads(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M inst`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K inst`;
    return `${n} inst`;
  }

  private async _loadExample(filename: string, langId: string): Promise<void> {
    try {
      const resp = await fetch(`examples/mappings/${filename}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      this._registerMappingFromData(data, langId);
    } catch {
      const api = window.electronAPI;
      if (!api) return;
      const result = await api.extensionOps.readExampleMapping(filename);
      if (!result.success) {
        alert(`No se pudo cargar el ejemplo "${filename}".`);
        return;
      }
      const data = JSON.parse(result.content);
      this._registerMappingFromData(data, langId);
    }
  }

  /**
   * Validates that an imported mapping field (keywords/types) is a plain object — not an
   * array, not null — whose values are all strings, and free of prototype-polluting keys.
   * Without this, a malformed field like `{"keywords":["x","y"]}` passes the old truthy-only
   * check and silently corrupts transpilation downstream: TranspilerEngine's
   * Object.entries(mapping.keywords) on an array yields numeric-index keys ("0","1",...),
   * which it then whole-word-replaces wherever those digits appear in the user's real code.
   */
  private _isValidMappingField(value: unknown): value is Record<string, string> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
      if (typeof val !== 'string') return false;
    }
    return true;
  }

  private _registerMappingFromData(data: any, fallbackLangId: string): void {
    try {
      if (!data.langId && !fallbackLangId) {
        alert('Formato inválido. El JSON debe tener un campo "langId".');
        return;
      }
      if (!data.keywords && !data.types) {
        alert('El JSON debe tener al menos un campo "keywords" o "types".');
        return;
      }
      if (
        (data.keywords !== undefined && !this._isValidMappingField(data.keywords)) ||
        (data.types !== undefined && !this._isValidMappingField(data.types))
      ) {
        alert('Formato inválido: "keywords" y "types" deben ser objetos { "clave": "valor" } con valores de texto (no listas).');
        return;
      }
      const langId = data.langId ?? fallbackLangId;
      const patterns = (data.patterns ?? []).map((p: any) => ({
        from: new RegExp(p.from, 'g'),
        to: p.to,
      }));
      const mapping = new HumanLanguageMapping(
        data.id ?? 'es',
        data.name ?? 'Spanish',
        data.nativeName ?? 'Español',
        langId,
        {
          version: data.version,
          keywords: data.keywords ?? {},
          types: data.types ?? {},
          literals: data.literals ?? {},
          modifiers: data.modifiers ?? {},
          patterns,
        },
      );
      LanguageRegistry.register(mapping);
      alert(`Mapping para "${langId}" importado correctamente.`);
    } catch (e) {
      alert(`Error al procesar el mapping: ${e}`);
    }
  }

  private async _importMapping(): Promise<void> {
    const api = window.electronAPI;
    if (!api) return;
    const result = await api.dialogOps.openJson();
    if (result.canceled) return;
    if (result.content === undefined) {
      alert('Error al leer el archivo.');
      return;
    }
    try {
      const data = JSON.parse(result.content);
      this._registerMappingFromData(data, data.langId);
    } catch {
      alert('Error al leer el archivo JSON.');
    }
  }
}
