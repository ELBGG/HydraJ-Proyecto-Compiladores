import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import type { IHumanLanguageMapping } from '../../../languages/index.js';

// Monaco web worker — must run before any editor is created
(self as any).MonacoEnvironment = {
  getWorker(_workerId: string, _label: string): Worker {
    return new EditorWorker();
  },
};

const _registered = new Set<string>();

export function getHydraLangId(progLang: string, humanLang: string): string {
  return `hydra-${progLang}-${humanLang}`;
}

export function ensureHydraLanguage(
  progLang: string,
  humanLang: string,
  mapping: IHumanLanguageMapping,
): void {
  const id = getHydraLangId(progLang, humanLang);
  if (_registered.has(id)) return;
  _registered.add(id);

  monaco.languages.register({ id });

  const keywords  = Object.keys(mapping.keywords);
  const modifiers = Object.keys(mapping.modifiers);
  const types     = Object.keys(mapping.types);
  const literals  = Object.keys(mapping.literals);

  monaco.languages.setMonarchTokensProvider(id, {
    keywords,
    modifiers,
    types,
    literals,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\d+(\.\d+)?([eE][+-]?\d+)?[fFdDlL]?/, 'number'],
        [/[{}()\[\]]/, 'delimiter.bracket'],
        [/[;,.]/, 'delimiter'],
        [/[a-zA-Z_À-ɏ][\wÀ-ɏ]*/, {
          cases: {
            '@keywords':  'keyword',
            '@modifiers': 'keyword.control',
            '@types':     'type',
            '@literals':  'constant.language',
            '@default':   'identifier',
          },
        }],
        [/\s+/, 'white'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  } as monaco.languages.IMonarchLanguage);
}
