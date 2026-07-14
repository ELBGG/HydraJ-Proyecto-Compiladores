import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import {
  ContextKeyExpression,
  ContextKeyValue,
  IContext,
  IContextKey,
  IContextKeyChangeEvent,
  IContextKeyService,
  IContextKeyServiceTarget,
  IScopedContextKeyService,
} from '../common/contextkey.js';

class Context implements IContext {
  constructor(private readonly _parent: Context | null, private readonly _value: Map<string, unknown>) {}

  getValue<T extends ContextKeyValue>(key: string): T | undefined {
    if (this._value.has(key)) {
      return this._value.get(key) as T;
    }
    return this._parent?.getValue<T>(key);
  }

  setValue(key: string, value: unknown): boolean {
    if (this._value.get(key) !== value) {
      this._value.set(key, value);
      return true;
    }
    return false;
  }

  removeValue(key: string): boolean {
    return this._value.delete(key);
  }
}

class ContextKeyChangeEvent implements IContextKeyChangeEvent {
  constructor(private readonly _keys: Set<string>) {}
  affectsSome(keys: { has(value: string): boolean }): boolean {
    for (const key of this._keys) {
      if (keys.has(key)) return true;
    }
    return false;
  }
  allKeysContainedIn(keys: { has(value: string): boolean }): boolean {
    for (const key of this._keys) {
      if (!keys.has(key)) return false;
    }
    return true;
  }
}

class ContextKey<T extends ContextKeyValue> implements IContextKey<T> {
  constructor(
    private readonly _service: AbstractContextKeyService,
    private readonly _key: string,
    private readonly _defaultValue: T | undefined,
  ) {
    this.reset();
  }

  set(value: T): void {
    this._service.setContext(this._key, value);
  }

  reset(): void {
    if (this._defaultValue === undefined) {
      this._service.removeContext(this._key);
    } else {
      this._service.setContext(this._key, this._defaultValue);
    }
  }

  get(): T | undefined {
    return this._service.getContextKeyValue<T>(this._key);
  }
}

abstract class AbstractContextKeyService extends Disposable implements IContextKeyService {
  declare readonly _serviceBrand: undefined;

  protected _isDisposed = false;
  protected _onDidChangeContext = this._register(new Emitter<IContextKeyChangeEvent>());
  readonly onDidChangeContext: Event<IContextKeyChangeEvent> = this._onDidChangeContext.event;

  private _pendingChanges: Set<string> | null = null;

  abstract createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): IContextKey<T>;
  abstract getContextValuesContainer(contextId: number): Context;
  abstract getContext(target: IContextKeyServiceTarget | null): IContext;
  abstract createScoped(target: IContextKeyServiceTarget): IScopedContextKeyService;
  abstract createOverlay(overlay: Iterable<[string, ContextKeyValue]>): IContextKeyService;
  abstract updateParent(parentContextKeyService: IContextKeyService): void;

  bufferChangeEvents(callback: () => void): void {
    const isFirst = this._pendingChanges === null;
    if (isFirst) {
      this._pendingChanges = new Set();
    }
    try {
      callback();
    } finally {
      if (isFirst) {
        const changed = this._pendingChanges!;
        this._pendingChanges = null;
        if (changed.size > 0) {
          this._onDidChangeContext.fire(new ContextKeyChangeEvent(changed));
        }
      }
    }
  }

  protected _notify(key: string): void {
    if (this._pendingChanges) {
      this._pendingChanges.add(key);
    } else {
      this._onDidChangeContext.fire(new ContextKeyChangeEvent(new Set([key])));
    }
  }

  setContext(key: string, value: unknown): void {
    if (this._isDisposed) return;
    const container = this.getContextValuesContainer(this._myContextId);
    if (container.setValue(key, value)) {
      this._notify(key);
    }
  }

  removeContext(key: string): void {
    if (this._isDisposed) return;
    const container = this.getContextValuesContainer(this._myContextId);
    if (container.removeValue(key)) {
      this._notify(key);
    }
  }

  getContextKeyValue<T>(key: string): T | undefined {
    if (this._isDisposed) return undefined;
    return this.getContextValuesContainer(this._myContextId).getValue<T extends ContextKeyValue ? T : never>(key) as T | undefined;
  }

  contextMatchesRules(rules: ContextKeyExpression | undefined): boolean {
    if (this._isDisposed) return false;
    const context = this.getContextValuesContainer(this._myContextId);
    return !!rules?.evaluate(context) || rules === undefined;
  }

  protected abstract get _myContextId(): number;
}

