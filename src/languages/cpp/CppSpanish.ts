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
  },
);
