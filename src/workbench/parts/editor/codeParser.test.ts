import { describe, it, expect } from 'vitest';
import { parseCodeToBlocks } from './codeParser.js';

describe('codeParser', () => {
  it('parses a simple class with main method', () => {
    const code = `clase Hola {
  publico estatico vacio principal(cadena[] argumentos) {
    sistema.imprimir("Hola");
  }
}`;
    const blocks = parseCodeToBlocks(code);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('clase');
  });

  it('parses a Go-style "funcion principal()" as the dedicated main block', () => {
    const code = `funcion principal() {
  fmt.Println("Hola")
}`;
    const blocks = parseCodeToBlocks(code);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('main');
  });

  it('parses if-else blocks', () => {
    const code = `si (verdadero) {
  sistema.imprimir("si");
} sino {
  sistema.imprimir("no");
}`;
    const blocks = parseCodeToBlocks(code);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('returns empty array for empty code', () => {
    const blocks = parseCodeToBlocks('');
    expect(blocks).toEqual([]);
  });

  it('preserves code without Spanish keywords as a raw block instead of dropping it', () => {
    // Previously this silently vanished (Bug 3): unrecognized statements must
    // never be deleted, even when nothing about them is recognized at all.
    const blocks = parseCodeToBlocks('function foo() { return 1; }');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('raw');
    expect(blocks[0].params).toBe('function foo() { return 1; }');
  });

  it('parses a single-line si block without losing its body or swallowing the next statement', () => {
    // Bug 2: extractSiSino used to require >= 2 physical lines before it would
    // stop, so a fully single-line "si (...) { ... }" both lost its own inline
    // body AND ate the following, unrelated statement.
    const code = [
      'si (x) { retornar 1; }',
      'sistema.imprimir("despues");',
    ].join('\n');
    const blocks = parseCodeToBlocks(code);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('si');
    expect(blocks[0].children).toHaveLength(1);
    expect(blocks[0].children[0].type).toBe('retornar');
    expect(blocks[0].children[0].params).toBe('1');
    expect(blocks[1].type).toBe('imprimir');
  });

  it('parses a single-line intentar (try) block without losing its body or swallowing the next statement', () => {
    // Same fix as above, applied to extractTryCatch.
    const code = [
      'intentar { retornar 1; }',
      'sistema.imprimir("despues");',
    ].join('\n');
    const blocks = parseCodeToBlocks(code);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('intentar');
    expect(blocks[0].children).toHaveLength(1);
    expect(blocks[0].children[0].type).toBe('retornar');
    expect(blocks[1].type).toBe('imprimir');
  });

  it('preserves case labels and break statements in a switch block instead of silently dropping them', () => {
    // Bug 3: caso/romper/defecto lines aren't recognized by parseOneLine, so they
    // used to be deleted outright — corrupting "print exactly one of three
    // things" into a switch body with no case labels at all, with no error.
    const code = [
      'cambiar (x) {',
      'caso 1:',
      'sistema.imprimir("uno");',
      'romper;',
      'caso 2:',
      'sistema.imprimir("dos");',
      'romper;',
      'defecto:',
      'sistema.imprimir("otro");',
      '}',
    ].join('\n');
    const blocks = parseCodeToBlocks(code);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('cambiar');
    const children = blocks[0].children;
    expect(children).toHaveLength(8);
    expect(children.filter(c => /^caso /.test(c.params))).toHaveLength(2);
    expect(children.some(c => c.params === 'defecto:')).toBe(true);
    expect(children.filter(c => c.type === 'romper')).toHaveLength(2);
    expect(children.filter(c => c.type === 'imprimir')).toHaveLength(3);
  });

  it('does not throw a stack overflow on very deeply nested input', () => {
    // Bug 4: parseLines/parseOneLine recursed once per nesting level with no
    // depth guard; ~1000 levels used to throw RangeError: Maximum call stack
    // size exceeded. It should now degrade gracefully instead of crashing.
    const n = 1000;
    const code = 'si (true) {\n'.repeat(n) + 'romper;\n' + '}\n'.repeat(n);
    expect(() => parseCodeToBlocks(code)).not.toThrow();
  });
});
