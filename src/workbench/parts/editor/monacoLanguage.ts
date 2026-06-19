import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { LanguageRegistry } from '../../../languages/index.js';
import { ensureTextMateLanguage } from './textmate/monacoTextmateBridge.js';
import { waitReady, getScopeForLang } from '../sidebar/extensionLoader.js';
import { applyTheme } from './textmate/theme.js';

// Monaco web worker — must run before any editor is created.
(self as any).MonacoEnvironment = {
  getWorker(_workerId: string, _label: string): Worker {
    return new EditorWorker();
  },
};

// Register Dark+ theme immediately (synchronous — no WASM needed).
applyTheme();

// These 4 languages have existing HumanLanguageMappings and support Spanish injection.
const SPANISH_LANGS = new Set(['java', 'c', 'cpp', 'python']);

/** Monaco language ID for the given prog+human language pair.
 *  Synchronous — safe to call before ensureLanguage resolves. */
export function getHydraLangId(progLang: string, humanLang: string): string {
  return `hydra-${progLang}-${humanLang}`;
}

/** Final Monaco language ID: hydra-<prog>-<human> if there's an ES mapping, else progLang. */
export function getMonacoLangId(progLang: string, humanLang: string): string {
  if (!progLang) return 'plaintext';
  const hasMapping = SPANISH_LANGS.has(progLang) && !!LanguageRegistry.getMapping(progLang, humanLang);
  return hasMapping ? getHydraLangId(progLang, humanLang) : progLang;
}

/** Registers a TextMate token provider for the given language pair.
 *  Safe to call multiple times — no-op on subsequent calls for the same pair. */
export async function ensureLanguage(progLang: string, humanLang: string): Promise<void> {
  if (!progLang) return;
  await waitReady();
  const scopeName = getScopeForLang(progLang);
  if (!scopeName) return; // no extension loaded for this language (yet)
  const useSpanish = SPANISH_LANGS.has(progLang) && !!LanguageRegistry.getMapping(progLang, humanLang);
  const monacoLangId = useSpanish ? getHydraLangId(progLang, humanLang) : progLang;
  await ensureTextMateLanguage(monacoLangId, scopeName, useSpanish);
}
