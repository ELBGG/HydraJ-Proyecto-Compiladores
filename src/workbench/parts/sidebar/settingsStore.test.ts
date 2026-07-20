import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settingsStore } from './settingsStore.js';

describe('SettingsStore', () => {
  beforeEach(() => {
    // Fresh, IPC-less window for every test — get()/set() must both work with no
    // electronAPI at all (e.g. running outside Electron), and each test starts with
    // no assumptions about what a previous test in this file left in memory.
    vi.stubGlobal('window', {});
  });

  it('falls back to the schema default for a setting nothing has touched yet', () => {
    expect(settingsStore.get('editor.fontSize')).toBe(13);
    expect(settingsStore.get('editor.minimapEnabled')).toBe(false);
  });

  it('falls back to the given fallback for an id with no schema entry at all', () => {
    expect(settingsStore.get('not.a.real.setting', 'fallback-value')).toBe('fallback-value');
  });

  // load() only ever does real work once per app session (the promise it returns is
  // memoized on the singleton) and set() now awaits it internally (see set()'s own
  // comment — it must, to avoid overwriting disk with an unmerged in-memory blob), so
  // this MUST run before any test below that calls set()/resetToDefault() — otherwise
  // that earlier set() call would already have resolved (and memoized) a no-op load()
  // against the plain `window = {}` from beforeEach, and this test's real stub would
  // never actually be consulted. Both the "applies values" and "only fires once"
  // behaviors are asserted together here for the same reason — there's only one chance
  // to observe a real (non-memoized) load() in this file.
  it('load() applies persisted values, fires onChange only for values that actually differ from the default, and never re-fetches on a second call', async () => {
    const load = vi.fn().mockResolvedValue({
      success: true,
      values: { 'editor.fontSize': 13, 'editor.tabSize': 8 },
    });
    vi.stubGlobal('window', { electronAPI: { settingsOps: { save: vi.fn(), load } } });

    const listener = vi.fn();
    const sub = settingsStore.onChange(listener);
    await settingsStore.load();
    sub.dispose();

    expect(settingsStore.get('editor.tabSize')).toBe(8);
    // fontSize's persisted value (13) equals the schema default it was already
    // returning, so no onChange should fire for it — only tabSize actually changed.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ id: 'editor.tabSize', value: 8 });

    await settingsStore.load();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('set() updates the in-memory value returned by get()', async () => {
    await settingsStore.set('editor.fontSize', 20);
    expect(settingsStore.get('editor.fontSize')).toBe(20);
  });

  it('set() fires onChange with the new id/value', async () => {
    const listener = vi.fn();
    const sub = settingsStore.onChange(listener);
    await settingsStore.set('editor.fontSize', 2);
    expect(listener).toHaveBeenCalledWith({ id: 'editor.fontSize', value: 2 });
    sub.dispose();
  });

  it('set() persists via window.electronAPI.settingsOps.save when available', async () => {
    const save = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('window', { electronAPI: { settingsOps: { save, load: vi.fn() } } });
    await settingsStore.set('ai.model', 'test-model');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({ 'ai.model': 'test-model' });
  });

  it('set() does not throw when settingsOps.save rejects — best-effort persistence', async () => {
    vi.stubGlobal('window', { electronAPI: { settingsOps: { save: vi.fn().mockRejectedValue(new Error('disk full')), load: vi.fn() } } });
    await expect(settingsStore.set('editor.fontSize', 15)).resolves.toBeUndefined();
    expect(settingsStore.get('editor.fontSize')).toBe(15);
  });

  it('resetToDefault() restores the schema default and fires onChange', async () => {
    await settingsStore.set('editor.fontSize', 24);
    expect(settingsStore.get('editor.fontSize')).toBe(24);
    await settingsStore.resetToDefault('editor.fontSize');
    expect(settingsStore.get('editor.fontSize')).toBe(13);
  });

  it('resetToDefault() is a no-op for an id with no schema entry', async () => {
    await expect(settingsStore.resetToDefault('not.a.real.setting')).resolves.toBeUndefined();
  });

  it('isDefault() reflects whether the current value matches the schema default', async () => {
    expect(settingsStore.isDefault('editor.wordWrap')).toBe(true);
    await settingsStore.set('editor.wordWrap', 'off');
    expect(settingsStore.isDefault('editor.wordWrap')).toBe(false);
    await settingsStore.resetToDefault('editor.wordWrap');
    expect(settingsStore.isDefault('editor.wordWrap')).toBe(true);
  });
});
