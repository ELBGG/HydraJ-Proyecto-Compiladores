import { Emitter } from '../../../base/common/event.js';
import { LanguageRegistry } from '../../../languages/index.js';
import { loadMapping } from './githubMappingService.js';

/** A mapping source is identified by BOTH `languageId` (the real target language, e.g.
 *  "cpp") AND `humanLangId` (which human-language vocabulary it provides for that
 *  language, e.g. "es"/"it") — never `languageId` alone. A target language can have more
 *  than one human-language mapping installed at once (that's the whole point of the
 *  human-language picker in statusbarPart.ts), so keying on `languageId` only would let
 *  installing a SECOND human language for an already-covered target language silently
 *  overwrite/evict the first one's source instead of coexisting with it — exactly what
 *  happened installing an Italian C++ mapping alongside the default Spanish one. */
export interface MappingSource {
  languageId: string;
  humanLangId: string;
  repoUrl: string;
}

function sameSource(a: { languageId: string; humanLangId: string }, b: { languageId: string; humanLangId: string }): boolean {
  return a.languageId === b.languageId && a.humanLangId === b.humanLangId;
}

/** The mapping sources HydraCode registers on startup absent any user changes — one
 *  GitHub repo per language, each holding that language's Spanish mapping.json (see
 *  mappingFile.ts's schema). A source that can't be reached just falls back to its
 *  seeded local cache (see githubMappingService.ts) rather than leaving that language
 *  with zero vocabulary. */
const DEFAULT_SOURCES: MappingSource[] = [
  { languageId: 'java', humanLangId: 'es', repoUrl: 'https://github.com/HydraCode-Team/Java-mappings-hydracode' },
  { languageId: 'c', humanLangId: 'es', repoUrl: 'https://github.com/HydraCode-Team/C-mappings-hydracode' },
  { languageId: 'cpp', humanLangId: 'es', repoUrl: 'https://github.com/HydraCode-Team/Cpp-mappings-hydracode' },
  { languageId: 'python', humanLangId: 'es', repoUrl: 'https://github.com/HydraCode-Team/Python-mappings-hydracode' },
];

/**
 * Persists the list of {languageId, humanLangId, repoUrl} mapping sources the app
 * fetches from on startup — mirrors settingsStore.ts's singleton/load-memoization
 * pattern. Adding or overriding a source here is what the Mappings panel's "Cargar
 * mapping desde GitHub" actually does; loadAndRegisterAllMappings() is what turns that
 * list into real registered mappings.
 */
class MappingSourceStore {
  private _sources: MappingSource[] = [...DEFAULT_SOURCES];
  private _loadPromise: Promise<void> | null = null;
  private readonly _onChange = new Emitter<void>();
  readonly onChange = this._onChange.event;

  // Per-source load results (network/cache/error) — purely in-memory, not persisted;
  // exists so a UI (the Mappings panel) can show which language actually loaded from
  // where without re-running a fetch itself. Set by loadAndRegisterAllMappings() at
  // startup and by installing a single new mapping through the panel.
  private _lastOutcomes: MappingLoadOutcome[] = [];
  private readonly _onOutcomesChange = new Emitter<void>();
  readonly onOutcomesChange = this._onOutcomesChange.event;

  getLastOutcomes(): MappingLoadOutcome[] {
    return [...this._lastOutcomes];
  }

  setOutcome(outcome: MappingLoadOutcome): void {
    const idx = this._lastOutcomes.findIndex(o => sameSource(o, outcome));
    if (idx >= 0) this._lastOutcomes[idx] = outcome;
    else this._lastOutcomes.push(outcome);
    this._onOutcomesChange.fire();
  }

  /** Same memoized-promise shape as settingsStore.load() — every call after the first
   *  returns the same in-flight/settled promise instead of re-fetching. */
  load(): Promise<void> {
    if (!this._loadPromise) this._loadPromise = this._doLoad();
    return this._loadPromise;
  }

