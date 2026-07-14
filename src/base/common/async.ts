import { IDisposable, toDisposable } from './lifecycle.js';

export interface IdleDeadline {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

type IdleApi = Pick<typeof globalThis, 'requestIdleCallback' | 'cancelIdleCallback'>;

let _runWhenIdle: (targetWindow: IdleApi, callback: (idle: IdleDeadline) => void, timeout?: number) => IDisposable;

(function () {
  const safeGlobal: any = globalThis;
  if (typeof safeGlobal.requestIdleCallback !== 'function' || typeof safeGlobal.cancelIdleCallback !== 'function') {
    _runWhenIdle = (_targetWindow, runner) => {
      const handle = setTimeout(() => {
        const end = Date.now() + 15;
        runner(Object.freeze({
          didTimeout: true,
          timeRemaining() { return Math.max(0, end - Date.now()); },
        }));
      });
      let disposed = false;
      return toDisposable(() => {
        if (disposed) return;
        disposed = true;
        clearTimeout(handle);
      });
    };
  } else {
    _runWhenIdle = (targetWindow, runner, timeout?) => {
      const handle = targetWindow.requestIdleCallback(runner, typeof timeout === 'number' ? { timeout } : undefined);
      let disposed = false;
      return toDisposable(() => {
        if (disposed) return;
        disposed = true;
        targetWindow.cancelIdleCallback(handle);
      });
    };
  }
})();

abstract class AbstractIdleValue<T> {
  private readonly _executor: () => void;
  private readonly _handle: IDisposable;
  private _didRun = false;
  private _value?: T;
  private _error: unknown;

  constructor(targetWindow: IdleApi, executor: () => T) {
    this._executor = () => {
      try {
        this._value = executor();
      } catch (err) {
        this._error = err;
      } finally {
        this._didRun = true;
      }
    };
    this._handle = _runWhenIdle(targetWindow, () => this._executor());
  }

  dispose(): void {
    this._handle.dispose();
  }

  get value(): T {
    if (!this._didRun) {
      this._handle.dispose();
      this._executor();
    }
    if (this._error) {
      throw this._error;
    }
    return this._value!;
  }

  get isInitialized(): boolean {
    return this._didRun;
  }
}

export class GlobalIdleValue<T> extends AbstractIdleValue<T> {
  constructor(executor: () => T) {
    super(globalThis as unknown as IdleApi, executor);
  }
}

export type ITask<T> = () => T;

/**
 * Thrown to settle a {@link Delayer}'s in-flight promise when it is
 * cancelled (via `cancel()` or `dispose()`) instead of leaving that
 * promise forever unsettled.
 */
export class CancellationError extends Error {
  constructor() {
    super('Delayer was cancelled');
    this.name = 'CancellationError';
  }
}

export class Delayer<T> implements IDisposable {
  private _timeout: ReturnType<typeof setTimeout> | null = null;
  private _completionPromise: Promise<T | undefined> | null = null;
  private _doResolve: ((value: T | undefined) => void) | null = null;
  private _doReject: ((err: unknown) => void) | null = null;
  private _task: ITask<T | Promise<T>> | null = null;

  constructor(public defaultDelay: number) {}

  trigger(task: ITask<T | Promise<T>>, delay = this.defaultDelay): Promise<T | undefined> {
    this._task = task;
    this.cancelTimeout();

    if (!this._completionPromise) {
      this._completionPromise = new Promise<T | undefined>((resolve, reject) => {
        this._doResolve = resolve;
        this._doReject = reject;
      }).then(() => {
        this._completionPromise = null;
        this._doResolve = null;
        this._doReject = null;
        const task = this._task;
        this._task = null;
        return task ? task() : undefined;
      });
    }

    this._timeout = setTimeout(() => {
      this._timeout = null;
      this._doResolve?.(undefined);
    }, delay);

    return this._completionPromise;
  }

  isTriggered(): boolean {
    return this._timeout !== null;
  }

  cancel(): void {
    this.cancelTimeout();

    // Settle (reject) any outstanding promise handed back by `trigger()`
    // instead of abandoning it - otherwise an `await` on a cancelled
    // trigger would hang forever.
    if (this._doReject) {
      this._doReject(new CancellationError());
    }
    this._completionPromise = null;
    this._doResolve = null;
    this._doReject = null;
  }

  private cancelTimeout(): void {
    if (this._timeout !== null) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }

  dispose(): void {
    this.cancel();
  }
}
