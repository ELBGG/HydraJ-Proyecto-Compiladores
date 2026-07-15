import { describe, it, expect } from 'vitest';
import { buildStarterFile } from './fileTemplates.js';
import { javaSpanish } from '../../../languages/java/JavaSpanish.js';
import { cSpanish } from '../../../languages/c/CSpanish.js';
import { pythonSpanish } from '../../../languages/python/PythonSpanish.js';
import { goSpanish } from '../../../languages/go/GoSpanish.js';

describe('buildStarterFile', () => {
  it('returns null when there is no mapping at all', () => {
    expect(buildStarterFile(undefined, 'test')).toBeNull();
  });

  it('wraps main in a class for Java (mainRequiresClass), named after the file', () => {
    const out = buildStarterFile(javaSpanish, 'test');
    expect(out).toBe(
      'clase Test {\n' +
      '    publico estatico vacio principal(cadena[] argumentos) {\n' +
      '        sistema.imprimir("Hola Mundo");\n' +
      '    }\n' +
      '}\n',
    );
  });

  it('does not wrap main in a class for C (no mainRequiresClass), and includes the preamble', () => {
    const out = buildStarterFile(cSpanish, 'test');
    expect(out).toBe(
      '#include <stdio.h>\n\n' +
      'entero principal() {\n' +
      '    printf("Hola Mundo");\n' +
      '}\n',
    );
  });

  it('uses indent style with no braces for Python', () => {
    const out = buildStarterFile(pythonSpanish, 'test');
    expect(out).toBe('si __name__ == "__main__":\n    print("Hola Mundo")\n');
  });

  it('places filePrefix before preamble before the entry point for Go', () => {
    const out = buildStarterFile(goSpanish, 'test');
    expect(out).toBe(
      'paquete principal\n\n' +
      'importar "fmt"\n\n' +
      'funcion principal() {\n' +
      '    fmt.Println("Hola Mundo")\n' +
      '}\n',
    );
  });

  it('sanitizes a non-identifier filename into a valid Java class name', () => {
    const out = buildStarterFile(javaSpanish, 'mi-programa 2');
    expect(out).toContain('clase Miprograma2 {');
  });
});
