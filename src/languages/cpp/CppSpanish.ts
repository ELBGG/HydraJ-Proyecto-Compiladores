import { HumanLanguageMapping } from '../tokens/HumanLanguageMapping.js';
import { cSpanish } from '../c/CSpanish.js';

export const cppSpanish = new HumanLanguageMapping(
  'es',
  'Spanish',
  'Español',
  'cpp',
  {
    version: '20',
    // C++ inherits C's modifiers/keywords (including goto/auto/register), so derive
    // from CSpanish instead of hand-maintaining a parallel list that can drift out of sync.
    modifiers: {
      ...cSpanish.modifiers,
      'virtual': 'virtual',
      'en_linea': 'inline',
      'explicito': 'explicit',
      'amigo': 'friend',
    },
    keywords: {
      ...cSpanish.keywords,
      'clase': 'class',
      'nuevo': 'new',
      'eliminar': 'delete',
      'publico': 'public',
      'privado': 'private',
      'protegido': 'protected',
      'espacio_nombres': 'namespace',
      'usar': 'using',
      'intentar': 'try',
      'capturar': 'catch',
      'lanzar': 'throw',
      'plantilla': 'template',
      'tipoid': 'typename',
      'operador': 'operator',
      'este': 'this',
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
      'cadena': 'string',
      'vector': 'vector',
      'booleano': 'bool',
      'mapa': 'map',
      'conjunto': 'set',
      'par': 'pair',
    },
    literals: {
      'verdadero': 'true',
      'falso': 'false',
      'nulo': 'nullptr',
    },
    blockTemplate: {
      style: 'braces',
      main: 'entero principal()',
      class: 'clase {NAME}', classTrailingSemicolon: true,
      method: '{SIGNATURE}',
      lineComment: '//',
      ifKeyword: 'si', elseKeyword: 'sino', whileKeyword: 'mientras', forKeyword: 'para', doKeyword: 'hacer',
      supportsDoWhile: true, forStyle: 'c-style',
      switchKeyword: 'cambiar', supportsTryCatch: true, tryKeyword: 'intentar', catchKeyword: 'capturar',
      // No 'escribir'-style Spanish pattern is registered for C++ — cout/endl are used
      // verbatim, the same way codeParser.ts already recognizes real `cout <<` on parse.
      print: 'cout << {TEXT} << endl', printError: 'cerr << {TEXT} << endl',
      // cout/cerr/endl are used bare above (not std::cout etc.), so both the include
      // AND the using-directive are required for either to actually compile.
      preamble: {
        print: ['#include <iostream>', 'using namespace std;'],
        printError: ['#include <iostream>', 'using namespace std;'],
      },
      varDecl: '{TYPE} {VAR}',
      returnKeyword: 'retornar', throwTemplate: 'lanzar {EXC}',
      breakKeyword: 'romper', continueKeyword: 'continuar',
    },
  },
);
