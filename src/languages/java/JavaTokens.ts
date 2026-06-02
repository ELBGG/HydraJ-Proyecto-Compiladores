import { LanguageTokens } from '../tokens/LanguageTokens.js';

export const javaTokens = new LanguageTokens('java', 'Java', {
  keywords: [
    'abstract', 'assert', 'break', 'case', 'catch', 'class', 'continue',
    'default', 'do', 'else', 'enum', 'extends', 'final', 'finally',
    'for', 'if', 'implements', 'import', 'instanceof', 'interface',
    'native', 'new', 'package', 'private', 'protected', 'public',
    'return', 'static', 'strictfp', 'super', 'switch', 'synchronized',
    'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile',
    'while', 'var', 'yield', 'record', 'sealed', 'permits', 'non-sealed',
  ],
  types: [
    'boolean', 'byte', 'char', 'double', 'float', 'int', 'long',
    'short', 'String', 'Integer', 'Boolean', 'Double', 'Float',
    'Long', 'Short', 'Byte', 'Character', 'Object', 'Void',
    'List', 'Map', 'Set', 'ArrayList', 'HashMap', 'HashSet',
    'Optional', 'Stream', 'Consumer', 'Supplier', 'Function',
    'Predicate', 'BiFunction', 'Collection', 'Iterable',
    'Comparator', 'Runnable', 'Callable', 'Path', 'File',
    'Exception', 'RuntimeException', 'Error', 'Throwable',
    'System', 'Math', 'Arrays', 'Collections', 'StringBuilder',
    'StringBuffer', 'Date', 'Calendar', 'BigInteger', 'BigDecimal',
  ],
  literals: [
    'true', 'false', 'null', 'this', 'super',
  ],
  modifiers: [
    'public', 'private', 'protected', 'static', 'final',
    'abstract', 'synchronized', 'native', 'transient', 'volatile',
    'strictfp', 'sealed', 'non-sealed',
  ],
  operators: [
    '+', '-', '*', '/', '%', '++', '--',
    '==', '!=', '>', '<', '>=', '<=',
    '&&', '||', '!', '&', '|', '^', '~',
    '<<', '>>', '>>>',
    '=', '+=', '-=', '*=', '/=', '%=',
    '&=', '|=', '^=', '<<=', '>>=', '>>>=',
    '->', '::',
  ],
  delimiters: [
    '{', '}', '(', ')', '[', ']',
    ';', ',', '.', '@', '...',
  ],
});
