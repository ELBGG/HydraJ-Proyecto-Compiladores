import { LanguageTokens } from '../tokens/LanguageTokens.js';

export const pythonTokens = new LanguageTokens('python', 'Python', {
  keywords: [
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
    'try', 'while', 'with', 'yield',
  ],
  types: [
    'int', 'str', 'list', 'dict', 'set', 'tuple', 'float', 'complex',
    'bool', 'bytes', 'bytearray', 'memoryview', 'range', 'type', 'object',
    'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError',
    'AttributeError', 'NameError', 'IOError', 'OSError', 'RuntimeError',
  ],
  literals: ['True', 'False', 'None'],
  modifiers: [],
  operators: [
    '+', '-', '*', '/', '//', '%', '**',
    '==', '!=', '>', '<', '>=', '<=',
    '&', '|', '^', '~', '<<', '>>',
    '=', '+=', '-=', '*=', '/=', '//=', '%=', '**=',
    '&=', '|=', '^=', '<<=', '>>=',
    '->', ':=',
  ],
  delimiters: ['{', '}', '(', ')', '[', ']', ':', ',', '.', ';', '@'],
});
