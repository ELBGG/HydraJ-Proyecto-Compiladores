import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { TranspilerEngine } from '../../../languages/index.js';
import type { EditorPart } from '../editor/editorPart.js';

export type RunOutputType = 'stdout' | 'stderr' | 'info';

export interface RunOutput {
  text: string;
  type: RunOutputType;
}

export interface RunOptions {
  debug?: boolean;
}

export class RunEngine extends Disposable {
  private _isRunning = false;

  private readonly _onOutput = this._register(new Emitter<RunOutput>());
  readonly onOutput = this._onOutput.event;

  private readonly _onStateChange = this._register(new Emitter<'idle' | 'running'>());
  readonly onStateChange = this._onStateChange.event;

  get isRunning(): boolean { return this._isRunning; }

  async run(editor: EditorPart, opts?: RunOptions): Promise<void> {
    if (this._isRunning) return;

    const code = editor.getContent();
    const progLang = editor.getActiveTabProgLang();
    const humanLang = editor.getCurrentHumanLang();

    if (!progLang) {
      this._onOutput.fire({ text: 'No hay lenguaje de programación activo en el tab actual.\n', type: 'info' });
      return;
    }

    const engine = new TranspilerEngine();
    const transpileResult = engine.transpile({ code, languageId: progLang, humanLanguageId: humanLang });

    if (!transpileResult.success && !transpileResult.output) {
      this._onOutput.fire({ text: `Error de transpilación: ${transpileResult.error ?? 'desconocido'}\n`, type: 'stderr' });
      return;
    }

    this._isRunning = true;
    this._onStateChange.fire('running');
    const mode = opts?.debug ? 'DEBUG' : 'RUN';
    this._onOutput.fire({ text: `▶ ${mode} ${progLang.toUpperCase()}...\n\n`, type: 'info' });

    const api = (window as any).electronAPI;
    if (!api?.runOps) {
      this._onOutput.fire({ text: 'runOps no disponible fuera de Electron.\n', type: 'stderr' });
      this._isRunning = false;
      this._onStateChange.fire('idle');
      return;
    }

    const unsubscribe = api.runOps.onOutput((data: RunOutput) => {
      this._onOutput.fire(data);
    });

    try {
      const result = await api.runOps.execute({
        code: transpileResult.output,
        language: progLang,
        debug: !!opts?.debug,
      });
      const code2 = result?.exitCode ?? 0;
      const color: RunOutputType = code2 === 0 ? 'info' : 'stderr';
      this._onOutput.fire({ text: `\n── Proceso finalizado con código ${code2} ──\n`, type: color });
    } catch (err) {
      this._onOutput.fire({ text: `\nError al ejecutar: ${String(err)}\n`, type: 'stderr' });
    } finally {
      unsubscribe();
      this._isRunning = false;
      this._onStateChange.fire('idle');
    }
  }

  stop(): void {
    const api = (window as any).electronAPI;
    api?.runOps?.stop();
    this._isRunning = false;
    this._onStateChange.fire('idle');
    this._onOutput.fire({ text: '\n■ Ejecución detenida.\n', type: 'info' });
  }
}
