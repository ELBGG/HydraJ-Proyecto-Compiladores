import { HumanLanguageMapping } from '../tokens/HumanLanguageMapping.js';

export const cSpanish = new HumanLanguageMapping(
  'es',
  'Spanish',
  'Español',
  'c',
  {
    version: '11',
    modifiers: {
      'const': 'const',
      'estatico': 'static',
      'externo': 'extern',
      'volatil': 'volatile',
      'registrar': 'register',
    },
    keywords: {
      'para': 'for',
      'si': 'if',
      'sino': 'else',
      'mientras': 'while',
      'hacer': 'do',
      'retornar': 'return',
      'romper': 'break',
      'continuar': 'continue',
      'cambiar': 'switch',
      'caso': 'case',
      'predeterminado': 'default',
      'ir_a': 'goto',
      'typedef': 'typedef',
      'estructura': 'struct',
      'union': 'union',
      'enum': 'enum',
      'tamano_de': 'sizeof',
      'auto': 'auto',
      'principal': 'main',
      // A plain keyword (unlike Java's 'sistema.imprimir' dotted patterns replacement)
      // since printf is already a bare, unnamespaced function — no wrapper needed for
      // "imprimir(texto)" to become valid C as-is.
      'imprimir': 'printf',
    },
    types: {
      'entero': 'int',
      'flotante': 'float',
      'caracter': 'char',
      'vacio': 'void',
      'doble': 'double',
      'largo': 'long',
      'corto': 'short',
      'sin_signo': 'unsigned',
      'con_signo': 'signed',
    },
    literals: {
      'verdadero': 'true',
      'falso': 'false',
      'nulo': 'NULL',
    },
    blockTemplate: {
      style: 'braces',
      main: 'entero principal()',
      // C has no classes — approximated as a struct (fields only).
      class: 'estructura {NAME}', classTrailingSemicolon: true,
      method: '{SIGNATURE}',
      lineComment: '//',
      ifKeyword: 'si', elseKeyword: 'sino', whileKeyword: 'mientras', forKeyword: 'para', doKeyword: 'hacer',
      supportsDoWhile: true, forStyle: 'c-style',
      switchKeyword: 'cambiar', supportsTryCatch: false,
      print: 'printf({TEXT})', printError: 'fprintf(stderr, {TEXT})',
      // Real syntax, not a Spanish word — same reasoning as print/printError
      // themselves: C has no "incluir" vocabulary registered for #include.
      preamble: {
        print: ['#include <stdio.h>'],
        printError: ['#include <stdio.h>'],
      },
      varDecl: '{TYPE} {VAR}',
      // C has no boolean or string type in its own vocabulary — approximate with the
      // closest real C idiom instead of emitting an untranslatable word.
      typeOverrides: { cadena: 'caracter*', booleano: 'entero', var: 'entero' },
      returnKeyword: 'retornar', throwTemplate: null,
      breakKeyword: 'romper', continueKeyword: 'continuar',
    },
  },
);
