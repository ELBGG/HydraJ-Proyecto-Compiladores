import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IStorageService = createDecorator<IStorageService>('storageService');

export type StorageValue = string | boolean | number | undefined | null | object;

export const enum StorageScope {
  APPLICATION_SHARED = -2,
  APPLICATION = -1,
  PROFILE = 0,
  WORKSPACE = 1,
}

export const enum StorageTarget {
  USER,
  MACHINE,
}

export const enum WillSaveStateReason {
  NONE,
  SHUTDOWN,
}

export interface IWillSaveStateEvent {
  readonly reason: WillSaveStateReason;
}

export interface IStorageValueChangeEvent {
  readonly scope: StorageScope;
  readonly key: string;
  readonly target: StorageTarget | undefined;
  readonly external?: boolean;
}

export interface IStorageEntry {
  readonly key: string;
  readonly value: StorageValue;
  readonly scope: StorageScope;
  readonly target: StorageTarget;
}

export interface IStorageService {
  readonly _serviceBrand: undefined;

  onDidChangeValue(scope: StorageScope, key: string | undefined, disposable: DisposableStore): Event<IStorageValueChangeEvent>;

  readonly onWillSaveState: Event<IWillSaveStateEvent>;

  get(key: string, scope: StorageScope, fallbackValue: string): string;
  get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined;

  getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
  getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined;

  getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
  getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined;

  getObject<T extends object>(key: string, scope: StorageScope, fallbackValue: T): T;
  getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): T | undefined;

  store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget): void;
  storeAll(entries: Array<IStorageEntry>, external: boolean): void;
  remove(key: string, scope: StorageScope): void;
  keys(scope: StorageScope, target: StorageTarget): string[];

  isNew(scope: StorageScope): boolean;
  flush(reason?: WillSaveStateReason): Promise<void>;
}

/**
 * Minimal in-memory + localStorage-backed implementation of {@link IStorageService}.
 * Faithful to the interface contract used by Memento/Component; does not implement
 * VS Code's full multi-tier storage DB engine.
 */
export class BrowserStorageService implements IStorageService {
  readonly _serviceBrand: undefined;

  private readonly maps = new Map<StorageScope, Map<string, string>>([
    [StorageScope.APPLICATION_SHARED, new Map()],
    [StorageScope.APPLICATION, new Map()],
    [StorageScope.PROFILE, new Map()],
    [StorageScope.WORKSPACE, new Map()],
  ]);

  private readonly targets = new Map<StorageScope, Map<string, StorageTarget>>([
    [StorageScope.APPLICATION_SHARED, new Map()],
    [StorageScope.APPLICATION, new Map()],
    [StorageScope.PROFILE, new Map()],
    [StorageScope.WORKSPACE, new Map()],
  ]);
  private readonly newScopes = new Set<StorageScope>([
    StorageScope.APPLICATION_SHARED,
    StorageScope.APPLICATION,
    StorageScope.PROFILE,
    StorageScope.WORKSPACE,
  ]);

  private readonly _onWillSaveState = new Emitter<IWillSaveStateEvent>();
  readonly onWillSaveState = this._onWillSaveState.event;

  private readonly _onDidChangeValue = new Emitter<IStorageValueChangeEvent>();

  constructor(private readonly prefix: string = 'hydracode') {
    this.load();
  }

  private storageKey(scope: StorageScope, key: string): string {
    return `${this.prefix}/${scope}/${key}`;
  }

  private load(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (!fullKey || !fullKey.startsWith(`${this.prefix}/`)) {
        continue;
      }
      const rest = fullKey.slice(this.prefix.length + 1);
      const sepIndex = rest.indexOf('/');
      if (sepIndex === -1) {
        continue;
      }
      const scope = Number(rest.slice(0, sepIndex)) as StorageScope;
      const key = rest.slice(sepIndex + 1);
      const map = this.maps.get(scope);
      if (map) {
        map.set(key, localStorage.getItem(fullKey) ?? '');
        this.newScopes.delete(scope);
      }
    }
  }

  onDidChangeValue(scope: StorageScope, key: string | undefined, _disposable: DisposableStore): Event<IStorageValueChangeEvent> {
    return Event.filter(this._onDidChangeValue.event, e => e.scope === scope && (key === undefined || e.key === key));
  }

  get(key: string, scope: StorageScope, fallbackValue: string): string;
  get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined;
  get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined {
    return this.maps.get(scope)?.get(key) ?? fallbackValue;
  }

  getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
  getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined;
  getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
    const value = this.get(key, scope);
    return value === undefined ? fallbackValue : value === 'true';
  }

  getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
  getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined;
  getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
    const value = this.get(key, scope);
    return value === undefined ? fallbackValue : parseInt(value, 10);
  }

  getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): T | undefined {
    const value = this.get(key, scope);
    if (value === undefined) {
      return fallbackValue;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallbackValue;
    }
  }

  store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget): void {
    if (value === undefined || value === null) {
      this.remove(key, scope);
      return;
    }
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    this.maps.get(scope)?.set(key, serialized);
    this.targets.get(scope)?.set(key, target);
    this.persist(scope, key, serialized);
    this._onDidChangeValue.fire({ scope, key, target });
  }

  storeAll(entries: Array<IStorageEntry>, external: boolean): void {
    for (const entry of entries) {
      this.store(entry.key, entry.value, entry.scope, entry.target);
    }
  }

  remove(key: string, scope: StorageScope): void {
    this.maps.get(scope)?.delete(key);
    this.targets.get(scope)?.delete(key);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.storageKey(scope, key));
    }
    this._onDidChangeValue.fire({ scope, key, target: undefined });
  }

  keys(scope: StorageScope, target: StorageTarget): string[] {
    const map = this.maps.get(scope);
    if (!map) {
      return [];
    }
    const targetsForScope = this.targets.get(scope);
    return [...map.keys()].filter(key => targetsForScope?.get(key) === target);
  }

  isNew(scope: StorageScope): boolean {
    return this.newScopes.has(scope);
  }

  private persist(scope: StorageScope, key: string, value: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey(scope, key), value);
    }
  }

  async flush(reason: WillSaveStateReason = WillSaveStateReason.NONE): Promise<void> {
    this._onWillSaveState.fire({ reason });
  }
}
