import { HumanLanguageMapping } from '../tokens/HumanLanguageMapping.js';

export const pythonSpanish = new HumanLanguageMapping(
  'es',
  'Spanish',
  'Español',
  'python',
  {
    keywords: {
      'para': 'for',
      'si': 'if',
      'sino': 'else',
      'sino_si': 'elif',
      'mientras': 'while',
      'retornar': 'return',
      'importar': 'import',
      'desde': 'from',
      'clase': 'class',
      'funcion': 'def',
      'en': 'in',
      'es': 'is',
      'y': 'and',
      'o': 'or',
      'no': 'not',
      'intentar': 'try',
      'excepto': 'except',
      'finalmente': 'finally',
      'con': 'with',
      'como': 'as',
      'pasar': 'pass',
      'continuar': 'continue',
      'romper': 'break',
      'del': 'del',
      'lambda': 'lambda',
      'rendimiento': 'yield',
      'global': 'global',
      'no_local': 'nonlocal',
      'elevar': 'raise',
      'afirmar': 'assert',
      'asincrono': 'async',
      'esperar': 'await',
    },
    types: {
      'entero': 'int',
      'texto': 'str',
      'lista': 'list',
      'diccionario': 'dict',
      'conjunto': 'set',
      'tupla': 'tuple',
      'flotante': 'float',
      'booleano': 'bool',
      'bytes': 'bytes',
      'rango': 'range',
      'tipo': 'type',
      'objeto': 'object',
      'excepcion': 'Exception',
    },
    literals: {
      'verdadero': 'True',
      'falso': 'False',
      'nulo': 'None',
    },
    blockTemplate: {
      style: 'indent',
      // Python has no main()-style entry point — `if __name__ == "__main__":` is the
      // real, idiomatic equivalent, and it naturally wants an indented body the same
      // way every other block does.
      main: 'si __name__ == "__main__"',
      class: 'clase {NAME}',
      method: 'funcion {SIGNATURE}',
      // Strip Java-only visibility/return-type modifiers a shared free-text SIGNATURE
      // field might carry over (e.g. the default placeholder "publico vacio nombre()").
      stripFromSignature: ['^(publico|privado|protegido|estatico)\\s+', '^vacio\\s+'],
      lineComment: '#',
      ifKeyword: 'si', elseKeyword: 'sino', whileKeyword: 'mientras', forKeyword: 'para',
      supportsDoWhile: false, forStyle: 'range',
      // No native switch before 3.10's `match` (unmapped) — commented passthrough.
      switchKeyword: null,
      supportsTryCatch: true, tryKeyword: 'intentar', catchKeyword: 'excepto',
      // No 'imprimir' Spanish mapping is registered for Python — real print(...) is
      // used directly, the same way C++'s cout is.
      print: 'print({TEXT})', printError: 'print({TEXT}, file=sys.stderr)',
      // Only printError needs anything extra — plain print() is a builtin, but
      // sys.stderr needs its module imported. "importar" (not raw "import") since
      // Python already has a real Spanish word for this in `keywords` above.
      preamble: {
        printError: ['importar sys'],
      },
      // No static variable declarations — the VAR field ("nombre = 0") is already a
      // complete, correct Python statement on its own.
      varDecl: null,
      returnKeyword: 'retornar', throwTemplate: 'elevar {EXC}',
      breakKeyword: 'romper', continueKeyword: 'continuar',
    },
  },
);