  private async _doLoad(): Promise<void> {
    const api = window.electronAPI;
    if (!api?.mappingSourceOps) return;
    try {
      const result = await api.mappingSourceOps.load();
      if (result.success && Array.isArray(result.sources) && result.sources.length > 0) {
        // Merge with defaults rather than fully replacing them — a persisted list must
        // never be able to silently drop a default source (e.g. Spanish for C++) just
        // because a DIFFERENT human-language mapping for the same target language was
        // added later. Also heals a persisted entry saved before humanLangId existed
        // (treated as "es", the only human language every source used before this fix).
        const merged = [...DEFAULT_SOURCES];
        for (const raw of result.sources as Array<Partial<MappingSource>>) {
          if (typeof raw.languageId !== 'string' || typeof raw.repoUrl !== 'string') continue;
          const persisted: MappingSource = {
            languageId: raw.languageId,
            humanLangId: typeof raw.humanLangId === 'string' ? raw.humanLangId : 'es',
            repoUrl: raw.repoUrl,
          };
          const idx = merged.findIndex(s => sameSource(s, persisted));
          if (idx >= 0) merged[idx] = persisted;
          else merged.push(persisted);
        }
        this._sources = merged;
        this._onChange.fire();
      }
    } catch { /* keep defaults */ }
  }

  getAll(): MappingSource[] {
    return [...this._sources];
  }

  /** Adds a new source or replaces the existing one for the same (languageId,
   *  humanLangId) pair — same await-load-first ordering as settingsStore.set(), so a
   *  write landing before a still-pending load() has merged the persisted list in can't
   *  silently drop sources the user already added in an earlier session. */
  async addOrUpdate(source: MappingSource): Promise<void> {
    await this.load();
    const idx = this._sources.findIndex(s => sameSource(s, source));
    if (idx >= 0) this._sources[idx] = source;
    else this._sources.push(source);
    await this._persist();
  }

  async remove(languageId: string, humanLangId: string): Promise<void> {
    await this.load();
    this._sources = this._sources.filter(s => !(s.languageId === languageId && s.humanLangId === humanLangId));
    await this._persist();
  }

  private async _persist(): Promise<void> {
    const api = window.electronAPI;
    if (api?.mappingSourceOps) {
      try { await api.mappingSourceOps.save(this._sources); } catch { /* best-effort */ }
    }
    this._onChange.fire();
  }
}

export const mappingSourceStore = new MappingSourceStore();

export interface MappingLoadOutcome {
  languageId: string;
  humanLangId: string;
  repoUrl: string;
  ok: boolean;
  source?: 'network' | 'cache';
  error?: string;
}

/** Fetches and registers every configured source, independently — one repo being
 *  unreachable (not created yet, renamed, offline) must never block the others from
 *  loading. Returns a per-source outcome so the UI can show exactly what did/didn't
 *  load rather than a single opaque success/failure. */
export async function loadAndRegisterAllMappings(): Promise<MappingLoadOutcome[]> {
  await mappingSourceStore.load();
  const sources = mappingSourceStore.getAll();
  const results = await Promise.allSettled(
    sources.map(async (source): Promise<MappingLoadOutcome> => {
      const { mapping, source: from } = await loadMapping(source.languageId, source.humanLangId, source.repoUrl);
      // The fetched mapping.json's own langId/id is what LanguageRegistry.register()
      // keys on — never blindly trust it matches the source this app configured that
      // repo under. Without this check, a compromised/typosquatted/misconfigured repo
      // declaring the wrong langId OR id would silently overwrite a completely
      // different mapping's registry entry (found by this session's adversarial
      // review, then hit again live with a mismatched humanLangId — see mapping
      // source's own doc comment above).
      if (mapping.languageId !== source.languageId || mapping.id !== source.humanLangId) {
        throw new Error(`El mapping obtenido de ${source.repoUrl} declara languageId "${mapping.languageId}" / id "${mapping.id}", pero esta fuente está configurada para "${source.languageId}" / "${source.humanLangId}".`);
      }
      LanguageRegistry.register(mapping);
      return { languageId: source.languageId, humanLangId: source.humanLangId, repoUrl: source.repoUrl, ok: true, source: from };
    }),
  );
  const outcomes = results.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : { languageId: sources[i].languageId, humanLangId: sources[i].humanLangId, repoUrl: sources[i].repoUrl, ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  for (const o of outcomes) mappingSourceStore.setOutcome(o);
  return outcomes;
}
