import { describe, it, expect } from 'vitest';
import { checkSyntax } from './syntaxDiagnostics.js';

describe('checkSyntax', () => {
  it('reports nothing for balanced, well-formed code', () => {
    const code = [
      'clase Hola {',
      '  publico estatico vacio principal(cadena[] args) {',
      '    sistema.imprimir("Hola, {mundo}!");',
      '  }',
      '}',
    ].join('\n');
    expect(checkSyntax(code, 'java')).toEqual([]);
  });

  it('flags an unclosed brace at the opener, not at end of file', () => {
    const code = 'si (x) {\n  retornar 1;\n';
    const diags = checkSyntax(code, 'java');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].startLineNumber).toBe(1);
    expect(diags[0].startColumn).toBe(8); // the '{'
  });

  it('flags an unexpected closing brace with no opener', () => {
    const code = 'retornar 1;\n}';
    const diags = checkSyntax(code, 'java');
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain('no tiene');
  });

  it('flags mismatched bracket types', () => {
    const code = 'entero[] x = (1, 2, 3];';
    const diags = checkSyntax(code, 'java');
    expect(diags.some(d => d.message.includes('Se esperaba'))).toBe(true);
  });

  it('flags an unterminated string literal', () => {
    const code = 'sistema.imprimir("hola;';
    const diags = checkSyntax(code, 'java');
    expect(diags.some(d => d.message.includes('sin cerrar'))).toBe(true);
  });

  it('flags an unterminated block comment', () => {
    const code = '/* esto nunca se cierra\nsi (x) { retornar 1; }';
    const diags = checkSyntax(code, 'java');
    expect(diags.some(d => d.message.includes('Comentario de bloque'))).toBe(true);
  });

  it('ignores brackets that only appear inside a comment or string', () => {
    const code = [
      '// esta llave { nunca se cuenta',
      'sistema.imprimir("tampoco esta ) cuenta");',
      'si (x) { retornar 1; }',
    ].join('\n');
    expect(checkSyntax(code, 'java')).toEqual([]);
  });

  it('checks bracket balance for Python (# comments, no braces for blocks)', () => {
    const code = 'lista = [1, 2, 3\nx = (1, 2)';
    const diags = checkSyntax(code, 'python');
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("'['");
  });
});
