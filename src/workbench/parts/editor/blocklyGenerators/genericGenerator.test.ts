import { describe, it, expect } from 'vitest';
import * as Blockly from 'blockly/core';
import { parseCountingForLoop, buildGenericGenerator, finalizeGeneratedCode } from './genericGenerator.js';
import { BLOCK_DEFS } from '../blocklyRenderer.js';
import { javaSpanish } from '../../../../languages/java/JavaSpanish.js';
import { pythonSpanish } from '../../../../languages/python/PythonSpanish.js';
import { goSpanish } from '../../../../languages/go/GoSpanish.js';
import { cSpanish } from '../../../../languages/c/CSpanish.js';
import { HumanLanguageMapping } from '../../../../languages/tokens/HumanLanguageMapping.js';

// Defined once for the whole file (not per-describe-block's beforeAll) — Blockly just
// warns on a redefinition, but there's no reason to trigger that noise every time.
Blockly.defineBlocksWithJsonArray(BLOCK_DEFS);

describe('parseCountingForLoop', () => {
  it('parses a "<" counting loop with a type prefix', () => {
    expect(parseCountingForLoop('entero i = 0; i < 10; i++')).toEqual({ varName: 'i', start: '0', op: '<', end: '10' });
  });

  it('parses a "<" counting loop without a type prefix', () => {
    expect(parseCountingForLoop('i = 0; i < 10; i++')).toEqual({ varName: 'i', start: '0', op: '<', end: '10' });
  });

  it('parses a "<=" inclusive loop, preserving the operator as-is', () => {
    expect(parseCountingForLoop('entero i = 0; i <= 10; i++')).toEqual({ varName: 'i', start: '0', op: '<=', end: '10' });
  });

  it('returns null for a non-counting-loop pattern', () => {
    expect(parseCountingForLoop('entero i = 0, j = 0; i < 10; i++, j++')).toBeNull();
  });

  it('returns null when the increment variable does not match the condition variable', () => {
    expect(parseCountingForLoop('entero i = 0; j < 10; i++')).toBeNull();
  });
});

describe('buildGenericGenerator', () => {
  it('returns null for a mapping with no blockTemplate', () => {
    const bare = new HumanLanguageMapping('es', 'Spanish', 'Español', 'nolang', { keywords: {}, types: {}, literals: {}, modifiers: {} });
    expect(buildGenericGenerator(bare)).toBeNull();
  });

  it('registers a forBlock entry for every hc_* block type for a braces-style mapping (Java)', () => {
    const gen = buildGenericGenerator(javaSpanish);
    expect(gen).not.toBeNull();
    const expectedTypes = [
      'hc_clase', 'hc_main', 'hc_metodo', 'hc_si', 'hc_mientras', 'hc_hacer', 'hc_para',
      'hc_cambiar', 'hc_intentar', 'hc_imprimir', 'hc_imprimir_error',
      'hc_entero', 'hc_cadena', 'hc_booleano', 'hc_doble', 'hc_flotante', 'hc_largo', 'hc_caracter', 'hc_corto', 'hc_var',
      'hc_retornar', 'hc_lanzar', 'hc_romper', 'hc_continuar',
    ];
    for (const type of expectedTypes) {
      expect(gen!.forBlock[type], `missing forBlock['${type}']`).toBeTypeOf('function');
    }
  });

  it('registers the same block type set for an indent-style mapping (Python)', () => {
    const gen = buildGenericGenerator(pythonSpanish);
    expect(gen).not.toBeNull();
    expect(gen!.forBlock['hc_para']).toBeTypeOf('function');
    expect(gen!.forBlock['hc_hacer']).toBeTypeOf('function');
    // Python's blockTemplate declares switchKeyword: null — hc_cambiar must still be
    // registered (falls back to a commented passthrough), never left unregistered.
    expect(gen!.forBlock['hc_cambiar']).toBeTypeOf('function');
  });
});

