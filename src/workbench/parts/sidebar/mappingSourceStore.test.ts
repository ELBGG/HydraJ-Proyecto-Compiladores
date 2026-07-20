import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanLanguageMapping } from '../../../languages/index.js';

const loadMapping = vi.fn();
vi.mock('./githubMappingService.js', () => ({ loadMapping }));

// Imported after the mock is declared (hoisted by vitest either way, but kept in this
// order for readability) so mappingSourceStore.ts's own `import { loadMapping }` binds
// to the mock above.
const { mappingSourceStore, loadAndRegisterAllMappings } = await import('./mappingSourceStore.js');

describe('MappingSourceStore', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    loadMapping.mockReset();
  });

  // Same reasoning as settingsStore.test.ts's load() test: load()'s promise is memoized
  // on the singleton and every mutator (addOrUpdate/remove) awaits it internally, so
  // this MUST run before any test below that calls one of those — otherwise the real
  // stub here would never actually be consulted.
  // load()'s promise is memoized on the singleton for the whole file, so every
  // load()-observing assertion has to live in this ONE test — a second test calling
  // load() again would just get back this same resolved promise without ever
  // consulting its own stub (same reasoning as settingsStore.test.ts's load() test).
  it('load() merges persisted sources with the built-in defaults, heals a pre-humanLangId legacy entry as "es", and never re-fetches on a second call', async () => {
    const load = vi.fn().mockResolvedValue({
      success: true,
      sources: [
        { languageId: 'rust', humanLangId: 'es', repoUrl: 'https://github.com/someone/rust-mappings' },
        // Simulates data written by the pre-fix version of this store, which only ever
        // persisted {languageId, repoUrl} — every source it could have written was Spanish.
        { languageId: 'legacy-lang', repoUrl: 'https://github.com/someone/legacy-mappings' },
      ],
    });
    vi.stubGlobal('window', { electronAPI: { mappingSourceOps: { save: vi.fn(), load } } });

    await mappingSourceStore.load();
    expect(mappingSourceStore.getAll()).toContainEqual({ languageId: 'rust', humanLangId: 'es', repoUrl: 'https://github.com/someone/rust-mappings' });
    expect(mappingSourceStore.getAll()).toContainEqual({ languageId: 'legacy-lang', humanLangId: 'es', repoUrl: 'https://github.com/someone/legacy-mappings' });
    // The 4 built-in defaults (java/c/cpp/python, all humanLangId "es") must still be
    // present — a persisted list must never be able to silently drop them.
    expect(mappingSourceStore.getAll().some(s => s.languageId === 'java' && s.humanLangId === 'es')).toBe(true);

    await mappingSourceStore.load();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('addOrUpdate() appends a new source and persists the full list', async () => {
    const save = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('window', { electronAPI: { mappingSourceOps: { save, load: vi.fn() } } });

    await mappingSourceStore.addOrUpdate({ languageId: 'go', humanLangId: 'es', repoUrl: 'https://github.com/someone/go-mappings' });
    expect(mappingSourceStore.getAll()).toContainEqual({ languageId: 'go', humanLangId: 'es', repoUrl: 'https://github.com/someone/go-mappings' });
    expect(save).toHaveBeenCalledWith(mappingSourceStore.getAll());
  });

  it('addOrUpdate() replaces the existing entry for the same (languageId, humanLangId) pair instead of duplicating it', async () => {
    vi.stubGlobal('window', { electronAPI: { mappingSourceOps: { save: vi.fn(), load: vi.fn() } } });
    await mappingSourceStore.addOrUpdate({ languageId: 'go', humanLangId: 'es', repoUrl: 'https://github.com/someone/go-mappings-v1' });
    await mappingSourceStore.addOrUpdate({ languageId: 'go', humanLangId: 'es', repoUrl: 'https://github.com/someone/go-mappings-v2' });

    const goEntries = mappingSourceStore.getAll().filter(s => s.languageId === 'go' && s.humanLangId === 'es');
    expect(goEntries).toEqual([{ languageId: 'go', humanLangId: 'es', repoUrl: 'https://github.com/someone/go-mappings-v2' }]);
  });

  it('addOrUpdate() with a DIFFERENT humanLangId for the same languageId coexists rather than evicting the other — regression test for the exact bug found installing Italian alongside Spanish for C++', async () => {
    vi.stubGlobal('window', { electronAPI: { mappingSourceOps: { save: vi.fn(), load: vi.fn() } } });
    await mappingSourceStore.addOrUpdate({ languageId: 'cpp-test', humanLangId: 'es', repoUrl: 'https://github.com/someone/cpp-es' });
    await mappingSourceStore.addOrUpdate({ languageId: 'cpp-test', humanLangId: 'it', repoUrl: 'https://github.com/someone/cpp-it' });

    const cppEntries = mappingSourceStore.getAll().filter(s => s.languageId === 'cpp-test');
    expect(cppEntries).toHaveLength(2);
    expect(cppEntries).toContainEqual({ languageId: 'cpp-test', humanLangId: 'es', repoUrl: 'https://github.com/someone/cpp-es' });
    expect(cppEntries).toContainEqual({ languageId: 'cpp-test', humanLangId: 'it', repoUrl: 'https://github.com/someone/cpp-it' });
  });

  it('remove() drops only the source matching both languageId and humanLangId', async () => {
    vi.stubGlobal('window', { electronAPI: { mappingSourceOps: { save: vi.fn(), load: vi.fn() } } });
    await mappingSourceStore.addOrUpdate({ languageId: 'kotlin', humanLangId: 'es', repoUrl: 'https://github.com/someone/kotlin-es' });
    await mappingSourceStore.addOrUpdate({ languageId: 'kotlin', humanLangId: 'it', repoUrl: 'https://github.com/someone/kotlin-it' });
    await mappingSourceStore.remove('kotlin', 'es');

    const kotlinEntries = mappingSourceStore.getAll().filter(s => s.languageId === 'kotlin');
    expect(kotlinEntries).toEqual([{ languageId: 'kotlin', humanLangId: 'it', repoUrl: 'https://github.com/someone/kotlin-it' }]);
  });

  it('fires onChange whenever the list is persisted', async () => {
    vi.stubGlobal('window', { electronAPI: { mappingSourceOps: { save: vi.fn(), load: vi.fn() } } });
    const listener = vi.fn();
    const sub = mappingSourceStore.onChange(listener);
    await mappingSourceStore.addOrUpdate({ languageId: 'swift', humanLangId: 'es', repoUrl: 'https://github.com/someone/swift-mappings' });
    expect(listener).toHaveBeenCalled();
    sub.dispose();
  });
});

