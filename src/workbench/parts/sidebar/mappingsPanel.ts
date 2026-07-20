import { $, append, clearNode } from '../../../base/browser/dom.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { LanguageRegistry, parseMappingFile } from '../../../languages/index.js';
import { mappingSourceStore } from './mappingSourceStore.js';
import { installMappingFromRepo } from './githubMappingService.js';

/**
 * Dedicated home for everything about installing/inspecting language mappings — split
 * out of the Extensions panel (which went back to being purely about Monaco marketplace
 * extensions) so "which language loaded from where" has a real, visible place to live
 * instead of only ever showing up in the console log.
 */
export class MappingsPanel {
  private _statusList!: HTMLElement;
  private _githubUrlInput!: HTMLInputElement;
  private _githubInstallBtn!: HTMLButtonElement;
  private _githubStatusEl!: HTMLElement;
  private readonly _disposables = new DisposableStore();

  constructor(private readonly _container: HTMLElement) {
    this._disposables.add(mappingSourceStore.onOutcomesChange(() => this._refreshStatus()));
    this._disposables.add(mappingSourceStore.onChange(() => this._refreshStatus()));
    this._render();
  }

  dispose(): void {
    this._disposables.dispose();
  }

  private _render(): void {
    clearNode(this._container);

    const header = $('div', ['sidebar-section-header']);
    header.textContent = 'MAPPINGS';
    append(this._container, header);

    const statusHeader = $('div', ['ext-section-title']);
    statusHeader.textContent = 'IDIOMAS CARGADOS';
    append(this._container, statusHeader);

    this._statusList = $('div', ['ext-github-sources']);
    append(this._container, this._statusList);
    this._refreshStatus();

    const importHeader = $('div', ['ext-section-subtitle']);
    importHeader.textContent = 'IMPORTAR DESDE ARCHIVO';
    append(this._container, importHeader);

    const desc = $('div', ['ext-import-desc']);
    desc.textContent = 'Carga un mapping de idioma desde un archivo JSON local. Solo dura esta sesión — no se guarda como fuente para recargar automáticamente.';
    append(this._container, desc);

    const fileBtn = $('div', ['ext-import-btn']);
    fileBtn.textContent = '📂 Importar archivo JSON';
    fileBtn.title = 'Seleccionar un archivo .json con un mapping';
    fileBtn.addEventListener('click', () => void this._importFromFile());
    append(this._container, fileBtn);

    const githubHeader = $('div', ['ext-section-subtitle']);
    githubHeader.textContent = 'CARGAR MAPPING DESDE GITHUB';
    append(this._container, githubHeader);

    const githubDesc = $('div', ['ext-import-desc']);
    githubDesc.textContent = 'Pega la URL de un repositorio (ej. https://github.com/HydraCode-Team/Python-mappings-hydracode) que contenga un mapping.json en su raíz. Se guarda como fuente y se vuelve a descargar en cada inicio.';
    append(this._container, githubDesc);

    const row = $('div', ['ext-github-row']);
    this._githubUrlInput = document.createElement('input');
    this._githubUrlInput.type = 'text';
    this._githubUrlInput.className = 'sidebar-search-input ext-github-input';
    this._githubUrlInput.placeholder = 'https://github.com/usuario/repositorio';
    append(row, this._githubUrlInput);

    this._githubInstallBtn = document.createElement('button');
    this._githubInstallBtn.className = 'ext-btn ext-btn-install';
    this._githubInstallBtn.textContent = 'Instalar';
    this._githubInstallBtn.addEventListener('click', () => void this._installFromGithub());
    append(row, this._githubInstallBtn);
    append(this._container, row);

    this._githubStatusEl = $('div', ['ext-github-status']);
    append(this._container, this._githubStatusEl);
  }

  private _refreshStatus(): void {
    const list = this._statusList;
    clearNode(list);

    const outcomes = new Map(mappingSourceStore.getLastOutcomes().map(o => [`${o.languageId}::${o.humanLangId}`, o]));
    for (const source of mappingSourceStore.getAll()) {
      const outcome = outcomes.get(`${source.languageId}::${source.humanLangId}`);
      const row = $('div', ['ext-github-source-row']);

      const label = $('span', ['ext-github-source-lang']);
      label.textContent = `${source.languageId} (${source.humanLangId})`;
      append(row, label);

      const url = $('span', ['ext-github-source-url']);
      url.textContent = source.repoUrl.replace(/^https:\/\/github\.com\//, '');
      url.title = source.repoUrl;
      append(row, url);

      const status = $('span', ['mappings-status-badge']);
      if (!outcome) {
        status.textContent = 'Cargando…';
        status.classList.add('mappings-status-pending');
      } else if (outcome.ok) {
        status.textContent = outcome.source === 'cache' ? '✓ Caché' : '✓ Red';
        status.classList.add(outcome.source === 'cache' ? 'mappings-status-cache' : 'mappings-status-ok');
        status.title = outcome.source === 'cache'
          ? 'No se pudo contactar el repositorio; se usó la última copia descargada con éxito.'
          : 'Cargado en vivo desde el repositorio.';
      } else {
        status.textContent = '✗ Error';
        status.classList.add('mappings-status-error');
        status.title = outcome.error ?? '';
      }
      append(row, status);

      append(list, row);
    }
  }

  private async _importFromFile(): Promise<void> {
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
      const mapping = parseMappingFile(data, data.langId);
      LanguageRegistry.register(mapping);
      alert(`Mapping para "${mapping.languageId}" importado correctamente.`);
    } catch (e) {
      alert(`Error al procesar el mapping: ${e instanceof Error ? e.message : e}`);
    }
  }

  private async _installFromGithub(): Promise<void> {
    const url = this._githubUrlInput.value.trim();
    if (!url) return;
    this._githubStatusEl.textContent = '';
    this._githubStatusEl.classList.remove('ext-github-status-error');
    this._githubInstallBtn.disabled = true;
    const originalLabel = this._githubInstallBtn.textContent;
    this._githubInstallBtn.textContent = 'Instalando...';

    try {
      const mapping = await installMappingFromRepo(url);
      LanguageRegistry.register(mapping);
      await mappingSourceStore.addOrUpdate({ languageId: mapping.languageId, humanLangId: mapping.id, repoUrl: url });
      mappingSourceStore.setOutcome({ languageId: mapping.languageId, humanLangId: mapping.id, repoUrl: url, ok: true, source: 'network' });
      this._githubUrlInput.value = '';
      this._githubStatusEl.textContent = `Mapping "${mapping.nativeName}" para "${mapping.languageId}" instalado correctamente.`;
    } catch (err) {
      this._githubStatusEl.textContent = err instanceof Error ? err.message : String(err);
      this._githubStatusEl.classList.add('ext-github-status-error');
    } finally {
      this._githubInstallBtn.disabled = false;
      this._githubInstallBtn.textContent = originalLabel;
    }
  }
}
