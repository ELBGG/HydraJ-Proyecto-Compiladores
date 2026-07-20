import { HumanLanguageMapping } from './HumanLanguageMapping.js';
import type { IBlockCodeTemplate, IMultiWordPattern } from './types.js';

/** JSON-safe stand-in for IMultiWordPattern — `from`/`to` match the field names the
 *  app's original "import a mapping from a local JSON file" feature used (since
 *  superseded by the dedicated Mappings module's file-import + GitHub-install flows,
 *  which both go through this same schema/parser); `flags` is new but optional and
 *  defaults to 'g' (every mapping's patterns were global replacements), so a file
 *  written before `flags` existed still parses unchanged. Plain strings either way —
 *  never a real RegExp object, so a mapping fetched from an external URL is pure data,
 *  never anything this app has to eval() or otherwise execute as code. */
export interface IHydraMappingFilePattern {
  readonly from: string;
  readonly to: string;
  readonly flags?: string;
}

/**
 * The on-disk/on-the-wire shape of a HydraCode language mapping — what a `mapping.json`
 * at the root of a GitHub mapping repo (e.g. HydraCode-Team/Python-mappings-hydracode)
 * is fetched and parsed as (see githubMappingService.ts), and also what the Mappings
 * module's local-file-import accepts. One shared schema/parser for every way a mapping
 * can enter the app, instead of a second slightly-different format for each source.
 *
 * Every field but `langId` is optional with sensible defaults, so a minimal file only
 * needs `langId` plus whichever of keywords/types/literals/modifiers it actually has
 * vocabulary for.
 */
export interface IHydraMappingFile {
  /** Only checked if present, so pre-existing mapping files with no opinion on this at
   *  all keep working; a NEW file can set it to guard against a future incompatible
   *  schema change being silently misread. */
  readonly schemaVersion?: 1;
  readonly langId: string;
  readonly id?: string;
  readonly name?: string;
  readonly nativeName?: string;
  readonly version?: string;
  readonly keywords?: Record<string, string>;
  readonly types?: Record<string, string>;
  readonly literals?: Record<string, string>;
  readonly modifiers?: Record<string, string>;
  readonly patterns?: IHydraMappingFilePattern[];
  readonly blockTemplate?: IBlockCodeTemplate;
}

export class MappingFileError extends Error {}

/** Rejects an array/null (keywords must be a plain object of string values), and — same
 *  reasoning as extensionsPanel.ts's pre-existing _isValidMappingField — rejects
 *  prototype-polluting keys explicitly rather than trusting `typeof value === 'object'`
 *  alone, since Object.values()/Object.entries() happily walk right past a poisoned
 *  __proto__/constructor/prototype entry. */
function isValidMappingField(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
    if (typeof val !== 'string') return false;
  }
  return true;
}

/** A pattern fetched from an external mapping repo gets compiled into a real RegExp and
 *  later run synchronously, on the render thread, against arbitrary user-typed source on
 *  every keystroke (TranspilerEngine._translateSpan(), debounced 300ms per edit — no
 *  Worker, no timeout, nothing that can interrupt a hung regex once it starts). A
 *  catastrophic-backtracking pattern is therefore a renderer-freezing ReDoS with a
 *  two-line trigger, not just a "this mapping fails to parse" problem — found by this
 *  session's own adversarial review, reproduced live: new RegExp('(a+)+$','g') against a
 *  35-char string ran past two minutes without returning. */
const MAX_PATTERN_SOURCE_LENGTH = 300;
const MAX_PATTERNS_PER_MAPPING = 200;

/** Heuristic, not a formal proof — ReDoS detection in general is an open problem. This
 *  catches the textbook shape behind it (a quantified group whose own body already
 *  contains a quantifier, e.g. "(a+)+", "(\d*)+", "(.+)*"), which is both the most common
 *  real-world cause and the exact case the review reproduced. Verified against every
 *  pattern already shipped in JavaSpanish.ts (see mappingFile.test.ts) to confirm zero
 *  false positives on legitimate patterns like "\bmatematicas\.abs\.\(([^)]+)\)". */
function looksCatastrophic(source: string): boolean {
  return /\([^()]*[+*][^()]*\)[+*]/.test(source);
}

/** Turns validated pattern data into real RegExp instances — the ONLY place a mapping
 *  fetched from an external source produces something beyond plain data, and even then
 *  only ever via the RegExp constructor on already-typechecked strings, never eval()/
 *  Function()/dynamic import. A single bad entry (invalid syntax, too long, or matching
 *  the catastrophic-backtracking heuristic) is skipped with a warning rather than failing
 *  the whole mapping — one bad pattern in someone's community repo shouldn't take down
 *  every construct that repo's mapping otherwise gets right. MAX_PATTERNS_PER_MAPPING
 *  additionally bounds how many patterns (and therefore RegExp objects held in memory,
 *  each re-run on every future transpile) a single mapping can register at all. */
