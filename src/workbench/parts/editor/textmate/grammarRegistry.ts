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

// Base scopes that support Spanish injection.
const SPANISH_BASE_SCOPES = new Set([
  'source.java', 'source.c', 'source.cpp', 'source.python',
]);

async function loadGrammarCb(scopeName: string): Promise<IRawGrammar | null> {
  await waitReady();

  // Spanish injection grammars are built in-memory, not loaded from files.
  if (scopeName.endsWith('.es-injection')) {
    const baseScopeName = scopeName.replace(/\.es-injection$/, '');
    const progLang = baseScopeName.split('.')[1]; // 'c', 'cpp', 'java', 'python'
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

// Spanish registry — injects Spanish keyword patterns for the 4 core languages.
const _registryEs = new Registry({
  onigLib: _onigLib,
  loadGrammar: loadGrammarCb,
  getInjections(scopeName: string): string[] | undefined {
    if (SPANISH_BASE_SCOPES.has(scopeName)) {
      return [`${scopeName}.es-injection`];
    }
    return undefined;
  },
});

export function getRegistry(): Registry { return _registry; }
export function getEsRegistry(): Registry { return _registryEs; }
