export interface IDisposable {
  dispose(): void;
}

export function dispose<T extends IDisposable>(disposable: T): T;
export function dispose<T extends IDisposable>(disposables: T[]): T[];
export function dispose<T extends IDisposable>(disposables: T | T[]): T | T[] {
  if (Array.isArray(disposables)) {
    disposables.forEach(d => d.dispose());
    return disposables;
  }
  disposables.dispose();
  return disposables;
}

export function toDisposable(fn: () => void): IDisposable {
  return { dispose: fn };
}

export class DisposableStore implements IDisposable {
  private _disposables: IDisposable[] = [];
  private _isDisposed = false;

  add<T extends IDisposable>(disposable: T): T {
    if (this._isDisposed) {
      disposable.dispose();
    } else {
      this._disposables.push(disposable);
    }
    return disposable;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }
}

export class Disposable implements IDisposable {
  protected _store = new DisposableStore();

  dispose(): void {
    this._store.dispose();
  }

  protected _register<T extends IDisposable>(disposable: T): T {
    return this._store.add(disposable);
  }
}