describe('loadAndRegisterAllMappings', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', { electronAPI: { mappingSourceOps: { save: vi.fn().mockResolvedValue({ success: true }), load: vi.fn() } } });
    loadMapping.mockReset();
    // Pin down an exact, known list regardless of whatever the singleton accumulated
    // from the describe block above (module-level singleton, shared across this file).
    for (const s of mappingSourceStore.getAll()) await mappingSourceStore.remove(s.languageId, s.humanLangId);
    await mappingSourceStore.addOrUpdate({ languageId: 'good-lang', humanLangId: 'es', repoUrl: 'https://github.com/x/good' });
    await mappingSourceStore.addOrUpdate({ languageId: 'bad-lang', humanLangId: 'es', repoUrl: 'https://github.com/x/bad' });
  });

  it('registers every source that loads successfully and reports per-source outcomes, without one failure blocking the others', async () => {
    const goodMapping = new HumanLanguageMapping('es', 'Spanish', 'Español', 'good-lang', { keywords: { si: 'if' } });
    loadMapping.mockImplementation(async (languageId: string) => {
      if (languageId === 'good-lang') return { mapping: goodMapping, source: 'network' };
      throw new Error('repo not found');
    });

    const outcomes = await loadAndRegisterAllMappings();
    const good = outcomes.find(o => o.languageId === 'good-lang');
    const bad = outcomes.find(o => o.languageId === 'bad-lang');

    expect(good).toMatchObject({ ok: true, source: 'network' });
    expect(bad).toMatchObject({ ok: false, error: 'repo not found' });
  });

  it('rejects (does not register) a mapping whose own langId does not match the configured source languageId', async () => {
    // A repo configured as "good-lang" that actually serves a mapping declaring itself
    // "bad-lang" must never be registered under either key — accepting it under the
    // fetched langId would let a compromised/misconfigured repo silently overwrite a
    // completely different language's registry entry.
    const wrongMapping = new HumanLanguageMapping('es', 'Spanish', 'Español', 'bad-lang', { keywords: { si: 'if' } });
    loadMapping.mockImplementation(async (languageId: string) => {
      if (languageId === 'good-lang') return { mapping: wrongMapping, source: 'network' };
      throw new Error('repo not found');
    });

    const outcomes = await loadAndRegisterAllMappings();
    const good = outcomes.find(o => o.languageId === 'good-lang');
    expect(good?.ok).toBe(false);
    expect(good?.error).toContain('bad-lang');
  });

  it('rejects (does not register) a mapping whose own id (human language) does not match the configured source humanLangId', async () => {
    // A source configured as ("good-lang", "es") that actually serves a mapping whose
    // own `id` is "it" must be rejected the same way a languageId mismatch is — this is
    // exactly the class of bug that let installing Italian silently take over the
    // Spanish C++ source's slot before humanLangId was part of the key.
    const wrongHumanLang = new HumanLanguageMapping('it', 'Italian', 'Italiano', 'good-lang', { keywords: { se: 'if' } });
    loadMapping.mockImplementation(async (languageId: string) => {
      if (languageId === 'good-lang') return { mapping: wrongHumanLang, source: 'network' };
      throw new Error('repo not found');
    });

    const outcomes = await loadAndRegisterAllMappings();
    const good = outcomes.find(o => o.languageId === 'good-lang');
    expect(good?.ok).toBe(false);
    expect(good?.error).toContain('it');
  });

  it('records outcomes on the store so a UI can read the latest status without re-running the load', async () => {
    const goodMapping = new HumanLanguageMapping('es', 'Spanish', 'Español', 'good-lang', { keywords: { si: 'if' } });
    loadMapping.mockImplementation(async (languageId: string) => {
      if (languageId === 'good-lang') return { mapping: goodMapping, source: 'cache' };
      throw new Error('repo not found');
    });

    const listener = vi.fn();
    const sub = mappingSourceStore.onOutcomesChange(listener);
    await loadAndRegisterAllMappings();
    sub.dispose();

    expect(listener).toHaveBeenCalled();
    const outcomes = mappingSourceStore.getLastOutcomes();
    expect(outcomes.find(o => o.languageId === 'good-lang')).toMatchObject({ ok: true, source: 'cache' });
    expect(outcomes.find(o => o.languageId === 'bad-lang')).toMatchObject({ ok: false });
  });
});
