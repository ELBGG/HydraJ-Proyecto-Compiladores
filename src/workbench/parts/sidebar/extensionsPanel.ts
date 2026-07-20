import { $, append } from '../../../base/browser/dom.js';
import type { ExtensionRegistry } from './extensionRegistry.js';
import type { ExtensionStore, MarketplaceExtension } from './extensionStore.js';
import { MONACO_LANG_FILE_EXTENSIONS } from './extensionStore.js';

export class ExtensionsPanel {
  private _mainContent!: HTMLElement;
  private _installedSection!: HTMLElement;
  private _resultsSection!: HTMLElement;
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
        // try/catch/finally (matching _installFromGithub's pattern) — without it, a
        // rejected install()/uninstall() would leave this button stuck disabled with a
        // mid-operation label forever, with no error shown and no way to retry short of
        // leaving and re-entering the Extensions section.
        try {
          if (this._registry.isInstalled(ext.id)) {
            await this._registry.uninstall(ext.id);
            btn.className = 'ext-btn ext-btn-install ext-detail-btn';
            btn.textContent = 'Instalar';
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
            btn.className = 'ext-btn ext-btn-installed ext-detail-btn';
            btn.textContent = 'Desinstalar';
          }
        } catch (err) {
          alert(`No se pudo completar la operación: ${err instanceof Error ? err.message : err}`);
        } finally {
          btn.disabled = false;
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
          try {
            await this._registry.uninstall(ext.id);
          } catch (err) {
            alert(`No se pudo desinstalar: ${err instanceof Error ? err.message : err}`);
          } finally {
            this._refreshInstalled();
          }
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
      try {
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
          try {
            await this._registry.uninstall(ext.id);
            newBtn.className = 'ext-btn ext-btn-install';
            newBtn.textContent = 'Install';
          } catch (err) {
            alert(`No se pudo desinstalar: ${err instanceof Error ? err.message : err}`);
          } finally {
            this._refreshInstalled();
          }
        });
      } catch (err) {
        // Roll back to the pre-install state rather than leaving the button stuck on
        // "..." disabled forever — matches _installFromGithub's try/catch/finally pattern.
        btn.className = 'ext-btn ext-btn-install';
        btn.textContent = 'Install';
        btn.disabled = false;
        alert(`No se pudo instalar: ${err instanceof Error ? err.message : err}`);
      } finally {
        this._refreshInstalled();
      }
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
        try {
          await this._registry.uninstall(ext.id);
          btn.className = 'ext-btn ext-btn-install';
          btn.textContent = 'Install';
        } catch (err) {
          alert(`No se pudo desinstalar: ${err instanceof Error ? err.message : err}`);
        } finally {
          this._refreshInstalled();
        }
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

}
