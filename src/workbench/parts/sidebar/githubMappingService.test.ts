import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseGitHubRepoUrl, loadMapping } from './githubMappingService.js';

const VALID_MAPPING_JSON = JSON.stringify({ langId: 'rust', keywords: { si: 'if' } });

describe('parseGitHubRepoUrl', () => {
  it('accepts a plain https://github.com/owner/repo URL', () => {
    expect(parseGitHubRepoUrl('https://github.com/HydraCode-Team/Python-mappings-hydracode'))
      .toEqual({ owner: 'HydraCode-Team', repo: 'Python-mappings-hydracode' });
  });

  it('tolerates a trailing .git and/or trailing slash', () => {
    expect(parseGitHubRepoUrl('https://github.com/HydraCode-Team/Python-mappings-hydracode.git'))
      .toEqual({ owner: 'HydraCode-Team', repo: 'Python-mappings-hydracode' });
    expect(parseGitHubRepoUrl('https://github.com/HydraCode-Team/Python-mappings-hydracode/'))
      .toEqual({ owner: 'HydraCode-Team', repo: 'Python-mappings-hydracode' });
  });

  it('rejects a non-GitHub URL', () => {
    expect(() => parseGitHubRepoUrl('https://gitlab.com/foo/bar')).toThrow();
  });

  it('rejects a GitHub URL with extra path segments', () => {
    expect(() => parseGitHubRepoUrl('https://github.com/foo/bar/tree/main')).toThrow();
  });

  it('rejects a bare owner with no repo', () => {
    expect(() => parseGitHubRepoUrl('https://github.com/foo')).toThrow();
  });
});

describe('loadMapping', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
  });

  it('fetches from the network, resolving the default branch first, and caches the result under a languageId-humanLangId key', async () => {
    const saveCache = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('window', { electronAPI: { mappingOps: { saveCache, loadCache: vi.fn() } } });

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://api.github.com/repos/HydraCode-Team/Rust-mappings-hydracode') {
        return { ok: true, json: async () => ({ default_branch: 'main' }) };
      }
      if (url === 'https://raw.githubusercontent.com/HydraCode-Team/Rust-mappings-hydracode/main/mapping.json') {
        return { ok: true, text: async () => VALID_MAPPING_JSON };
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadMapping('rust', 'es', 'https://github.com/HydraCode-Team/Rust-mappings-hydracode');
    expect(result.source).toBe('network');
    expect(result.mapping.languageId).toBe('rust');
    expect(result.mapping.keywords.si).toBe('if');
    // Keyed by BOTH languageId and humanLangId — a second human-language mapping for
    // the same target language (e.g. Italian alongside Spanish for C++) must cache to
    // a different file, never silently overwrite this one's cached copy.
    expect(saveCache).toHaveBeenCalledWith('rust-es', VALID_MAPPING_JSON);
  });

  it('falls back to the cache when the network fetch fails entirely', async () => {
    const loadCache = vi.fn().mockResolvedValue({ success: true, json: VALID_MAPPING_JSON });
    vi.stubGlobal('window', { electronAPI: { mappingOps: { saveCache: vi.fn(), loadCache } } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await loadMapping('rust', 'es', 'https://github.com/HydraCode-Team/Rust-mappings-hydracode');
    expect(result.source).toBe('cache');
    expect(result.mapping.languageId).toBe('rust');
    expect(loadCache).toHaveBeenCalledWith('rust-es');
  });

  it('falls back to the cache when the repo/mapping.json 404s', async () => {
    const loadCache = vi.fn().mockResolvedValue({ success: true, json: VALID_MAPPING_JSON });
    vi.stubGlobal('window', { electronAPI: { mappingOps: { saveCache: vi.fn(), loadCache } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const result = await loadMapping('rust', 'es', 'https://github.com/HydraCode-Team/Rust-mappings-hydracode');
    expect(result.source).toBe('cache');
  });

  it('throws the original network error when there is no cache to fall back to', async () => {
    const loadCache = vi.fn().mockResolvedValue({ success: false, json: null });
    vi.stubGlobal('window', { electronAPI: { mappingOps: { saveCache: vi.fn(), loadCache } } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline and no cache')));

    await expect(loadMapping('rust', 'es', 'https://github.com/HydraCode-Team/Rust-mappings-hydracode'))
      .rejects.toThrow('offline and no cache');
  });

  it('a best-effort cache-write failure never blocks returning the freshly-fetched mapping', async () => {
    const saveCache = vi.fn().mockRejectedValue(new Error('disk full'));
    vi.stubGlobal('window', { electronAPI: { mappingOps: { saveCache, loadCache: vi.fn() } } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('api.github.com')) return { ok: true, json: async () => ({ default_branch: 'main' }) };
      return { ok: true, text: async () => VALID_MAPPING_JSON };
    }));

    const result = await loadMapping('rust', 'es', 'https://github.com/HydraCode-Team/Rust-mappings-hydracode');
    expect(result.source).toBe('network');
  });

  it('falls back to the cache instead of accepting an oversized mapping.json (Content-Length header)', async () => {
    const loadCache = vi.fn().mockResolvedValue({ success: true, json: VALID_MAPPING_JSON });
    vi.stubGlobal('window', { electronAPI: { mappingOps: { saveCache: vi.fn(), loadCache } } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('api.github.com')) return { ok: true, json: async () => ({ default_branch: 'main' }) };
      return {
        ok: true,
        headers: { get: (name: string) => (name === 'content-length' ? String(3 * 1024 * 1024) : null) },
        text: async () => 'should never be read',
      };
    }));

    const result = await loadMapping('rust', 'es', 'https://github.com/HydraCode-Team/Rust-mappings-hydracode');
    expect(result.source).toBe('cache');
  });

  it('falls back to the cache instead of accepting an oversized mapping.json (no/lying Content-Length)', async () => {
    const loadCache = vi.fn().mockResolvedValue({ success: true, json: VALID_MAPPING_JSON });
    vi.stubGlobal('window', { electronAPI: { mappingOps: { saveCache: vi.fn(), loadCache } } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('api.github.com')) return { ok: true, json: async () => ({ default_branch: 'main' }) };
      return { ok: true, headers: { get: () => null }, text: async () => 'x'.repeat(3 * 1024 * 1024) };
    }));

    const result = await loadMapping('rust', 'es', 'https://github.com/HydraCode-Team/Rust-mappings-hydracode');
    expect(result.source).toBe('cache');
  });

  it('caches two human-language mappings for the same target language independently, without one overwriting the other', async () => {
    // Regression test for the exact bug found installing Italian alongside Spanish for
    // C++: both used to cache to the same languageId-only key.
    const store = new Map<string, string>();
    const saveCache = vi.fn(async (key: string, json: string) => { store.set(key, json); return { success: true }; });
    vi.stubGlobal('window', { electronAPI: { mappingOps: { saveCache, loadCache: vi.fn() } } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('api.github.com')) return { ok: true, json: async () => ({ default_branch: 'main' }) };
      const isItalian = url.includes('Italian');
      return { ok: true, text: async () => JSON.stringify({ langId: 'rust', keywords: { si: isItalian ? undefined : 'if', se: isItalian ? 'if' : undefined } }) };
    }));

    await loadMapping('rust', 'es', 'https://github.com/HydraCode-Team/Rust-mappings-hydracode');
    await loadMapping('rust', 'it', 'https://github.com/HydraCode-Team/Rust-Italian-mappings-hydracode');

    expect(store.has('rust-es')).toBe(true);
    expect(store.has('rust-it')).toBe(true);
    expect(store.get('rust-es')).not.toBe(store.get('rust-it'));
  });
});
