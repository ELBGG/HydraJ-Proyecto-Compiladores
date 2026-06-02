import { DisposableStore, IDisposable } from './lifecycle.js';

export type Listener<T> = (event: T) => void;

export interface Event<T> {
  (listener: Listener<T>, thisArgs?: unknown, disposables?: DisposableStore): IDisposable;
}

export class Emitter<T> {
  private _listeners: Listener<T>[] = [];
  private _disposed = false;

  get event(): Event<T> {
    return (listener, _thisArgs, disposables) => {
      if (this._disposed) {
        throw new Error('Emitter is disposed');
      }
      this._listeners.push(listener);
      const result: IDisposable = {
        dispose: () => {
          const idx = this._listeners.indexOf(listener);
          if (idx >= 0) {
            this._listeners.splice(idx, 1);
          }
        },
      };
      if (disposables) {
        disposables.add(result);
      }
      return result;
    };
  }

  fire(event: T): void {
    if (this._disposed) return;
    for (const listener of [...this._listeners]) {
      listener(event);
    }
  }

  dispose(): void {
    this._disposed = true;
    this._listeners = [];
  }
}

export function waitForEvent<T>(event: Event<T>, timeout?: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const d = event(value => {
      d.dispose();
      resolve(value);
    });
    if (timeout !== undefined) {
      setTimeout(() => {
        d.dispose();
        reject(new Error('Timeout waiting for event'));
      }, timeout);
    }
  });
}