describe('buildGenericGenerator against real blocks (Go)', () => {
  let workspace: Blockly.Workspace;

  function newBlock(type: string, fields: Record<string, string> = {}): Blockly.Block {
    const block = workspace.newBlock(type);
    for (const [name, value] of Object.entries(fields)) block.setFieldValue(value, name);
    return block;
  }

  it('reconstructs a counting for-loop as an unparenthesized short-declaration loop', () => {
    workspace = new Blockly.Workspace();
    const gen = buildGenericGenerator(goSpanish)!;
    const block = newBlock('hc_para', { INIT: 'entero i = 0; i < 10; i++' });
    expect(gen.blockToCode(block)).toBe('para i := 0; i < 10; i++ {\n}\n');
  });

  it('emits simple statements with no trailing semicolon', () => {
    workspace = new Blockly.Workspace();
    const gen = buildGenericGenerator(goSpanish)!;
    expect(gen.blockToCode(newBlock('hc_romper'))).toBe('romper\n');
    expect(gen.blockToCode(newBlock('hc_retornar', { VALUE: 'resultado' }))).toBe('retornar resultado\n');
    expect(gen.blockToCode(newBlock('hc_entero', { VAR: 'x = 0' }))).toBe('var x = 0\n');
  });

  it('wraps main with just the func header — the package line is filePrefix, not part of main', () => {
    workspace = new Blockly.Workspace();
    const gen = buildGenericGenerator(goSpanish)!;
    expect(gen.blockToCode(newBlock('hc_main'))).toBe('funcion principal() {\n}\n');
  });

  it('falls back to a commented passthrough for unsupported try/catch', () => {
    workspace = new Blockly.Workspace();
    const gen = buildGenericGenerator(goSpanish)!;
    const code = gen.blockToCode(newBlock('hc_intentar', { EXC: 'excepcion e' })) as string;
    expect(code).toContain('// go no soporta excepciones');
  });
});

describe('finalizeGeneratedCode (preamble + filePrefix assembly)', () => {
  let workspace: Blockly.Workspace;

  function newBlock(type: string, fields: Record<string, string> = {}): Blockly.Block {
    const block = workspace.newBlock(type);
    for (const [name, value] of Object.entries(fields)) block.setFieldValue(value, name);
    return block;
  }

  it('adds no preamble at all when the program never uses print/printError', () => {
    workspace = new Blockly.Workspace();
    const gen = buildGenericGenerator(goSpanish)!;
    const body = gen.blockToCode(newBlock('hc_retornar', { VALUE: '0' })) as string;
    const finalCode = finalizeGeneratedCode(body, gen, goSpanish.blockTemplate!);
    // Go's filePrefix ("paquete principal") is unconditional — only the import is
    // usage-gated — so it's the only thing that should appear ahead of the body.
    expect(finalCode).toBe('paquete principal\n\nretornar 0\n');
  });

  it('adds exactly the import for a used construct, not the other one', () => {
    workspace = new Blockly.Workspace();
    const gen = buildGenericGenerator(goSpanish)!;
    const body = gen.blockToCode(newBlock('hc_imprimir', { TEXT: '"hola"' })) as string;
    const finalCode = finalizeGeneratedCode(body, gen, goSpanish.blockTemplate!);
    expect(finalCode).toBe('paquete principal\n\nimportar "fmt"\n\nfmt.Println("hola")\n');
    expect(finalCode).not.toContain('"os"');
  });

  it('dedupes an import shared by two used constructs (Go: both print and printError need "fmt")', () => {
    workspace = new Blockly.Workspace();
    const gen = buildGenericGenerator(goSpanish)!;
    let body = gen.blockToCode(newBlock('hc_imprimir', { TEXT: '"a"' })) as string;
    body += gen.blockToCode(newBlock('hc_imprimir_error', { TEXT: '"b"' })) as string;
    const finalCode = finalizeGeneratedCode(body, gen, goSpanish.blockTemplate!);
    expect(finalCode.match(/importar "fmt"/g)).toHaveLength(1);
    expect(finalCode).toContain('importar "os"');
  });

  it('clears used-construct tracking between calls instead of accumulating across getCode() calls', () => {
    workspace = new Blockly.Workspace();
    const gen = buildGenericGenerator(goSpanish)!;
    const withPrint = gen.blockToCode(newBlock('hc_imprimir', { TEXT: '"a"' })) as string;
    finalizeGeneratedCode(withPrint, gen, goSpanish.blockTemplate!);

    // A second, independent pass that never touches print/printError...
    const justReturn = gen.blockToCode(newBlock('hc_retornar', { VALUE: '0' })) as string;
    const finalCode = finalizeGeneratedCode(justReturn, gen, goSpanish.blockTemplate!);
    // ...must NOT still carry the previous pass's "fmt" import.
    expect(finalCode).not.toContain('importar "fmt"');
  });

  it('has no filePrefix for a language that does not need one (C)', () => {
    workspace = new Blockly.Workspace();
    const gen = buildGenericGenerator(cSpanish)!;
    const body = gen.blockToCode(newBlock('hc_imprimir', { TEXT: '"hola"' })) as string;
    const finalCode = finalizeGeneratedCode(body, gen, cSpanish.blockTemplate!);
    expect(finalCode).toBe('#include <stdio.h>\n\nprintf("hola");\n');
  });
});
