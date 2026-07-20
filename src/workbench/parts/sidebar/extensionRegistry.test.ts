import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionRegistry } from './extensionRegistry.js';

const PREVIOUSLY_INSTALLED = [
  { id: 'marketplace.rust', displayName: 'Rust', languages: [{ id: 'rust', extensions: ['.rs'] }], grammars: [], installPath: '', builtin: false },
];

describe('ExtensionRegistry', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
  });

  it('loadInstalled() is memoized — a second call returns the same promise instead of re-loading', async () => {
    const load = vi.fn().mockResolvedValue({ success: true, extensions: PREVIOUSLY_INSTALLED });
    vi.stubGlobal('window', { electronAPI: { extensionOps: { load, save: vi.fn() } } });

    const registry = new ExtensionRegistry();
    await registry.loadInstalled();
    await registry.loadInstalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('install() awaits loadInstalled() first, so a previously-installed extension is never dropped from the persisted file', async () => {
    // Simulates the exact race the review found: install() firing before the
    // extensionOps.load() IPC round-trip (here, an artificial delay) has resolved.
    const load = vi.fn(() => new Promise(resolve => {
      setTimeout(() => resolve({ success: true, extensions: PREVIOUSLY_INSTALLED }), 10);
    }));
    const save = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('window', { electronAPI: { extensionOps: { load, save } } });

    const registry = new ExtensionRegistry();
    void registry.loadInstalled(); // fired, not yet resolved — matches workbench.ts's own fire-and-forget call

    await registry.install({ id: 'marketplace.go', displayName: 'Go', languages: [{ id: 'go', extensions: ['.go'] }], grammars: [], installPath: '', builtin: false });

    // The previously-installed Rust extension must still be there — install() must not
    // have persisted a list containing only the newly-installed Go entry.
    expect(registry.isInstalled('marketplace.rust')).toBe(true);
    expect(registry.isInstalled('marketplace.go')).toBe(true);
    const lastSavedList = save.mock.calls.at(-1)?.[0];
    expect(lastSavedList.map((e: { id: string }) => e.id)).toEqual(expect.arrayContaining(['marketplace.rust', 'marketplace.go']));
  });

  it('uninstall() likewise awaits loadInstalled() first', async () => {
    const load = vi.fn(() => new Promise(resolve => {
      setTimeout(() => resolve({ success: true, extensions: PREVIOUSLY_INSTALLED }), 10);
    }));
    vi.stubGlobal('window', { electronAPI: { extensionOps: { load, save: vi.fn().mockResolvedValue({ success: true }) } } });

    const registry = new ExtensionRegistry();
    void registry.loadInstalled();

    await registry.uninstall('marketplace.rust');
    expect(registry.isInstalled('marketplace.rust')).toBe(false);
  });
});
