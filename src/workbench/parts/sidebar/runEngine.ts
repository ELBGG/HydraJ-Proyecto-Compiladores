import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { TranspilerEngine, LanguageRegistry } from '../../../languages/index.js';
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
  // Incremented on every run() call; lets a stale run's finally block (e.g. one that's
  // still winding down after stop()) recognize a newer run has since started and avoid
  // clobbering its state (see run()/stop()).
  private _runGeneration = 0;
  private _terminalRunInFlight = false;

  private readonly _onOutput = this._register(new Emitter<RunOutput>());
  readonly onOutput = this._onOutput.event;

  private readonly _onStateChange = this._register(new Emitter<'idle' | 'running'>());
  readonly onStateChange = this._onStateChange.event;

  // Fired instead of running through runOps.execute for languages that need a real,
  // interactive shell (C/C++ via WSL, Java/Python natively) — the workbench wiring
  // listens for this and types the command into the actual Terminal tab. Any program
  // that reads stdin (scanf/cin, Python's input(), Java's Scanner/System.in) hangs
  // forever through runOps.execute's isolated pipe — there's no way to type a response
  // to it — so every language a student is realistically taught to read input in needs
  // to go through here instead.
  private readonly _onRequestTerminalRun = this._register(new Emitter<{ command: string }>());
  readonly onRequestTerminalRun = this._onRequestTerminalRun.event;

  private static readonly TERMINAL_LANGUAGES = new Set(['c', 'cpp', 'java', 'python']);

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

    // Languages installed via the Extensions marketplace beyond the core java/c/cpp/python
    // (Go, TypeScript, Rust, ...) have no registered Spanish-keyword mapping — there's
    // nothing to transpile, the editor content already *is* real code in that language.
    // Only run the transpiler when a mapping actually exists for this prog+human language
    // pair; otherwise pass the source straight through.
    let codeToRun = code;
    if (LanguageRegistry.getMapping(progLang, humanLang)) {
      const engine = new TranspilerEngine();
      const transpileResult = engine.transpile({ code, languageId: progLang, humanLanguageId: humanLang });

      if (!transpileResult.success) {
        // TranspilerEngine always sets output to the original (untranspiled) source on
        // failure, so checking !output here would never fire for real failures (e.g. no
        // mapping registered for the current language) — only for empty source. Check
        // success alone, and never fall through to executing transpileResult.output.
        this._onOutput.fire({ text: `Error de transpilación: ${transpileResult.error ?? 'desconocido'}\n`, type: 'stderr' });
        return;
      }
      codeToRun = transpileResult.output;
    }

    if (RunEngine.TERMINAL_LANGUAGES.has(progLang)) {
      await this._runInTerminal(codeToRun, progLang);
      return;
    }

    // Claim this run's identity before flipping any state (still synchronous, before the
    // first await), so later async continuations can tell whether they're still current.
    const generation = ++this._runGeneration;

    this._isRunning = true;
    this._onStateChange.fire('running');
    const mode = opts?.debug ? 'DEBUG' : 'RUN';
    this._onOutput.fire({ text: `▶ ${mode} ${progLang.toUpperCase()}...\n\n`, type: 'info' });

    const api = window.electronAPI;
    if (!api?.runOps) {
      this._onOutput.fire({ text: 'runOps no disponible fuera de Electron.\n', type: 'stderr' });
      this._isRunning = false;
      this._onStateChange.fire('idle');
      return;
    }

    const unsubscribe = api.runOps.onOutput((data: RunOutput) => {
      if (generation !== this._runGeneration) return; // stale run — a newer run owns onOutput now
      this._onOutput.fire(data);
    });

    try {
      const result = await api.runOps.execute({
        code: codeToRun,
        language: progLang,
        debug: !!opts?.debug,
      });
      if (generation !== this._runGeneration) return; // superseded — don't report a stale result
      const code2 = result?.exitCode ?? 0;
      const color: RunOutputType = code2 === 0 ? 'info' : 'stderr';
      this._onOutput.fire({ text: `\n── Proceso finalizado con código ${code2} ──\n`, type: color });
    } catch (err) {
      if (generation !== this._runGeneration) return;
      this._onOutput.fire({ text: `\nError al ejecutar: ${String(err)}\n`, type: 'stderr' });
    } finally {
      unsubscribe();
      // Only the still-current run may reset shared state — a stale run's finally (e.g.
      // draining after stop()) must no-op instead of firing onStateChange('idle') under a
      // newer run that's genuinely still executing.
      if (generation === this._runGeneration) {
        this._isRunning = false;
        this._onStateChange.fire('idle');
      }
    }
  }

  /** C/C++/Java/Python: compiles+runs through the real interactive terminal instead of
   *  the isolated run:execute pipe, so a program that reads stdin can actually receive
   *  it (see TERMINAL_LANGUAGES' own comment for why). Note this also means these
   *  languages don't get debug-mode support (run:execute's -Xdebug/trace flags) when
   *  run this way — same pre-existing limitation C/C++ already had, not a new gap.
   *  Deliberately does NOT go through _isRunning/onStateChange — that machinery exists to
   *  gate the Run/Debug/Stop button states and the auto-switch-to-Output behavior for a
   *  process this class actually tracks, neither of which applies here: once the command
   *  is typed into the terminal, it's a normal shell session the user watches and controls
   *  directly (Ctrl+C to interrupt), same as if they'd typed it themselves. A lightweight,
   *  separate flag only guards against double-clicking Run before the previous command has
   *  even finished being sent. */
  private async _runInTerminal(code: string, progLang: string): Promise<void> {
    if (this._terminalRunInFlight) return;
    this._terminalRunInFlight = true;
    try {
      const api = window.electronAPI;
      if (!api?.runOps) {
        this._onOutput.fire({ text: 'runOps no disponible fuera de Electron.\n', type: 'stderr' });
        return;
      }
      const result = await api.runOps.prepareTerminal(code, progLang);
      if (!result.success) {
        this._onOutput.fire({ text: `Error: ${result.error}\n`, type: 'stderr' });
        return;
      }
      this._onOutput.fire({ text: `▶ ${progLang.toUpperCase()} enviado a la terminal — mira la pestaña TERMINAL.\n`, type: 'info' });
      this._onRequestTerminalRun.fire({ command: result.command });
    } catch (err) {
      this._onOutput.fire({ text: `\nError al ejecutar: ${String(err)}\n`, type: 'stderr' });
    } finally {
      this._terminalRunInFlight = false;
    }
  }

  async stop(): Promise<void> {
    if (!this._isRunning) return;
    const api = window.electronAPI;
    this._onOutput.fire({ text: '\n■ Deteniendo ejecución...\n', type: 'info' });
    try {
      // Actually request cancellation of the in-flight process via IPC, rather than just
      // resetting local UI state ahead of reality.
      await api?.runOps?.stop();
    } catch (err) {
      this._onOutput.fire({ text: `\nError al detener: ${String(err)}\n`, type: 'stderr' });
    }
    // Do NOT reset _isRunning / fire onStateChange('idle') here: the in-flight run()'s own
    // finally block does that once api.runOps.execute() actually settles. This keeps the UI
    // truthful about whether a process is really still running, and — since _isRunning stays
    // true until then — the guard at the top of run() blocks a new run from starting while
    // this stop is still in flight.
  }
}
