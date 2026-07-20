import { describe, it, expect } from 'vitest';
import { parseMappingFile, mappingToFile, MappingFileError } from './mappingFile.js';
import { HumanLanguageMapping } from './HumanLanguageMapping.js';

const VALID_FILE = {
  langId: 'rust',
  id: 'es',
  name: 'Spanish',
  nativeName: 'Español',
  keywords: { 'si': 'if', 'para': 'for' },
  types: { 'entero': 'i32' },
  literals: { 'verdadero': 'true' },
  modifiers: {},
  patterns: [{ from: '\\bimprimir\\b', to: 'println!' }],
};

describe('parseMappingFile', () => {
  it('parses a well-formed mapping file into a working HumanLanguageMapping', () => {
    const mapping = parseMappingFile(VALID_FILE);
    expect(mapping).toBeInstanceOf(HumanLanguageMapping);
    expect(mapping.languageId).toBe('rust');
    expect(mapping.keywords.si).toBe('if');
    expect(mapping.patterns).toHaveLength(1);
    expect(mapping.patterns[0].from).toBeInstanceOf(RegExp);
    expect('imprimir("hola")'.replace(mapping.patterns[0].from, mapping.patterns[0].to)).toBe('println!("hola")');
  });

  it('defaults id/name/nativeName/patterns the same way the pre-existing example-mapping import flow already did', () => {
    const mapping = parseMappingFile({ langId: 'rust', keywords: { si: 'if' } });
    expect(mapping.id).toBe('es');
    expect(mapping.name).toBe('Spanish');
    expect(mapping.nativeName).toBe('Español');
    expect(mapping.patterns).toEqual([]);
  });

  it('uses fallbackLangId when the file omits langId — matches extensionsPanel.ts calling with the marketplace result\'s own id', () => {
    const mapping = parseMappingFile({ keywords: { si: 'if' } }, 'go');
    expect(mapping.languageId).toBe('go');
  });

  it('rejects a non-object payload', () => {
    expect(() => parseMappingFile(null)).toThrow(MappingFileError);
    expect(() => parseMappingFile('not json')).toThrow(MappingFileError);
    expect(() => parseMappingFile([1, 2, 3])).toThrow(MappingFileError);
  });

  it('rejects a missing langId with no fallback provided either', () => {
    expect(() => parseMappingFile({ keywords: { si: 'if' } })).toThrow(/langId/);
  });

  it('rejects a file with neither keywords nor types at all', () => {
    expect(() => parseMappingFile({ langId: 'rust' })).toThrow(/keywords.*types/);
  });

  it('rejects an unsupported schemaVersion instead of silently misreading a foreign format', () => {
    expect(() => parseMappingFile({ ...VALID_FILE, schemaVersion: 2 })).toThrow(/schemaVersion/);
  });

  it('accepts a file with no schemaVersion at all — this field is optional for backward compatibility', () => {
    expect(() => parseMappingFile(VALID_FILE)).not.toThrow();
  });

  it('rejects keywords/types/literals/modifiers that are not plain string->string objects', () => {
    expect(() => parseMappingFile({ ...VALID_FILE, keywords: { si: 123 } })).toThrow(MappingFileError);
    expect(() => parseMappingFile({ ...VALID_FILE, keywords: ['si'] })).toThrow(MappingFileError);
    expect(() => parseMappingFile({ ...VALID_FILE, keywords: 'si=if' })).toThrow(MappingFileError);
  });

  it('rejects a prototype-polluting key in keywords instead of silently walking past it', () => {
    const malicious = JSON.parse('{"si":"if","__proto__":{"polluted":true}}');
    expect(() => parseMappingFile({ ...VALID_FILE, keywords: malicious })).toThrow(MappingFileError);
  });

  it('skips a single malformed regex pattern rather than rejecting the whole mapping', () => {
    const mapping = parseMappingFile({
      ...VALID_FILE,
      patterns: [
        { from: '(unclosed', to: 'x' },
        { from: '\\bok\\b', to: 'fine' },
      ],
    });
    expect(mapping.patterns).toHaveLength(1);
    expect(mapping.patterns[0].to).toBe('fine');
  });

  it('rejects a catastrophic-backtracking pattern (ReDoS) instead of compiling it', () => {
    const mapping = parseMappingFile({
      ...VALID_FILE,
      patterns: [
        { from: '(a+)+$', to: 'x' },
        { from: '(a*)*', to: 'x' },
        { from: '(\\d+)+', to: 'x' },
        { from: '\\bok\\b', to: 'fine' },
      ],
    });
    expect(mapping.patterns).toHaveLength(1);
    expect(mapping.patterns[0].to).toBe('fine');
  });

  it('never flags any of the mapping patterns already shipped in JavaSpanish.ts as catastrophic (no false positives)', () => {
    const realJavaPatterns = [
      String.raw`\bsistema\.imprimir\b`,
      String.raw`\bsistema\.imprimir_linea\b`,
      String.raw`\bsistema\.imprimir_error\b`,
      String.raw`\bsistema\.leer\b`,
      String.raw`\bmatematicas\.aleatorio\b`,
      String.raw`\bmatematicas\.abs\.\(([^)]+)\)`,
      String.raw`\bmatematicas\.potencia\.\(([^,]+),\s*([^)]+)\)`,
      String.raw`\bmatematicas\.raiz\.\(([^)]+)\)`,
      String.raw`\bmatematicas\.maximo\.\(([^,]+),\s*([^)]+)\)`,
      String.raw`\bmatematicas\.minimo\.\(([^,]+),\s*([^)]+)\)`,
      String.raw`\bmatematicas\.piso\.\(([^)]+)\)`,
      String.raw`\bmatematicas\.techo\.\(([^)]+)\)`,
    ];
    const mapping = parseMappingFile({
      ...VALID_FILE,
      patterns: realJavaPatterns.map(from => ({ from, to: 'x' })),
    });
    expect(mapping.patterns).toHaveLength(realJavaPatterns.length);
  });

  it('rejects a pattern whose source exceeds the length cap', () => {
    const mapping = parseMappingFile({
      ...VALID_FILE,
      patterns: [
        { from: 'a'.repeat(301), to: 'x' },
        { from: '\\bok\\b', to: 'fine' },
      ],
    });
    expect(mapping.patterns).toHaveLength(1);
    expect(mapping.patterns[0].to).toBe('fine');
  });

  it('caps the total number of patterns a single mapping can register', () => {
    const patterns = Array.from({ length: 250 }, (_, i) => ({ from: `\\bword${i}\\b`, to: `x${i}` }));
    const mapping = parseMappingFile({ ...VALID_FILE, patterns });
    expect(mapping.patterns).toHaveLength(200);
  });

  it('never executes arbitrary code from the payload — a function-shaped field is inert data', () => {
    // If parseMappingFile ever regressed into eval()/Function()/new Function-style
    // execution of untrusted input, a field like this would be the way to prove it.
    const malicious = { ...VALID_FILE, keywords: { si: 'if' }, evil: '"; require("child_process").exec("touch pwned"); //' };
    const mapping = parseMappingFile(malicious);
    expect(mapping.keywords.si).toBe('if');
  });

  it('rejects a non-object blockTemplate', () => {
    expect(() => parseMappingFile({ ...VALID_FILE, blockTemplate: 'not an object' })).toThrow(MappingFileError);
  });

  it('passes a well-formed blockTemplate through as plain data', () => {
    const blockTemplate = {
      style: 'braces' as const, main: 'fn main()', class: null, method: '{SIGNATURE}',
      lineComment: '//', ifKeyword: 'si', elseKeyword: 'sino', whileKeyword: 'mientras',
      forKeyword: 'para', supportsDoWhile: false, forStyle: 'c-style' as const,
      switchKeyword: null, supportsTryCatch: false, print: 'println!({TEXT})', printError: 'eprintln!({TEXT})',
      varDecl: 'let {VAR}: {TYPE}', returnKeyword: 'retornar', throwTemplate: null,
      breakKeyword: 'romper', continueKeyword: 'continuar',
    };
    const mapping = parseMappingFile({ ...VALID_FILE, blockTemplate });
    expect(mapping.blockTemplate).toEqual(blockTemplate);
  });
});

describe('mappingToFile', () => {
  it('round-trips through parseMappingFile back to an equivalent mapping', () => {
    const original = new HumanLanguageMapping('es', 'Spanish', 'Español', 'rust', {
      keywords: { si: 'if' },
      patterns: [{ from: /\bimprimir\b/g, to: 'println!' }],
    });
    const file = mappingToFile(original);
    expect(file.schemaVersion).toBe(1);
    expect(file.langId).toBe('rust');
    expect(file.patterns).toEqual([{ from: '\\bimprimir\\b', flags: 'g', to: 'println!' }]);

    const roundTripped = parseMappingFile(file);
    expect(roundTripped.keywords).toEqual(original.keywords);
    expect(roundTripped.patterns[0].from.source).toBe(original.patterns[0].from.source);
  });
});
