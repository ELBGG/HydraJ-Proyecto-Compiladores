import { parseMappingFile } from '../../../languages/index.js';
import type { HumanLanguageMapping } from '../../../languages/index.js';

/** Both api.github.com and raw.githubusercontent.com send Access-Control-Allow-Origin:
 *  * on public resources (confirmed live before building this) — unlike the AI
 *  interpreter's provider, no main-process proxy is needed here; these fetches run
 *  directly in the renderer. */
export function parseGitHubRepoUrl(url: string): { owner: string; repo: string } {
  const cleaned = url.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const match = cleaned.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error('URL de repositorio de GitHub inválida. Debe tener la forma https://github.com/usuario/repositorio');
  }
  return { owner: match[1], repo: match[2] };
}

/** Every mapping fetch shares ONE deadline across both the branch-lookup and raw-content
 *  requests (a single AbortSignal.timeout ticks from creation, not per fetch call) — a
 *  hanging/very slow network must fall back to the local cache quickly on app startup,
 *  not after however long two sequential requests individually take to time out on
 *  their own. */
const FETCH_TIMEOUT_MS = 8_000;
/** Generous for a real mapping (the largest bundled today, Java's, is ~4.6KB) — guards
 *  against a malicious/misbehaving repo serving a huge mapping.json that would otherwise
 *  consume excessive memory or block the UI thread while JSON.parse runs synchronously
 *  on it, every app launch (found by this session's adversarial review). */
const MAX_MAPPING_JSON_CHARS = 2 * 1024 * 1024;

async function resolveDefaultBranch(owner: string, repo: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { signal });
  if (!res.ok) {
    throw new Error(res.status === 404
      ? `No se encontró el repositorio "${owner}/${repo}".`
      : `No se pudo consultar el repositorio (HTTP ${res.status}).`);
  }
  const data = await res.json();
  if (typeof data?.default_branch !== 'string') {
    throw new Error('Respuesta inesperada de la API de GitHub.');
  }
  return data.default_branch;
}

/** Fetches mapping.json's raw text from a repo's default branch — text, not parsed, so
 *  the exact bytes can also be handed to the local cache unchanged. */
async function fetchMappingJsonText(repoUrl: string, mappingPath = 'mapping.json'): Promise<string> {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const branch = await resolveDefaultBranch(owner, repo, signal);
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${mappingPath}`;
  const res = await fetch(rawUrl, { signal });
  if (!res.ok) {
    throw new Error(`No se encontró "${mappingPath}" en ${owner}/${repo} (rama ${branch}, HTTP ${res.status}).`);
  }
  const contentLength = Number(res.headers?.get('content-length'));
  if (contentLength > MAX_MAPPING_JSON_CHARS) {
    throw new Error(`"${mappingPath}" en ${owner}/${repo} es demasiado grande (${contentLength} bytes, límite ${MAX_MAPPING_JSON_CHARS}).`);
  }
  const text = await res.text();
  // Content-Length can be absent or lied about — the actual length is the real guard.
  if (text.length > MAX_MAPPING_JSON_CHARS) {
    throw new Error(`"${mappingPath}" en ${owner}/${repo} es demasiado grande (${text.length} caracteres, límite ${MAX_MAPPING_JSON_CHARS}).`);
  }
  return text;
}

/** A target language can have more than one human-language mapping installed (e.g.
 *  Spanish AND Italian for C++) — the on-disk cache must be keyed by BOTH, or two
 *  mappings for the same target language silently overwrite each other's cached copy,
 *  same reasoning as MappingSource's own doc comment in mappingSourceStore.ts. */
function cacheKeyFor(languageId: string, humanLangId: string): string {
  return `${languageId}-${humanLangId}`;
}

/** Fetches+parses a mapping from a repo the user is adding for the first time (the
 *  Mappings module's "Cargar mapping desde GitHub" panel) — no languageId/humanLangId is
 *  known ahead of time here (the fetched mapping.json is what determines both), so
 *  there's nothing meaningful to check in the local cache first the way loadMapping()
 *  does for an already-configured source. Still writes the result to cache (keyed by
 *  what the fetch itself revealed) so this repo benefits from offline resilience on
 *  every later launch. */
export async function installMappingFromRepo(repoUrl: string): Promise<HumanLanguageMapping> {
  const json = await fetchMappingJsonText(repoUrl);
  const mapping = parseMappingFile(JSON.parse(json));
  void window.electronAPI?.mappingOps?.saveCache(cacheKeyFor(mapping.languageId, mapping.id), json).catch(() => { /* best-effort */ });
  return mapping;
}

export type MappingSource = 'network' | 'cache';

/**
 * Loads a mapping for the (`languageId`, `humanLangId`) pair from `repoUrl` — network
 * first, falling back to the last successfully-fetched copy cached in
 * userData/mappings/<languageId>-<humanLangId>.json (via main.cjs's
 * mappings:save-cache/load-cache IPC, the same pattern the Vosk model cache already
 * uses) when the network fetch fails for any reason (offline, repo renamed/deleted,
 * rate-limited). A successful network fetch's raw JSON is cached best-effort (a
 * cache-write failure must never block using the mapping that was just fetched fine).
 * Throws only when BOTH the network fetch and the cache come back empty/invalid.
 */
export async function loadMapping(
  languageId: string,
  humanLangId: string,
  repoUrl: string,
): Promise<{ mapping: HumanLanguageMapping; source: MappingSource }> {
  const cacheOps = window.electronAPI?.mappingOps;
  const cacheKey = cacheKeyFor(languageId, humanLangId);

  try {
    const json = await fetchMappingJsonText(repoUrl);
    // languageId (what this source is configured under) as the fallback for a
    // mapping.json that omits its own langId — doesn't affect a well-formed file that
    // does declare one, but the caller already knows the intended language, so a file
    // shouldn't be forced to redeclare it too.
    const mapping = parseMappingFile(JSON.parse(json), languageId);
    void cacheOps?.saveCache(cacheKey, json).catch(() => { /* best-effort */ });
    return { mapping, source: 'network' };
  } catch (networkErr) {
    const cached = await cacheOps?.loadCache(cacheKey);
    if (cached?.success && cached.json) {
      try {
        const mapping = parseMappingFile(JSON.parse(cached.json), languageId);
        console.warn(`[HydraCode] "${cacheKey}": fetch de GitHub falló, usando copia en caché.`, networkErr);
        return { mapping, source: 'cache' };
      } catch (cacheErr) {
        throw new Error(`El mapping en caché para "${cacheKey}" está corrupto: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
      }
    }
    throw networkErr instanceof Error ? networkErr : new Error(String(networkErr));
  }
}
