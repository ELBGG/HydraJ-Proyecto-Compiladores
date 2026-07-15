import * as monaco from 'monaco-editor';
import { LanguageRegistry } from '../../../languages/index.js';
import type { IHumanLanguageMapping } from '../../../languages/tokens/types.js';
import { checkSyntax } from './syntaxDiagnostics.js';

// ── Design note ──────────────────────────────────────────────────────────────
// This is deliberately NOT a real Language Server (no clangd/jdtls/pyright). A real LSP
// server only understands actual Java/C/C++/Python — it has no notion of "mientras" or
// "publico" — so wiring one up would mean running it against the *transpiled* output and
// mapping every position, completion, and diagnostic message back through the mapping,
// which is both a much bigger project and produces suggestions in the target language
// rather than the active human language. Instead, all three providers below read directly
// from the same HumanLanguageMapping the transpiler itself uses (LanguageRegistry), so
// they automatically support whatever mapping is active for a language pair — the bundled
// Spanish ones, or any custom mapping a user registers for another human language.

const _registered = new Set<string>();

type MappingCategory = 'keywords' | 'types' | 'literals' | 'modifiers';

const CATEGORY_LABEL: Record<MappingCategory, string> = {
  keywords: 'Palabra clave',
  types: 'Tipo',
  literals: 'Literal',
  modifiers: 'Modificador',
};

const CATEGORY_KIND: Record<MappingCategory, monaco.languages.CompletionItemKind> = {
  keywords: monaco.languages.CompletionItemKind.Keyword,
  types: monaco.languages.CompletionItemKind.Class,
  literals: monaco.languages.CompletionItemKind.Constant,
  modifiers: monaco.languages.CompletionItemKind.Keyword,
};

// Same priority as TranspilerEngine's merge order (modifiers -> keywords -> types ->
// literals, later wins on a duplicate key) — kept consistent so hovering/completing a
// term that happens to exist in two categories agrees with what it actually transpiles to.
const CATEGORY_ORDER: MappingCategory[] = ['modifiers', 'keywords', 'types', 'literals'];

function findTerm(mapping: IHumanLanguageMapping, word: string): { target: string; category: MappingCategory } | null {
  let found: { target: string; category: MappingCategory } | null = null;
  for (const category of CATEGORY_ORDER) {
    const target = mapping[category][word];
    if (target) found = { target, category };
  }
  return found;
}

/** Registers completion + hover providers for one Monaco language id (e.g. "hydra-java-es"),
 *  backed by the LanguageRegistry mapping for progLang+humanLang. Safe to call repeatedly —
 *  a no-op after the first call for a given language id. */
export function registerIntelligence(monacoLangId: string, progLang: string, humanLang: string): void {
  if (_registered.has(monacoLangId)) return;
  _registered.add(monacoLangId);

  monaco.languages.registerCompletionItemProvider(monacoLangId, {
    triggerCharacters: [], // word-based default triggering covers this; no special char needed
    provideCompletionItems(model, position) {
      const mapping = LanguageRegistry.getMapping(progLang, humanLang);
      if (!mapping) return { suggestions: [] };

      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: word.startColumn, endColumn: word.endColumn,
      };

      const suggestions: monaco.languages.CompletionItem[] = [];
      for (const category of CATEGORY_ORDER) {
        for (const [term, target] of Object.entries(mapping[category])) {
          suggestions.push({
            label: term,
            kind: CATEGORY_KIND[category],
            insertText: term,
            detail: `→ ${target}`,
            documentation: `${CATEGORY_LABEL[category]} de ${mapping.nativeName} — se transpila a "${target}".`,
            range,
          });
        }
      }
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider(monacoLangId, {
    provideHover(model, position) {
      const mapping = LanguageRegistry.getMapping(progLang, humanLang);
      if (!mapping) return null;

      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const found = findTerm(mapping, word.word);
      if (!found) return null;

      return {
        range: {
          startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
          startColumn: word.startColumn, endColumn: word.endColumn,
        },
        contents: [
          { value: `**${word.word}** → \`${found.target}\`` },
          { value: `${CATEGORY_LABEL[found.category]} de ${mapping.nativeName} (${mapping.languageId}).` },
        ],
      };
    },
  });
}

/** Runs the lightweight structural syntax check (see syntaxDiagnostics.ts) against the
 *  model's current content and publishes the results as Monaco markers — squiggly
 *  underlines in the gutter/minimap, same as a real linter, without needing one. */
export function refreshDiagnostics(model: monaco.editor.ITextModel, progLang: string): void {
  if (!progLang) {
    monaco.editor.setModelMarkers(model, 'hydra-syntax', []);
    return;
  }
  const diagnostics = checkSyntax(model.getValue(), progLang);
  const markers: monaco.editor.IMarkerData[] = diagnostics.map(d => ({
    startLineNumber: d.startLineNumber, startColumn: d.startColumn,
    endLineNumber: d.endLineNumber, endColumn: d.endColumn,
    message: d.message,
    severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
  }));
  monaco.editor.setModelMarkers(model, 'hydra-syntax', markers);
}
