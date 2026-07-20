import { Emitter } from '../../../base/common/event.js';
import { SETTINGS_SCHEMA, getSettingDefinition } from './settingsRegistry.js';
import type { SettingValue } from './settingsRegistry.js';

/**
 * Single source of truth for every persisted user setting — a flat, dot-namespaced
 * Record<string, value> (matching VS Code's own settings.json shape) backed by one file
 * on disk (userData/settings.json via the settings:save/settings:load IPC pair).
 *
 * get() is always synchronous and safe to call before the real persisted values have
 * finished loading (falls back to the schema default) — this matters because several
 * consumers (StatusbarPart's initial human/prog language, in particular) read settings
 * during synchronous Part construction, well before the async IPC round-trip in load()
 * can possibly resolve. Once load() DOES resolve, any value that turns out to differ
 * from what was already being used fires onChange, so early consumers get a chance to
 * correct themselves — see editorPart.ts/statusbarPart.ts's onChange subscriptions.
 */
class SettingsStore {
  private _values: Record<string, SettingValue> = {};
  private _loadPromise: Promise<void> | null = null;
  private readonly _onChange = new Emitter<{ id: string; value: SettingValue }>();
  readonly onChange = this._onChange.event;

  /** Fetches persisted values from disk (once, at app startup — see workbench.ts) and
   *  fires onChange for every key whose real value differs from the schema default it
   *  was standing in for until now. Safe to call multiple times — every call after the
   *  first (whether or not the first has actually finished yet) returns the SAME
   *  in-flight/settled promise rather than re-fetching, so callers that need to be sure
   *  disk contents are merged in before they act (see set() below) can just await this
   *  again instead of racing an already-pending load. */
  load(): Promise<void> {
    if (!this._loadPromise) this._loadPromise = this._doLoad();
    return this._loadPromise;
  }

  private async _doLoad(): Promise<void> {
    const api = window.electronAPI;
    if (!api?.settingsOps) return;

    try {
      const result = await api.settingsOps.load();
      if (!result.success || !result.values) return;
      for (const [id, value] of Object.entries(result.values)) {
        const previous = this.get(id);
        this._values[id] = value;
        if (previous !== value) this._onChange.fire({ id, value });
      }
    } catch { /* keep defaults */ }
  }

  /** Current value for `id`, falling back to its schema default (or `fallback` for an
   *  id with no schema entry at all — should not normally happen for a real setting). */
  get<T extends SettingValue = SettingValue>(id: string, fallback?: T): T {
    if (Object.prototype.hasOwnProperty.call(this._values, id)) {
      return this._values[id] as T;
    }
    const def = getSettingDefinition(id);
    if (def) return def.default as T;
    return fallback as T;
  }

  /** Updates the in-memory value, persists it, and notifies subscribers — in that
   *  order, so a live-apply listener (e.g. an already-open editor's updateOptions())
   *  never reacts to a value that then fails to save.
   *
   *  Awaits load() first — settings:save writes the ENTIRE in-memory _values blob as a
   *  full-file overwrite (see main.cjs), so a set() landing before a still-pending
   *  load() has merged the previously-persisted disk contents in would silently erase
   *  every setting the user hasn't touched yet this session. load() is idempotent and
   *  memoized (a no-op await once it has already resolved), so this costs nothing on
   *  the common path where load() was already kicked off and finished at startup. */
  async set(id: string, value: SettingValue): Promise<void> {
    await this.load();
    this._values[id] = value;
    const api = window.electronAPI;
    if (api?.settingsOps) {
      try { await api.settingsOps.save(this._values); } catch { /* best-effort */ }
    }
    this._onChange.fire({ id, value });
  }

  async resetToDefault(id: string): Promise<void> {
    const def = getSettingDefinition(id);
    if (!def) return;
    delete this._values[id];
    await this.set(id, def.default);
  }

  isDefault(id: string): boolean {
    const def = getSettingDefinition(id);
    if (!def) return true;
    return this.get(id) === def.default;
  }
}

/** One shared instance for the whole renderer — every Part that reads or writes a
 *  setting imports this directly (matching LanguageRegistry's module-level-singleton
 *  convention already used throughout this codebase) rather than being handed one
 *  through constructor injection. */
export const settingsStore = new SettingsStore();

// Re-exported so consumers that only need the schema (e.g. SettingsPanel) don't need a
// second import for something this module already pulls in.
export { SETTINGS_SCHEMA, getSettingDefinition };
export type { SettingDefinition, SettingType, SettingOption, SettingValue } from './settingsRegistry.js';
