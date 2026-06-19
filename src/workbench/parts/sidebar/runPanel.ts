import { $, append } from '../../../base/browser/dom.js';
import type { RunEngine } from './runEngine.js';
import type { EditorPart } from '../editor/editorPart.js';

const RUN_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2.5l9 5.5-9 5.5V2.5z" fill="currentColor"/></svg>';
const DEBUG_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2.5l9 5.5-9 5.5V2.5z" fill="currentColor"/><circle cx="8" cy="8" r="2" fill="#01579b"/></svg>';
const STOP_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/></svg>';

const LANG_LABELS: Record<string, string> = {
  java:   'Java (javac)',
  python: 'Python',
  c:      'C (via WSL)',
  cpp:    'C++ (via WSL)',
  '':     'Sin lenguaje activo',
};

export class RunPanel {
  private _runBtn!: HTMLButtonElement;
  private _debugBtn!: HTMLButtonElement;
  private _stopBtn!: HTMLButtonElement;
  private _statusEl!: HTMLElement;
  private _langEl!: HTMLElement;
  private _unsubState: (() => void) | null = null;

  constructor(
    private readonly _container: HTMLElement,
    private readonly _engine: RunEngine,
    private readonly _editor: EditorPart,
  ) {
    this._render();
  }

  private _render(): void {
    const header = $('div', ['sidebar-section-header']);
    header.textContent = 'RUN AND DEBUG';
    append(this._container, header);

    const body = $('div', ['run-panel-body']);
    append(this._container, body);

    this._langEl = $('div', ['run-lang-info']);
    this._updateLangInfo();
    append(body, this._langEl);

    const actions = $('div', ['run-actions']);
    append(body, actions);

    // Run button
    this._runBtn = document.createElement('button');
    this._runBtn.className = 'run-btn run-btn-run';
    this._runBtn.innerHTML = RUN_ICON + ' Run';
    this._runBtn.addEventListener('click', () => this._onRun(false));
    append(actions, this._runBtn);

    // Debug button
    this._debugBtn = document.createElement('button');
    this._debugBtn.className = 'run-btn run-btn-debug';
    this._debugBtn.innerHTML = DEBUG_ICON + ' Debug';
    this._debugBtn.addEventListener('click', () => this._onRun(true));
    append(actions, this._debugBtn);

    // Stop button (after actions row, on its own row)
    const stopRow = $('div', ['run-actions']);
    append(body, stopRow);
    this._stopBtn = document.createElement('button');
    this._stopBtn.className = 'run-btn run-btn-stop';
    this._stopBtn.innerHTML = STOP_ICON + ' Detener';
    this._stopBtn.disabled = true;
    this._stopBtn.addEventListener('click', () => this._engine.stop());
    append(stopRow, this._stopBtn);

    this._statusEl = $('div', ['run-status']);
    this._statusEl.textContent = 'Listo.';
    append(body, this._statusEl);

    const hint = $('div', ['run-hint']);
    hint.textContent = 'La salida aparece en el panel inferior → pestaña OUTPUT';
    append(body, hint);

    this._unsubState = this._engine.onStateChange(state => {
      const running = state === 'running';
      this._runBtn.disabled = running;
      this._debugBtn.disabled = running;
      this._stopBtn.disabled = !running;
      this._statusEl.textContent = running ? 'Ejecutando...' : 'Listo.';
      this._statusEl.className = `run-status ${running ? 'run-status-running' : ''}`;
    });
  }

  private _updateLangInfo(): void {
    const lang = this._editor.getActiveTabProgLang();
    const label = LANG_LABELS[lang] ?? lang.toUpperCase();
    this._langEl.textContent = `Lenguaje: ${label}`;
    this._langEl.className = 'run-lang-info run-lang-ok';
  }

  private async _onRun(debug: boolean): Promise<void> {
    this._updateLangInfo();
    await this._engine.run(this._editor, { debug });
  }

  dispose(): void {
    this._unsubState?.();
  }
}