function buildPatterns(raw: unknown, langId: string): IMultiWordPattern[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new MappingFileError('"patterns" debe ser un array.');
  const out: IMultiWordPattern[] = [];
  for (const [i, entry] of raw.entries()) {
    if (out.length >= MAX_PATTERNS_PER_MAPPING) {
      console.warn(`[HydraCode] Mapping "${langId}": se alcanzó el límite de ${MAX_PATTERNS_PER_MAPPING} patterns; se ignora el resto.`);
      break;
    }
    if (typeof entry !== 'object' || entry === null) {
      throw new MappingFileError(`"patterns[${i}]" debe ser un objeto.`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.from !== 'string' || !e.from) {
      throw new MappingFileError(`"patterns[${i}].from" debe ser un string no vacío.`);
    }
    if (e.from.length > MAX_PATTERN_SOURCE_LENGTH) {
      console.warn(`[HydraCode] Mapping "${langId}": omitiendo patterns[${i}] (regex demasiado larga: ${e.from.length} caracteres, límite ${MAX_PATTERN_SOURCE_LENGTH}).`);
      continue;
    }
    if (looksCatastrophic(e.from)) {
      console.warn(`[HydraCode] Mapping "${langId}": omitiendo patterns[${i}] (posible backtracking catastrófico: "${e.from}").`);
      continue;
    }
    const to = typeof e.to === 'string' ? e.to : '';
    const flags = typeof e.flags === 'string' ? e.flags : 'g';
    try {
      out.push({ from: new RegExp(e.from, flags), to });
    } catch (err) {
      console.warn(`[HydraCode] Mapping "${langId}": omitiendo patterns[${i}] (regex inválida "${e.from}"):`, err);
    }
  }
  return out;
}

/**
 * Validates and constructs a real HumanLanguageMapping from parsed JSON — the shared
 * entry point for every way a mapping enters the app (example install, manual file
 * import, GitHub fetch). Throws MappingFileError with a Spanish, actionable message on
 * any structural problem; never executes anything from `data` beyond passing
 * already-typechecked strings into `new RegExp(...)` above.
 *
 * `fallbackLangId` lets a caller supply a langId from its own context (e.g. the
 * marketplace search result a JSON example is attached to) when the file itself omits
 * one — matches extensionsPanel.ts's pre-existing behavior for its example-install flow.
 */
export function parseMappingFile(data: unknown, fallbackLangId?: string): HumanLanguageMapping {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new MappingFileError('El archivo de mapping no es un objeto JSON válido.');
  }
  const obj = data as Record<string, unknown>;

  if (obj.schemaVersion !== undefined && obj.schemaVersion !== 1) {
    throw new MappingFileError(`schemaVersion no soportado (se esperaba 1, se recibió ${JSON.stringify(obj.schemaVersion)}).`);
  }

  const langId = (typeof obj.langId === 'string' && obj.langId) ? obj.langId : fallbackLangId;
  if (!langId) {
    throw new MappingFileError('El JSON debe tener un campo "langId".');
  }

  if (obj.keywords === undefined && obj.types === undefined) {
    throw new MappingFileError('El JSON debe tener al menos un campo "keywords" o "types".');
  }
  for (const key of ['keywords', 'types', 'literals', 'modifiers'] as const) {
    if (obj[key] !== undefined && !isValidMappingField(obj[key])) {
      throw new MappingFileError(`"${key}" debe ser un objeto plano { "clave": "valor" } con valores de texto (no listas).`);
    }
  }
  const keywords = (obj.keywords as Record<string, string> | undefined) ?? {};
  const types = (obj.types as Record<string, string> | undefined) ?? {};
  const literals = (obj.literals as Record<string, string> | undefined) ?? {};
  const modifiers = (obj.modifiers as Record<string, string> | undefined) ?? {};
  const patterns = buildPatterns(obj.patterns, langId);

  // blockTemplate is already a plain-data shape (no functions/RegExp anywhere in
  // IBlockCodeTemplate) — passed through as-is after a light presence check rather than
  // re-validating every one of its ~25 fields, which TypeScript can't enforce at
  // runtime here any more strictly than "is this an object" can. A mapping that omits
  // it simply won't offer Blocks mode.
  if (obj.blockTemplate !== undefined && (typeof obj.blockTemplate !== 'object' || obj.blockTemplate === null)) {
    throw new MappingFileError('"blockTemplate" debe ser un objeto.');
  }
  const blockTemplate = obj.blockTemplate as IBlockCodeTemplate | undefined;

  const version = typeof obj.version === 'string' ? obj.version : undefined;
  const id = typeof obj.id === 'string' && obj.id ? obj.id : 'es';
  const name = typeof obj.name === 'string' && obj.name ? obj.name : 'Spanish';
  const nativeName = typeof obj.nativeName === 'string' && obj.nativeName ? obj.nativeName : 'Español';

  return new HumanLanguageMapping(id, name, nativeName, langId, {
    version, keywords, types, literals, modifiers, patterns, blockTemplate,
  });
}

/** The inverse of parseMappingFile() — used to generate the mapping.json pushed to each
 *  GitHub repo (and the seed cache shipped with the app) from a real, in-memory
 *  HumanLanguageMapping. Not used at runtime by the app itself. */
export function mappingToFile(mapping: HumanLanguageMapping): IHydraMappingFile {
  return {
    schemaVersion: 1,
    langId: mapping.languageId,
    id: mapping.id,
    name: mapping.name,
    nativeName: mapping.nativeName,
    version: mapping.version,
    keywords: mapping.keywords,
    types: mapping.types,
    literals: mapping.literals,
    modifiers: mapping.modifiers,
    patterns: mapping.patterns.map(p => ({ from: p.from.source, flags: p.from.flags, to: p.to })),
    blockTemplate: mapping.blockTemplate,
  };
}
