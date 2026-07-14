import { combinedDisposable, Disposable, DisposableStore, IDisposable } from './lifecycle.js';

export type Listener<T> = (event: T) => void;

export interface Event<T> {
  (listener: Listener<T>, thisArgs?: unknown, disposables?: DisposableStore): IDisposable;
}

export namespace Event {
  export const None: Event<any> = () => Disposable.None;

  export function map<I, O>(event: Event<I>, fn: (i: I) => O): Event<O> {
    return (listener, thisArgs, disposables) =>
      event(i => listener.call(thisArgs, fn(i)), undefined, disposables);
  }

  export function filter<T>(event: Event<T>, predicate: (e: T) => boolean): Event<T> {
    return (listener, thisArgs, disposables) =>
      event(e => { if (predicate(e)) { listener.call(thisArgs, e); } }, undefined, disposables);
  }

  export function signal<T>(event: Event<T>): Event<void> {
    return event as Event<any> as Event<void>;
  }

  export function any<T>(...events: Event<T>[]): Event<T>;
  export function any(...events: Event<any>[]): Event<void>;
  export function any<T>(...events: Event<T>[]): Event<T> {
    return (listener, thisArgs, disposables) => {
      const disposable = combinedDisposable(...events.map(event => event(e => listener.call(thisArgs, e))));
      if (disposables) {
        disposables.add(disposable);
      }
      return disposable;
    };
  }

  export function latch<T>(event: Event<T>, equals: (a: T, b: T) => boolean = (a, b) => a === b): Event<T> {
    let firstCall = true;
    let cache: T;

    return filter(event, value => {
      const shouldEmit = firstCall || !equals(value, cache);
      firstCall = false;
      cache = value;
      return shouldEmit;
    });
  }

  export function split<T, U>(event: Event<T | U>, isT: (e: T | U) => e is T): [Event<T>, Event<U>] {
    return [
      filter(event, isT) as Event<T>,
      filter(event, e => !isT(e)) as Event<U>,
    ];
  }
}

export class Relay<T> implements IDisposable {
  private inputEvent: Event<T> = Event.None;
  private inputEventListener: IDisposable = Disposable.None;
  private readonly emitter = new Emitter<T>();
  readonly event: Event<T> = this.emitter.event;

  set input(event: Event<T>) {
    this.inputEventListener.dispose();
    this.inputEvent = event;
    this.inputEventListener = event(e => this.emitter.fire(e));
  }

  dispose(): void {
    this.inputEventListener.dispose();
    this.emitter.dispose();
  }
}

export class Emitter<T> {
  private _listeners: Listener<T>[] = [];
  private _disposed = false;

  get event(): Event<T> {
    return (listener, thisArgs, disposables) => {
      if (this._disposed) {
        throw new Error('Emitter is disposed');
      }
      const boundListener = thisArgs === undefined ? listener : listener.bind(thisArgs);
      this._listeners.push(boundListener);
      const result: IDisposable = {
        dispose: () => {
          const idx = this._listeners.indexOf(boundListener);
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

export class DomEmitter<T> implements IDisposable {
  private readonly _emitter = new Emitter<T>();
  readonly event: Event<T> = this._emitter.event;
  private readonly _listener: (e: any) => void;

  constructor(element: EventTarget, type: string, useCapture?: boolean) {
    this._listener = (e: T) => this._emitter.fire(e);
    element.addEventListener(type, this._listener, useCapture);
    this._disposeListener = () => element.removeEventListener(type, this._listener, useCapture);
  }

  private readonly _disposeListener: () => void;

  dispose(): void {
    this._disposeListener();
    this._emitter.dispose();
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