let _contextIdSeed = 1;

export class ContextKeyService extends AbstractContextKeyService implements IContextKeyService {
  private readonly _contextId = _contextIdSeed++;
  private readonly _contexts = new Map<number, Context>([[this._contextId, new Context(null, new Map())]]);
  private _parent: IContextKeyService | undefined;

  protected override get _myContextId(): number {
    return this._contextId;
  }

  createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): IContextKey<T> {
    return new ContextKey(this, key, defaultValue);
  }

  getContextValuesContainer(contextId: number): Context {
    return this._contexts.get(contextId) ?? this._contexts.get(this._contextId)!;
  }

  getContext(_target: IContextKeyServiceTarget | null): IContext {
    return this.getContextValuesContainer(this._contextId);
  }

  createScoped(_target: IContextKeyServiceTarget): IScopedContextKeyService {
    return new ScopedContextKeyService(this);
  }

  createOverlay(overlay: Iterable<[string, ContextKeyValue]>): IContextKeyService {
    const map = new Map(overlay);
    const base = this;
    return new class extends AbstractContextKeyService {
      protected override get _myContextId(): number {
        return base._myContextId;
      }
      createKey<T extends ContextKeyValue>(): IContextKey<T> {
        throw new Error('Cannot create keys on overlay context');
      }
      getContextValuesContainer(contextId: number): Context {
        const inner = base.getContextValuesContainer(contextId);
        return new Context(inner, new Map(map as Map<string, unknown>));
      }
      getContext(target: IContextKeyServiceTarget | null): IContext {
        return base.getContext(target);
      }
      createScoped(target: IContextKeyServiceTarget): IScopedContextKeyService {
        return base.createScoped(target);
      }
      createOverlay(o: Iterable<[string, ContextKeyValue]>): IContextKeyService {
        return base.createOverlay(o);
      }
      updateParent(): void {
        // no-op for overlay
      }
    }();
  }

  updateParent(parentContextKeyService: IContextKeyService): void {
    this._parent = parentContextKeyService;
  }
}

class ScopedContextKeyService extends AbstractContextKeyService implements IScopedContextKeyService {
  private readonly _contextId = _contextIdSeed++;
  private readonly _ownContext: Context;

  constructor(private readonly _parent: ContextKeyService) {
    super();
    // Chain to the parent's own context container (mirrors createOverlay's
    // `new Context(inner, ...)`) so lookups that miss in `_ownContext` fall
    // back through `Context.getValue`'s `_parent?.getValue(key)` to reach
    // ancestor-set keys instead of silently resolving to undefined.
    this._ownContext = new Context(this._parent.getContextValuesContainer(this._contextId), new Map());
  }

  protected override get _myContextId(): number {
    return this._contextId;
  }

  createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): IContextKey<T> {
    return new ContextKey(this, key, defaultValue);
  }

  getContextValuesContainer(contextId: number): Context {
    if (contextId === this._contextId) {
      return this._ownContext;
    }
    return this._parent.getContextValuesContainer(contextId);
  }

  getContext(_target: IContextKeyServiceTarget | null): IContext {
    return this._ownContext;
  }

  createScoped(_target: IContextKeyServiceTarget): IScopedContextKeyService {
    return new ScopedContextKeyService(this._parent);
  }

  createOverlay(overlay: Iterable<[string, ContextKeyValue]>): IContextKeyService {
    return this._parent.createOverlay(overlay);
  }

  updateParent(_parentContextKeyService: IContextKeyService): void {
    // Left as a no-op: `_parent` is a `readonly ContextKeyService` (not the
    // wider `IContextKeyService` this method receives), and `_ownContext`'s
    // parent link is fixed at construction time to match it. Re-parenting
    // for real would mean loosening both to mutable, narrowing/validating
    // the incoming `IContextKeyService` down to a concrete `ContextKeyService`,
    // rebuilding `_ownContext` around the new parent container, and firing
    // change notifications for any keys whose resolved value shifts as a
    // result - not a safe one-line change, so scoped services keep their
    // own static parent reference for now.
  }
}
