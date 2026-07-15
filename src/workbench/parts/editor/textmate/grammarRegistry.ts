import { Registry, parseRawGrammar } from 'vscode-textmate';
import type { IRawGrammar } from 'vscode-textmate';
import { getOnigLib } from './oniguruma.js';
import { buildSpanishInjectionGrammar } from './spanishInjection.js';
import { getGrammarPath, waitReady } from '../../sidebar/extensionLoader.js';
import { LanguageRegistry } from '../../../../languages/index.js';

// All bundled grammar JSON files, loaded as raw strings by Vite at build time.
const _grammarFiles = import.meta.glob('/extensions/**/syntaxes/*.json', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

// TextMate base scope names follow the "source.<progLang>" convention (source.java,
// source.cpp, source.go, ...) — extracting progLang back out of one lets injection
// support be driven entirely by which languages have a registered mapping, instead of
// a fixed list that silently excludes anything added later (Go included).
function progLangFromScope(baseScopeName: string): string {
  return baseScopeName.split('.')[1] ?? '';
}

/** Whether `scopeName` should have the Spanish injection grammar layered onto it.
 *  Exported standalone (rather than left inline in getInjections below) so the
 *  recursion guard has a direct regression test — see grammarRegistry.test.ts. */
export function shouldInjectSpanish(scopeName: string): boolean {
  // MUST bail out for a scope that is itself already an injection grammar — otherwise
  // progLangFromScope('source.cpp.es-injection') still extracts 'cpp' (split('.')[1] is
  // unaffected by the extra suffix), so this would keep injecting into its own output
  // forever: source.cpp.es-injection -> source.cpp.es-injection.es-injection -> ...
  // vscode-textmate resolves each of those as a real grammar (rebuilding the full
  // pattern list every time), so left unguarded this is an unbounded allocation loop
  // that exhausts memory rather than failing fast (observed as the whole renderer
  // process going OOM the moment a file was opened).
  if (scopeName.endsWith('.es-injection')) return false;
  const progLang = progLangFromScope(scopeName);
  return !!progLang && !!LanguageRegistry.getMapping(progLang, 'es');
}

async function loadGrammarCb(scopeName: string): Promise<IRawGrammar | null> {
  await waitReady();

  // Spanish injection grammars are built in-memory, not loaded from files.
  if (scopeName.endsWith('.es-injection')) {
    const baseScopeName = scopeName.replace(/\.es-injection$/, '');
    const progLang = progLangFromScope(baseScopeName);
    const mapping = LanguageRegistry.getMapping(progLang, 'es');
    if (!mapping) return null;
    return buildSpanishInjectionGrammar(mapping, baseScopeName);
  }

  // Regular bundled grammars: look up file path from extensionLoader.
  const filePath = getGrammarPath(scopeName);
  if (!filePath || !_grammarFiles[filePath]) return null;

  const raw = await _grammarFiles[filePath]();
  return parseRawGrammar(raw, filePath);
}

const _onigLib = getOnigLib();

// Plain registry — no Spanish injection. Used for output pane + explorer files.
const _registry = new Registry({
  onigLib: _onigLib,
  loadGrammar: loadGrammarCb,
});

// Spanish registry — injects Spanish keyword patterns for any language with a
// registered Spanish HumanLanguageMapping (LanguageRegistry-driven, not a fixed list).
const _registryEs = new Registry({
  onigLib: _onigLib,
  loadGrammar: loadGrammarCb,
  getInjections(scopeName: string): string[] | undefined {
    return shouldInjectSpanish(scopeName) ? [`${scopeName}.es-injection`] : undefined;
  },
});

export function getRegistry(): Registry { return _registry; }
export function getEsRegistry(): Registry { return _registryEs; }
