import { $, append } from '../../../base/browser/dom.js';
import type { IDisposable } from '../../../base/common/lifecycle.js';
import type { RunEngine } from './runEngine.js';
import type { EditorPart } from '../editor/editorPart.js';

const RUN_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2.5l9 5.5-9 5.5V2.5z" fill="currentColor"/></svg>';
const DEBUG_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 2.5l9 5.5-9 5.5V2.5z" fill="currentColor"/><circle cx="8" cy="8" r="2" fill="#01579b"/></svg>';
const STOP_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/></svg>';

const LANG_LABELS: Record<string, string> = {
  java:       'Java (javac)',
  python:     'Python',
  c:          'C (via WSL)',
  cpp:        'C++ (via WSL)',
  javascript: 'JavaScript (Node.js)',
  typescript: 'TypeScript (Node.js)',
  go:         'Go',
  rust:       'Rust (rustc)',
  ruby:       'Ruby',
  php:        'PHP',
  '':         'Sin lenguaje activo',
};

export class RunPanel {
  private _idleView!: HTMLElement;
  private _runningView!: HTMLElement;
  private _runBtn!: HTMLButtonElement;
  private _debugLink!: HTMLButtonElement;
  private _stopBtn!: HTMLButtonElement;
  private _langBadge!: HTMLElement;
  private _runningLangEl!: HTMLElement;
  private _unsubState: IDisposable | null = null;

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

    // ── Idle / empty-state view (VS Code's "Run and Debug" welcome view) ──
    this._idleView = $('div', ['run-idle-view']);
    append(body, this._idleView);

    this._runBtn = document.createElement('button');
    this._runBtn.className = 'run-primary-btn';
    this._runBtn.innerHTML = `${RUN_ICON}<span>Run and Debug</span>`;
    this._runBtn.title = 'Transpila y ejecuta el archivo activo';
    this._runBtn.addEventListener('click', () => this._onRun(false));
    append(this._idleView, this._runBtn);

    this._langBadge = $('span', ['run-lang-badge']);
    append(this._idleView, this._langBadge);
    this._updateLangBadge();

    const secondaryRow = $('div', ['run-secondary-row']);
    this._debugLink = document.createElement('button');
    this._debugLink.className = 'run-secondary-link';
    this._debugLink.innerHTML = `${DEBUG_ICON}<span>Ejecutar con símbolos de depuración</span>`;
    this._debugLink.title = 'Igual que Run, pero compila/ejecuta con flags de depuración del lenguaje activo';
    this._debugLink.addEventListener('click', () => this._onRun(true));
    append(secondaryRow, this._debugLink);
    append(this._idleView, secondaryRow);

    const hint = $('div', ['run-hint']);
    hint.textContent = 'La salida aparece en el panel inferior → pestaña OUTPUT';
    append(this._idleView, hint);

    // ── Running view (compact toolbar, replaces the idle view while a run is active) ──
    this._runningView = $('div', ['run-running-view']);
    this._runningView.style.display = 'none';
    append(body, this._runningView);

    const spinner = $('div', ['run-spinner']);
    append(this._runningView, spinner);

    const runningInfo = $('div', ['run-running-info']);
    const runningTitle = $('div', ['run-running-title']);
    runningTitle.textContent = 'Ejecutando…';
    this._runningLangEl = $('div', ['run-running-lang']);
    append(runningInfo, runningTitle);
    append(runningInfo, this._runningLangEl);
    append(this._runningView, runningInfo);

    this._stopBtn = document.createElement('button');
    this._stopBtn.className = 'run-stop-btn';
    this._stopBtn.innerHTML = STOP_ICON;
    this._stopBtn.title = 'Detener ejecución';
    this._stopBtn.addEventListener('click', () => this._engine.stop());
    append(this._runningView, this._stopBtn);

    this._unsubState = this._engine.onStateChange(state => {
      const running = state === 'running';
      this._idleView.style.display = running ? 'none' : '';
      this._runningView.style.display = running ? 'flex' : 'none';
      if (running) {
        const lang = this._editor.getActiveTabProgLang();
        this._runningLangEl.textContent = LANG_LABELS[lang] ?? lang.toUpperCase();
      }
    });
  }

  private _updateLangBadge(): void {
    const lang = this._editor.getActiveTabProgLang();
    const label = LANG_LABELS[lang] ?? lang.toUpperCase();
    this._langBadge.textContent = label;
    this._langBadge.classList.toggle('run-lang-badge-warn', !lang);
  }

  private async _onRun(debug: boolean): Promise<void> {
    this._updateLangBadge();
    await this._engine.run(this._editor, { debug });
  }

  dispose(): void {
    this._unsubState?.dispose();
  }
}
