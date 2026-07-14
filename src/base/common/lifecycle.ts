export interface IDisposable {
  dispose(): void;
}

export function dispose<T extends IDisposable>(disposable: T): T;
export function dispose<T extends IDisposable>(disposable: T | undefined): T | undefined;
export function dispose<T extends IDisposable, A extends Iterable<T> = Iterable<T>>(disposables: A): A;
export function dispose<T extends IDisposable>(arg: T | Iterable<T> | undefined): any {
  if (arg && typeof (arg as any)[Symbol.iterator] === 'function') {
    for (const d of arg as Iterable<T>) {
      d?.dispose();
    }
    return Array.isArray(arg) ? [] : arg;
  } else if (arg) {
    (arg as T).dispose();
    return arg;
  }
}

export function toDisposable(fn: () => void): IDisposable {
  return { dispose: fn };
}

export function combinedDisposable(...disposables: IDisposable[]): IDisposable {
  return toDisposable(() => dispose(disposables));
}

export function isDisposable<E>(thing: E): thing is E & IDisposable {
  return typeof thing === 'object' && thing !== null
    && typeof (thing as unknown as IDisposable).dispose === 'function'
    && (thing as unknown as IDisposable).dispose.length === 0;
}

export function markAsSingleton<T extends IDisposable>(singleton: T): T {
  return singleton;
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

  clear(): void {
    const toDispose = this._disposables;
    this._disposables = [];
    for (const d of toDispose) {
      d.dispose();
    }
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    this.clear();
  }
}

export class Disposable implements IDisposable {
  static readonly None: IDisposable = Object.freeze({ dispose() {} });

  protected _store = new DisposableStore();

  dispose(): void {
    this._store.dispose();
  }

  protected _register<T extends IDisposable>(disposable: T): T {
    return this._store.add(disposable);
  }
}
