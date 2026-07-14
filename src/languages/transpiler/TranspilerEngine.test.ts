import { describe, it, expect, beforeEach } from 'vitest';
import { TranspilerEngine } from './TranspilerEngine.js';
import { LanguageRegistry } from '../api/LanguageRegistry.js';
import { javaSpanish } from '../java/index.js';
import { cSpanish } from '../c/index.js';
import { cppSpanish } from '../cpp/index.js';
import { pythonSpanish } from '../python/index.js';

describe('TranspilerEngine', () => {
  let engine: TranspilerEngine;

  beforeEach(() => {
    LanguageRegistry.clear();
    engine = new TranspilerEngine();
  });

  describe('Java → Español', () => {
    beforeEach(() => {
      LanguageRegistry.register(javaSpanish);
    });

    it('translates class declaration', () => {
      const result = engine.transpile({
        code: 'clase Hola {}',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('class Hola {}');
    });

    it('translates modifiers and void type', () => {
      const result = engine.transpile({
        code: 'publico estatico vacio metodo() {}',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('public static void metodo() {}');
    });

    it('translates principal to the required main entry point name', () => {
      // HydraCode's own welcome-screen example names its entry point "principal";
      // without this mapping the transpiled Java has no main() and can't run.
      const result = engine.transpile({
        code: 'publico estatico vacio principal(cadena[] args) {}',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('public static void main(String[] args) {}');
    });

    it('translates if-else', () => {
      const result = engine.transpile({
        code: 'si (verdadero) { sistema.imprimir("hola"); }',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('if (true) { System.out.println("hola"); }');
    });

    it('translates sistema.imprimir pattern', () => {
      const result = engine.transpile({
        code: 'sistema.imprimir("Hola Mundo");',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('System.out.println("Hola Mundo");');
    });

    it('translates types (entero → int)', () => {
      const result = engine.transpile({
        code: 'entero x = 5;',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('int x = 5;');
    });

    it('translates literals (verdadero/falso/nulo)', () => {
      const result = engine.transpile({
        code: 'booleano a = verdadero; booleano b = falso; objeto o = nulo;',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('boolean a = true; boolean b = false; Object o = null;');
    });

    it('translates modifiers', () => {
      const result = engine.transpile({
        code: 'privado estatico final entero MAX = 100;',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('private static final int MAX = 100;');
    });

    it('handles matematicas patterns', () => {
      const result = engine.transpile({
        code: 'matematicas.aleatorio();',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('Math.random();');
    });

    it('handles matematicas.potencia/raiz/maximo/minimo/piso/techo patterns', () => {
      const result = engine.transpile({
        code: [
          'matematicas.potencia.(2, 3);',
          'matematicas.raiz.(16);',
          'matematicas.maximo.(1, 2);',
          'matematicas.minimo.(1, 2);',
          'matematicas.piso.(3.7);',
          'matematicas.techo.(3.2);',
        ].join('\n'),
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe([
        'Math.pow(2, 3);',
        'Math.sqrt(16);',
        'Math.max(1, 2);',
        'Math.min(1, 2);',
        'Math.floor(3.7);',
        'Math.ceil(3.2);',
      ].join('\n'));
    });

    it('handles matematicas.abs.(expr) using the same dot-paren convention as its siblings', () => {
      const result = engine.transpile({
        code: 'matematicas.abs.(x - 5);',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('Math.abs(x - 5);');
    });

    it('resolves nulo to the literal null, never the Void type', () => {
      const result = engine.transpile({
        code: 'objeto o = nulo;',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('Object o = null;');
      expect(result.output).not.toContain('Void');
    });

    it('does not translate Spanish words inside a string literal', () => {
      const result = engine.transpile({
        code: 'sistema.imprimir("Este programa es para aprender Java");',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('System.out.println("Este programa es para aprender Java");');
    });

    it('does not translate Spanish words inside a // comment', () => {
      const result = engine.transpile({
        code: 'si (verdadero) { }\n// este comentario tiene la palabra para y nuevo',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('if (true) { }\n// este comentario tiene la palabra para y nuevo');
    });

    it('translates code while preserving strings and comments in the same snippet', () => {
      const result = engine.transpile({
        code: 'si (verdadero) { sistema.imprimir("es para todos"); } // sino hacer nada',
        languageId: 'java',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('if (true) { System.out.println("es para todos"); } // sino hacer nada');
    });
  });

  describe('C → Español', () => {
    beforeEach(() => {
      LanguageRegistry.register(cSpanish);
    });

    it('translates type and return', () => {
      const result = engine.transpile({
        code: 'entero x = 5;\nretornar x;',
        languageId: 'c',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('int x = 5;\nreturn x;');
    });

    it('translates if-else and literals', () => {
      const result = engine.transpile({
        code: 'si (verdadero) { retornar 1; } sino { retornar 0; }',
        languageId: 'c',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('if (true) { return 1; } else { return 0; }');
    });

    it('translates principal to the required main entry point name', () => {
      // Without this mapping, HydraCode's own example programs compile to a C
      // file with no main() function and fail to run.
      const result = engine.transpile({
        code: 'entero principal() { retornar 0; }',
        languageId: 'c',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('int main() { return 0; }');
    });
  });

  describe('C++ → Español', () => {
    beforeEach(() => {
      LanguageRegistry.register(cppSpanish);
    });

    it('translates class with public/private', () => {
      const result = engine.transpile({
        code: 'clase Foo { publico: entero x; };',
        languageId: 'cpp',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('class Foo { public: int x; };');
    });

    it('translates ir_a, auto, and registrar (inherited from C)', () => {
      const result = engine.transpile({
        code: 'registrar entero contador = 0;\nauto x = 5;\nir_a fin;',
        languageId: 'cpp',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('register int contador = 0;\nauto x = 5;\ngoto fin;');
    });

    it('translates principal to the required main entry point name', () => {
      const result = engine.transpile({
        code: 'entero principal() { retornar 0; }',
        languageId: 'cpp',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('int main() { return 0; }');
    });
  });

  describe('Python → Español', () => {
    beforeEach(() => {
      LanguageRegistry.register(pythonSpanish);
    });

    it('translates function def and class', () => {
      const result = engine.transpile({
        code: 'funcion saludar(nombre):\n    retornar nulo',
        languageId: 'python',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('def saludar(nombre):\n    return None');
    });

    it('translates if-elif-else', () => {
      const result = engine.transpile({
        code: 'si verdadero:\n    pasar\nsino_si falso:\n    pasar\nsino:\n    pasar',
        languageId: 'python',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('if True:\n    pass\nelif False:\n    pass\nelse:\n    pass');
    });

    it('does not translate Spanish words inside a string literal', () => {
      const result = engine.transpile({
        code: 'si verdadero:\n    mensaje = "es un mensaje para el usuario"',
        languageId: 'python',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('if True:\n    mensaje = "es un mensaje para el usuario"');
    });

    it('does not translate Spanish words inside a # comment', () => {
      const result = engine.transpile({
        code: 'si verdadero:\n    pasar\n# esto es un comentario normal',
        languageId: 'python',
        humanLanguageId: 'es',
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('if True:\n    pass\n# esto es un comentario normal');
    });
  });

  describe('Mapping data integrity', () => {
    it('has no duplicate keys between types and literals for any language mapping', () => {
      const languageMappings = {
        java: javaSpanish,
        c: cSpanish,
        cpp: cppSpanish,
        python: pythonSpanish,
      };

      const duplicates: string[] = [];
      for (const [name, mapping] of Object.entries(languageMappings)) {
        for (const key of Object.keys(mapping.types)) {
          if (key in mapping.literals) {
            duplicates.push(`${name}.${key}`);
          }
        }
      }

      expect(duplicates).toEqual([]);
    });

    it('java nulo is defined only as a literal (null), not as a type', () => {
      expect(javaSpanish.types.nulo).toBeUndefined();
      expect(javaSpanish.literals.nulo).toBe('null');
    });
  });

  describe('Error handling', () => {
    it('returns error for unknown mapping', () => {
      const result = engine.transpile({
        code: 'clase Foo {}',
        languageId: 'java',
        humanLanguageId: 'fr',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns original code on error', () => {
      const result = engine.transpile({
        code: 'clase Foo {}',
        languageId: 'java',
        humanLanguageId: 'fr',
      });
      expect(result.output).toBe('clase Foo {}');
    });
  });
});
