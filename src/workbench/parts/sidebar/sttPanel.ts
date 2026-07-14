import { $, append, clearNode } from '../../../base/browser/dom.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { STTRegistry } from './sttRegistry.js';
import type { STTEngine, STTStatus } from './sttEngine.js';
import type { EditorPart } from '../editor/editorPart.js';
import { iconMic, iconStop, iconInsert, iconClose, iconCross, createIconElement } from '../../../base/browser/icons.js';

export class STTPanel {
  private _editor: EditorPart | null = null;
  private _currentId = 'es';
  private _confirmed = '';          // accumulated final text
  private _textarea: HTMLTextAreaElement | null = null;
  private _statusEl: HTMLElement | null = null;
  private _progressWrap: HTMLElement | null = null;
  private _progressBar: HTMLElement | null = null;
  private _recordBtn: HTMLButtonElement | null = null;
  private readonly _disposables = new DisposableStore();

  constructor(
    private readonly _container: HTMLElement,
    private readonly _engine: STTEngine,
  ) {
    this._disposables.add(this._engine.onStatus(s => this._onStatus(s)));
    this._disposables.add(this._engine.onProgress(p => this._onProgress(p)));
    this._disposables.add(this._engine.onResult(({ partial, final }) => this._onResult(partial, final)));
    this._render();
  }

  setEditor(editor: EditorPart): void { this._editor = editor; }

  /** Disposes the subscriptions made onto the long-lived sttEngine singleton. Must be called
   *  before discarding an STTPanel instance (e.g. when re-rendering the STT sidebar section) —
   *  otherwise each visit accumulates another set of listeners reacting on stale/detached DOM. */
  dispose(): void {
    this._disposables.dispose();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private _render(): void {
    clearNode(this._container);

    // Header
    const hdr = $('div', ['stt-header']);
    hdr.textContent = 'STT — VOZ A CÓDIGO';
    append(this._container, hdr);

    // Language row
    const langRow = $('div', ['stt-row']);
    const langLbl = $('span', ['stt-label']); langLbl.textContent = 'Idioma:';
    const sel = document.createElement('select'); sel.className = 'stt-select';
    for (const m of STTRegistry.getAll()) {
      const opt = document.createElement('option');
      opt.value = m.id; opt.textContent = m.name;
      if (m.id === this._currentId) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      this._currentId = sel.value;
      this._engine.dispose();
      this._startEngine();
    });
    append(langRow, langLbl); append(langRow, sel);
    append(this._container, langRow);

    const divider1 = $('div', ['stt-divider']); append(this._container, divider1);

    // Status
    this._statusEl = $('div', ['stt-status']);
    this._statusEl.textContent = 'Inicializando...';
    append(this._container, this._statusEl);

    // Progress bar
    this._progressWrap = $('div', ['stt-progress-wrap']); this._progressWrap.style.display = 'none';
    this._progressBar  = $('div', ['stt-progress-bar']);
    append(this._progressWrap, this._progressBar);
    append(this._container, this._progressWrap);

    // Record button
    this._recordBtn = document.createElement('button');
    this._recordBtn.className = 'stt-record-btn';
    this._recordBtn.disabled = true;
    append(this._recordBtn, createIconElement(iconMic()));
    this._recordBtn.append(' Iniciar grabación');
    this._recordBtn.addEventListener('click', () => this._toggleRecording());
    append(this._container, this._recordBtn);

    const divider2 = $('div', ['stt-divider']); append(this._container, divider2);

    // Transcript label
    const tLbl = $('div', ['stt-label']); tLbl.textContent = 'Transcripción:';
    append(this._container, tLbl);

    // Textarea (editable)
    this._textarea = document.createElement('textarea');
    this._textarea.className = 'stt-textarea';
    this._textarea.placeholder = 'Aquí aparecerá el texto reconocido...';
    this._textarea.spellcheck = false;
    this._textarea.addEventListener('input', () => {
      this._confirmed = this._textarea!.value;
    });
    append(this._container, this._textarea);

    // Actions
    const actions = $('div', ['stt-actions']);

    const insertBtn = $('button', ['stt-btn', 'stt-btn-insert']);
    append(insertBtn, createIconElement(iconInsert()));
    insertBtn.append(' Insertar en editor');
    insertBtn.title = 'Inserta el texto en el cursor del editor activo';
    insertBtn.addEventListener('click', () => {
      const text = this._textarea?.value ?? '';
      if (text) this._editor?.insertSnippet(text);
    });

    const clearBtn = $('button', ['stt-btn', 'stt-btn-clear']);
    append(clearBtn, createIconElement(iconClose()));
    clearBtn.append(' Limpiar');
    clearBtn.addEventListener('click', () => {
      this._confirmed = '';
      if (this._textarea) this._textarea.value = '';
    });

    append(actions, insertBtn); append(actions, clearBtn);
    append(this._container, actions);

    // Start engine on first render
    this._startEngine();
  }

  // ── Engine events ─────────────────────────────────────────────────────────

  private _startEngine(): void {
    const model = STTRegistry.get(this._currentId);
    if (model) this._engine.init(this._currentId, model.url);
  }

  private _toggleRecording(): void {
    if (this._engine.status === 'recording') {
      this._engine.stopRecording();
    } else if (this._engine.status === 'ready') {
      this._engine.startRecording();
    } else if (this._engine.status === 'error') {
      this._startEngine();
    }
  }

  private _onStatus(s: STTStatus): void {
    if (!this._statusEl || !this._recordBtn || !this._progressWrap) return;

    const labels: Record<STTStatus, string> = {
      idle:        'Inicializando...',
      downloading: 'Descargando modelo...',
      loading:     'Cargando modelo en memoria...',
      ready:       'Listo para grabar',
      starting:    'Iniciando grabación...',
      recording:   'Grabando...',
      error:       'Error — haz clic para reintentar',
    };
    this._statusEl.textContent = labels[s] ?? s;
    this._progressWrap.style.display = s === 'downloading' ? 'block' : 'none';

    const canRecord = s === 'ready' || s === 'recording' || s === 'error';
    this._recordBtn.disabled = !canRecord;

    this._recordBtn.innerHTML = '';
    if (s === 'recording') {
      append(this._recordBtn, createIconElement(iconStop()));
      this._recordBtn.append(' Detener');
      this._recordBtn.classList.add('stt-record-active');
    } else if (s === 'error') {
      append(this._recordBtn, createIconElement(iconCross()));
      this._recordBtn.append(' Reintentar');
      this._recordBtn.classList.remove('stt-record-active');
    } else {
      append(this._recordBtn, createIconElement(iconMic()));
      this._recordBtn.append(' Iniciar grabación');
      this._recordBtn.classList.remove('stt-record-active');
    }
  }

  private _onProgress(pct: number): void {
    if (this._progressBar) this._progressBar.style.width = `${pct}%`;
    if (this._statusEl) this._statusEl.textContent = `Descargando modelo... ${pct}%`;
  }

  private _onResult(partial: string, final: string): void {
    if (!this._textarea) return;
    if (final) {
      this._confirmed += (this._confirmed ? ' ' : '') + final;
      this._textarea.value = this._confirmed;
    } else if (partial) {
      this._textarea.value = this._confirmed + (this._confirmed ? ' ' : '') + partial;
    }
  }
}
