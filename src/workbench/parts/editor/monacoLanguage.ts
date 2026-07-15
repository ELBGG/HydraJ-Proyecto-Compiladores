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

/** Monaco language ID for the given prog+human language pair.
 *  Synchronous — safe to call before ensureLanguage resolves. */
export function getHydraLangId(progLang: string, humanLang: string): string {
  return `hydra-${progLang}-${humanLang}`;
}

/** Whether progLang+humanLang should use the Spanish-injected Monaco language id.
 *  Requires BOTH a registered HumanLanguageMapping AND a real bundled/installed
 *  TextMate grammar for progLang to inject Spanish patterns into — a mapping alone
 *  isn't enough, since injection has nothing to attach to without a base grammar.
 *  Driven entirely by LanguageRegistry + the extension loader, not a fixed language
 *  list, so this automatically activates for any newly-added mapping (Go included)
 *  the moment a matching grammar is bundled — no code change needed at that point.
 *  Shared by getMonacoLangId and ensureLanguage so both always agree on the same id;
 *  disagreeing would mean the model's language id and the id a tokenizer eventually
 *  gets registered for are different, silently leaving the model unhighlighted. */
function shouldUseSpanishInjection(progLang: string, humanLang: string): boolean {
  return !!getScopeForLang(progLang) && !!LanguageRegistry.getMapping(progLang, humanLang);
}

/** Final Monaco language ID: hydra-<prog>-<human> if Spanish injection applies, else
 *  plain progLang (still gets Monaco's own built-in colorizer when one exists). */
export function getMonacoLangId(progLang: string, humanLang: string): string {
  if (!progLang) return 'plaintext';
  return shouldUseSpanishInjection(progLang, humanLang) ? getHydraLangId(progLang, humanLang) : progLang;
}

/** Registers a TextMate token provider for the given language pair.
 *  Safe to call multiple times — no-op on subsequent calls for the same pair. */
export async function ensureLanguage(progLang: string, humanLang: string): Promise<void> {
  if (!progLang) return;
  await waitReady();
  const scopeName = getScopeForLang(progLang);
  if (!scopeName) return; // no extension loaded for this language (yet)
  const useSpanish = shouldUseSpanishInjection(progLang, humanLang);
  const monacoLangId = useSpanish ? getHydraLangId(progLang, humanLang) : progLang;
  await ensureTextMateLanguage(monacoLangId, scopeName, useSpanish);
}
