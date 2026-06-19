import * as monaco from 'monaco-editor';
import { INITIAL } from 'vscode-textmate';
import type { StateStack } from 'vscode-textmate';
import { getRegistry, getEsRegistry } from './grammarRegistry.js';

class TextMateState implements monaco.languages.IState {
  constructor(readonly ruleStack: StateStack) {}
  clone(): monaco.languages.IState { return new TextMateState(this.ruleStack); }
  equals(other: monaco.languages.IState): boolean {
    return other instanceof TextMateState && other.ruleStack.equals(this.ruleStack);
  }
}

const _registered = new Set<string>();

export async function ensureTextMateLanguage(
  monacoLangId: string,
  scopeName: string,
  useSpanishInjection: boolean,
): Promise<void> {
  if (_registered.has(monacoLangId)) return;
  _registered.add(monacoLangId);

  const registry = useSpanishInjection ? getEsRegistry() : getRegistry();
  const grammar = await registry.loadGrammar(scopeName);
  if (!grammar) {
    _registered.delete(monacoLangId);
    return;
  }

  if (!monaco.languages.getLanguages().some(l => l.id === monacoLangId)) {
    monaco.languages.register({ id: monacoLangId });
  }

  monaco.languages.setTokensProvider(monacoLangId, {
    getInitialState(): monaco.languages.IState {
      return new TextMateState(INITIAL);
    },
    tokenize(line: string, state: monaco.languages.IState): monaco.languages.ILineTokens {
      const r = grammar.tokenizeLine(line, (state as TextMateState).ruleStack);
      return {
        tokens: r.tokens.map(t => ({
          startIndex: t.startIndex,
          scopes: t.scopes[t.scopes.length - 1] ?? '',
        })),
        endState: new TextMateState(r.ruleStack),
      };
    },
  });
}
