import { describe, it, expect } from 'vitest';
import { parseCodeToBlocks } from './codeParser.js';
import { HumanLanguageMapping } from '../../../languages/tokens/HumanLanguageMapping.js';
import type { IBlockCodeTemplate } from '../../../languages/tokens/types.js';

/**
 * codeParser.ts reads its entire vocabulary from mapping.blockTemplate + mapping.modifiers
 * — nothing here is hardcoded to any one human language — so these fixtures mirror the
 * REAL blockTemplate shapes shipped for Java/C/C++/Python/Go (electron/mapping-seeds/*.json
 * and src/languages/go/GoSpanish.ts) plus the Italian/Portuguese/French/Japanese mappings
 * authored this session, rather than synthetic simplified templates — a bug that only
 * shows up against a *real* shape (mainRequiresClass, typeOverrides collisions, a
 * paren-less Python-style main header, non-ASCII keywords, ...) would otherwise slip past.
 */

function mkMapping(languageId: string, id: string, nativeName: string, opts: {
  modifiers?: Record<string, string>;
  blockTemplate: IBlockCodeTemplate;
}): HumanLanguageMapping {
  return new HumanLanguageMapping(id, id, nativeName, languageId, {
    keywords: {},
    types: {},
    literals: {},
    modifiers: opts.modifiers ?? {},
    patterns: [],
    blockTemplate: opts.blockTemplate,
  });
}

// ── Real-shaped fixtures ──────────────────────────────────────────────────────

const javaEs = mkMapping('java', 'es', 'Español', {
  modifiers: { publico: 'public', privado: 'private', protegido: 'protected', estatico: 'static', final: 'final' },
  blockTemplate: {
    style: 'braces',
    main: 'publico estatico vacio principal(cadena[] argumentos)',
    mainRequiresClass: true,
    class: 'clase {NAME}',
    method: '{SIGNATURE}',
    lineComment: '//',
    ifKeyword: 'si', elseKeyword: 'sino', whileKeyword: 'mientras', forKeyword: 'para',
    doKeyword: 'hacer', supportsDoWhile: true, forStyle: 'c-style',
    switchKeyword: 'cambiar',
    supportsTryCatch: true, tryKeyword: 'intentar', catchKeyword: 'capturar',
    print: 'sistema.imprimir({TEXT})', printError: 'sistema.imprimir_error({TEXT})',
    varDecl: '{TYPE} {VAR}',
    returnKeyword: 'retornar', throwTemplate: 'lanzar nuevo {EXC}',
    breakKeyword: 'romper', continueKeyword: 'continuar',
  },
});

const cEs = mkMapping('c', 'es', 'Español', {
  modifiers: { const: 'const', estatico: 'static' },
  blockTemplate: {
    style: 'braces',
    main: 'entero principal()',
    class: 'estructura {NAME}', classTrailingSemicolon: true,
    method: '{SIGNATURE}',
    lineComment: '//',
    ifKeyword: 'si', elseKeyword: 'sino', whileKeyword: 'mientras', forKeyword: 'para',
    doKeyword: 'hacer', supportsDoWhile: true, forStyle: 'c-style',
    switchKeyword: 'cambiar',
    supportsTryCatch: false,
    print: 'printf({TEXT})', printError: 'fprintf(stderr, {TEXT})',
    varDecl: '{TYPE} {VAR}',
    // Deliberately collides: 'booleano' and 'var' both fall back to the literal word
    // "entero" (C has neither type) — the reverse map must prefer entero for that word.
    typeOverrides: { cadena: 'caracter*', booleano: 'entero', var: 'entero' },
    returnKeyword: 'retornar', throwTemplate: null,
    breakKeyword: 'romper', continueKeyword: 'continuar',
  },
});

const cppEs = mkMapping('cpp', 'es', 'Español', {
  modifiers: { const: 'const', estatico: 'static' },
  blockTemplate: {
    style: 'braces',
    main: 'entero principal()',
    class: 'clase {NAME}', classTrailingSemicolon: true,
    method: '{SIGNATURE}',
    lineComment: '//',
    ifKeyword: 'si', elseKeyword: 'sino', whileKeyword: 'mientras', forKeyword: 'para',
    doKeyword: 'hacer', supportsDoWhile: true, forStyle: 'c-style',
    switchKeyword: 'cambiar',
    supportsTryCatch: true, tryKeyword: 'intentar', catchKeyword: 'capturar',
    print: 'cout << {TEXT} << endl', printError: 'cerr << {TEXT} << endl',
    varDecl: '{TYPE} {VAR}',
    returnKeyword: 'retornar', throwTemplate: 'lanzar {EXC}',
    breakKeyword: 'romper', continueKeyword: 'continuar',
  },
});

const pythonEs = mkMapping('python', 'es', 'Español', {
  blockTemplate: {
    style: 'indent',
    main: 'si __name__ == "__main__"',
    class: 'clase {NAME}',
    method: 'funcion {SIGNATURE}',
    stripFromSignature: ['^(publico|privado|protegido|estatico)\\s+', '^vacio\\s+'],
    lineComment: '#',
    ifKeyword: 'si', elseKeyword: 'sino', whileKeyword: 'mientras', forKeyword: 'para',
    supportsDoWhile: false, forStyle: 'range',
    switchKeyword: null,
    supportsTryCatch: true, tryKeyword: 'intentar', catchKeyword: 'excepto',
    print: 'print({TEXT})', printError: 'print({TEXT}, file=sys.stderr)',
    varDecl: null,
    returnKeyword: 'retornar', throwTemplate: 'elevar {EXC}',
    breakKeyword: 'romper', continueKeyword: 'continuar',
  },
});

const goEs = mkMapping('go', 'es', 'Español', {
  modifiers: { constante: 'const' },
  blockTemplate: {
    style: 'braces',
    main: 'funcion principal()',
    filePrefix: 'paquete principal',
    class: 'estructura {NAME}',
    method: 'funcion {SIGNATURE}',
    stripFromSignature: ['^(publico|privado|protegido|estatico)\\s+', '^vacio\\s+'],
    lineComment: '//',
    ifKeyword: 'si', elseKeyword: 'sino', whileKeyword: 'para', forKeyword: 'para',
    supportsDoWhile: false, forStyle: 'go-style',
    switchKeyword: 'cambiar',
    supportsTryCatch: false,
    print: 'fmt.Println({TEXT})', printError: 'fmt.Fprintln(os.Stderr, {TEXT})',
    varDecl: 'var {VAR}',
    returnKeyword: 'retornar', throwTemplate: null,
    breakKeyword: 'romper', continueKeyword: 'continuar',
    statementTerminator: '',
  },
});

// Real content from the Cpp-Italian-mappings-hydracode / Java-Japanese-mappings-hydracode
// repos authored earlier this session — the exact case this rewrite exists to fix.
const cppItalian = mkMapping('cpp', 'it', 'Italiano', {
  modifiers: { const: 'const', statico: 'static' },
  blockTemplate: {
    style: 'braces',
    main: 'intero principale()',
    class: 'classe {NAME}', classTrailingSemicolon: true,
    method: '{SIGNATURE}',
    lineComment: '//',
    ifKeyword: 'se', elseKeyword: 'altrimenti', whileKeyword: 'mentre', forKeyword: 'per',
    doKeyword: 'fai', supportsDoWhile: true, forStyle: 'c-style',
    switchKeyword: 'scegli',
    supportsTryCatch: true, tryKeyword: 'prova', catchKeyword: 'cattura',
    print: 'cout << {TEXT} << endl', printError: 'cerr << {TEXT} << endl',
    varDecl: '{TYPE} {VAR}',
    returnKeyword: 'ritorna', throwTemplate: 'lancia {EXC}',
    breakKeyword: 'interrompi', continueKeyword: 'continua',
  },
});

const javaJapanese = mkMapping('java', 'ja', '日本語', {
  modifiers: { パブリック: 'public', プライベート: 'private', スタティック: 'static' },
  blockTemplate: {
    style: 'braces',
    main: 'パブリック スタティック から メイン(ストリング[] ひきすう)',
    mainRequiresClass: true,
    class: 'クラス {NAME}',
    method: '{SIGNATURE}',
    lineComment: '//',
    ifKeyword: 'もし', elseKeyword: 'ほか', whileKeyword: 'あいだ', forKeyword: 'くりかえす',
    doKeyword: 'する', supportsDoWhile: true, forStyle: 'c-style',
    switchKeyword: 'きりかえ',
    supportsTryCatch: true, tryKeyword: 'ためす', catchKeyword: 'つかまえる',
    print: 'システム.いんさつ({TEXT})', printError: 'システム.いんさつ_えらー({TEXT})',
    varDecl: '{TYPE} {VAR}',
    returnKeyword: 'もどす', throwTemplate: 'なげる あたらしい {EXC}',
    breakKeyword: 'やめる', continueKeyword: 'つづける',
  },
});

const cFrench = mkMapping('c', 'fr', 'Français', {
  modifiers: { const: 'const', statique: 'static', externe: 'extern', volatile: 'volatile', registre: 'register' },
  blockTemplate: {
    style: 'braces',
    main: 'entier principal()',
    class: 'structure {NAME}', classTrailingSemicolon: true,
    method: '{SIGNATURE}',
    lineComment: '//',
    ifKeyword: 'si', elseKeyword: 'sinon', whileKeyword: 'tantque', forKeyword: 'pour',
    doKeyword: 'faire', supportsDoWhile: true, forStyle: 'c-style',
    switchKeyword: 'selon',
    supportsTryCatch: false,
    print: 'printf({TEXT})', printError: 'fprintf(stderr, {TEXT})',
    varDecl: '{TYPE} {VAR}',
    typeOverrides: { cadena: 'caractere*', booleano: 'entier', var: 'entier' },
    returnKeyword: 'retourner', throwTemplate: null,
    breakKeyword: 'interrompre', continueKeyword: 'continuer',
  },
});

const pythonPortuguese = mkMapping('python', 'pt', 'Português', {
  blockTemplate: {
    style: 'indent',
    main: 'se __name__ == "__main__"',
    class: 'classe {NAME}',
    method: 'funcao {SIGNATURE}',
    lineComment: '#',
    ifKeyword: 'se', elseKeyword: 'senao', whileKeyword: 'enquanto', forKeyword: 'para',
    supportsDoWhile: false, forStyle: 'range',
    switchKeyword: null,
    supportsTryCatch: true, tryKeyword: 'tentar', catchKeyword: 'exceto',
    print: 'print({TEXT})', printError: 'print({TEXT}, file=sys.stderr)',
    varDecl: null,
    returnKeyword: 'retornar', throwTemplate: 'levantar {EXC}',
    breakKeyword: 'quebrar', continueKeyword: 'continuar',
  },
});

describe('codeParser', () => {
  describe('Java-ES (braces, modifiers, mainRequiresClass)', () => {
    it('parses a simple class with main method', () => {
      const code = `clase Hola {
  publico estatico vacio principal(cadena[] argumentos) {
    sistema.imprimir("Hola");
  }
}`;
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('clase');
      expect(blocks[0].params).toBe('Hola');
      const main = blocks[0].children[0];
      expect(main.type).toBe('main');
      expect(main.children[0].type).toBe('imprimir');
      expect(main.children[0].params).toBe('"Hola"');
    });

    it('parses if-else blocks', () => {
      const code = `si (verdadero) {
  sistema.imprimir("si");
} sino {
  sistema.imprimir("no");
}`;
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('si');
      expect(blocks[0].params).toBe('verdadero');
      expect(blocks[0].children[0].params).toBe('"si"');
      expect(blocks[0].elseChildren[0].params).toBe('"no"');
    });

    it('returns empty array for empty code', () => {
      expect(parseCodeToBlocks('', javaEs)).toEqual([]);
    });

    it('preserves code without recognized keywords as a raw block instead of dropping it', () => {
      const blocks = parseCodeToBlocks('function foo() { return 1; }', javaEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('raw');
      expect(blocks[0].params).toBe('function foo() { return 1; }');
    });

    it('parses a single-line si block without losing its body or swallowing the next statement', () => {
      const code = ['si (x) { retornar 1; }', 'sistema.imprimir("despues");'].join('\n');
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('si');
      expect(blocks[0].children).toHaveLength(1);
      expect(blocks[0].children[0].type).toBe('retornar');
      expect(blocks[0].children[0].params).toBe('1');
      expect(blocks[1].type).toBe('imprimir');
    });

    it('parses a single-line intentar (try) block without losing its body or swallowing the next statement', () => {
      const code = ['intentar { retornar 1; }', 'sistema.imprimir("despues");'].join('\n');
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('intentar');
      expect(blocks[0].children).toHaveLength(1);
      expect(blocks[0].children[0].type).toBe('retornar');
      expect(blocks[1].type).toBe('imprimir');
    });

    it('preserves case labels and break statements in a switch block instead of silently dropping them', () => {
      const code = [
        'cambiar (x) {', 'caso 1:', 'sistema.imprimir("uno");', 'romper;',
        'caso 2:', 'sistema.imprimir("dos");', 'romper;',
        'defecto:', 'sistema.imprimir("otro");', '}',
      ].join('\n');
      const blocks = parseCodeToBlocks(code, javaEs);
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
      const n = 1000;
      const code = 'si (true) {\n'.repeat(n) + 'romper;\n' + '}\n'.repeat(n);
      expect(() => parseCodeToBlocks(code, javaEs)).not.toThrow();
    });

    it('parses a do-while loop and extracts its trailing condition', () => {
      const code = 'hacer {\n  romper;\n} mientras (x < 10);';
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('hacer');
      expect(blocks[0].params).toBe('x < 10');
    });

    it('parses try/catch, capturing the catch parameter', () => {
      const code = 'intentar {\n  retornar 1;\n} capturar (ExcepcionIO e) {\n  romper;\n}';
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks[0].type).toBe('intentar');
      expect(blocks[0].params).toBe('ExcepcionIO e');
      expect(blocks[0].elseChildren[0].type).toBe('romper');
    });

    it('recognizes a modifier-less method (package-private) by shape alone', () => {
      const code = 'entero suma(entero a, entero b) {\n  retornar a;\n}';
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks[0].type).toBe('metodo');
      expect(blocks[0].params).toBe('entero suma(entero a, entero b)');
    });

    it('parses a for loop, capturing the full C-style header', () => {
      const code = 'para (entero i = 0; i < 10; i++) {\n  romper;\n}';
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks[0].type).toBe('para');
      expect(blocks[0].params).toBe('entero i = 0; i < 10; i++');
    });

    it('parses throw with its exception expression', () => {
      const blocks = parseCodeToBlocks('lanzar nuevo ExcepcionIO("boom");', javaEs);
      expect(blocks[0].type).toBe('lanzar');
      expect(blocks[0].params).toBe('ExcepcionIO("boom")');
    });
  });

  describe('C-ES (typeOverrides collision)', () => {
    it('resolves a bare override target to its canonical (non-overridden) block type', () => {
      // C has neither bool nor a real string type — 'booleano' and 'var' BOTH fall
      // back to the literal word "entero" (see typeOverrides above). A plain "entero
      // x;" must still resolve to the entero block, not booleano/var.
      const blocks = parseCodeToBlocks('entero x = 5;', cEs);
      expect(blocks[0].type).toBe('entero');
      expect(blocks[0].params).toBe('x = 5');
    });

    it('parses an overridden type keyword back to its real block type', () => {
      const blocks = parseCodeToBlocks('caracter* nombre = "hola";', cEs);
      expect(blocks[0].type).toBe('cadena');
      expect(blocks[0].params).toBe('nombre = "hola"');
    });

    it('has no try/catch vocabulary at all (supportsTryCatch: false)', () => {
      // A line that would be 'intentar' in a mapping that supports it must fall
      // through unrecognized here instead of matching nothing usable.
      const blocks = parseCodeToBlocks('intentar { romper; }', cEs);
      expect(blocks[0].type).toBe('raw');
    });
  });

  describe('C++-ES (stream-operator print, no parens)', () => {
    it('parses a cout-style print statement', () => {
      const blocks = parseCodeToBlocks('cout << "hola" << endl;', cppEs);
      expect(blocks[0].type).toBe('imprimir');
      expect(blocks[0].params).toBe('"hola"');
    });

    it('parses a cerr-style error print statement without matching the plain print pattern', () => {
      const blocks = parseCodeToBlocks('cerr << "error" << endl;', cppEs);
      expect(blocks[0].type).toBe('imprimir_error');
      expect(blocks[0].params).toBe('"error"');
    });
  });

  describe('Python-ES (indent style, range for-loop, paren-less main, null varDecl)', () => {
    it('recognizes the paren-less "si __name__ == ..." main header', () => {
      // Previously unrecognized entirely: the old hardcoded KW_MAIN required a
      // trailing '(', which this header never has.
      const code = 'si __name__ == "__main__":\n    sistema_imprimir("hola")';
      const blocks = parseCodeToBlocks(code, pythonEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });

    it('parses an if without parens around the condition', () => {
      // Previously unrecognized: the old hardcoded KW_IF required an opening '(' right
      // after the keyword, which idiomatic parenthesis-free Python never has.
      const code = 'si edad >= 18:\n    retornar verdadero';
      const blocks = parseCodeToBlocks(code, pythonEs);
      expect(blocks[0].type).toBe('si');
      expect(blocks[0].params).toBe('edad >= 18');
      expect(blocks[0].children[0].type).toBe('retornar');
    });

    it('parses if/else at matching indent', () => {
      const code = 'si x > 0:\n    retornar 1\nsino:\n    retornar 0';
      const blocks = parseCodeToBlocks(code, pythonEs);
      expect(blocks[0].type).toBe('si');
      expect(blocks[0].children[0].params).toBe('1');
      expect(blocks[0].elseChildren[0].params).toBe('0');
    });

    it('captures the full "VAR en rango(...)" header instead of only the range() args', () => {
      // Previously buggy even for the original Spanish-only parser: extractParens()
      // grabbed only the text between rango(...)'s own parens ("0, 10"), silently
      // dropping the loop variable and "en rango" wording entirely.
      const code = 'para i en rango(0, 10):\n    romper';
      const blocks = parseCodeToBlocks(code, pythonEs);
      expect(blocks[0].type).toBe('para');
      expect(blocks[0].params).toBe('i en rango(0, 10)');
    });

    it('distinguishes print from printError by trying the more specific template first', () => {
      const withStderr = parseCodeToBlocks('print("boom", file=sys.stderr)', pythonEs);
      expect(withStderr[0].type).toBe('imprimir_error');
      expect(withStderr[0].params).toBe('"boom"');

      const plain = parseCodeToBlocks('print("hola")', pythonEs);
      expect(plain[0].type).toBe('imprimir');
      expect(plain[0].params).toBe('"hola"');
    });

    it('parses a "funcion nombre(...):" method header', () => {
      const code = 'funcion saludar(nombre):\n    retornar nombre';
      const blocks = parseCodeToBlocks(code, pythonEs);
      expect(blocks[0].type).toBe('metodo');
      expect(blocks[0].params).toBe('funcion saludar(nombre)');
    });

    it('never treats a plain assignment as a variable-declaration block (varDecl: null)', () => {
      const blocks = parseCodeToBlocks('x = 5', pythonEs);
      expect(blocks[0].type).toBe('raw');
    });

    it('parses try/except', () => {
      const code = 'intentar:\n    romper\nexcepto ValorError como e:\n    continuar';
      const blocks = parseCodeToBlocks(code, pythonEs);
      expect(blocks[0].type).toBe('intentar');
      expect(blocks[0].params).toBe('ValorError como e');
      expect(blocks[0].elseChildren[0].type).toBe('continuar');
    });
  });

  describe('Go-ES (go-style for, shared if/while keyword, untyped varDecl)', () => {
    it('parses "funcion principal()" as the dedicated main block', () => {
      const code = `funcion principal() {
  fmt.Println("Hola")
}`;
      const blocks = parseCodeToBlocks(code, goEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
    });

    it('parses a go-style three-clause for header with no wrapping parens', () => {
      const code = 'para i := 0; i < 10; i++ {\n  romper\n}';
      const blocks = parseCodeToBlocks(code, goEs);
      expect(blocks[0].type).toBe('para');
      expect(blocks[0].params).toBe('i := 0; i < 10; i++');
    });

    it('does not double-parse a for-loop header as a while block too (forKeyword === whileKeyword)', () => {
      const code = 'para i := 0; i < 10; i++ {\n  romper\n}';
      const blocks = parseCodeToBlocks(code, goEs);
      expect(blocks).toHaveLength(1);
    });

    it('parses a condition-only "para" as a while-equivalent (mientras) block, not a for', () => {
      // Real Go block-generated text: hc_mientras is routed through the SHARED
      // condHeader()/wrapBody() machinery genericGenerator.ts uses for every
      // braces-style language, which always parenthesizes the condition regardless of
      // forStyle — "para (x < 10) {", not "para x < 10 {". Since Go's whileKeyword and
      // forKeyword are literally the same word ("para"), the reverse parser must tell
      // this shape apart from a genuine three-clause for-loop header purely by shape
      // (no ';' clauses here) rather than by keyword text, which is identical either way.
      const code = 'para (x < 10) {\n  romper\n}';
      const blocks = parseCodeToBlocks(code, goEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('mientras');
      expect(blocks[0].params).toBe('x < 10');
    });

    it('falls back to the generic "var" block for an untyped declaration (no {TYPE} token)', () => {
      const blocks = parseCodeToBlocks('var nombre = 0', goEs);
      expect(blocks[0].type).toBe('var');
      expect(blocks[0].params).toBe('nombre = 0');
    });

    it('has no throw vocabulary at all (throwTemplate: null)', () => {
      const blocks = parseCodeToBlocks('lanzar algo', goEs);
      expect(blocks[0].type).toBe('raw');
    });
  });

  describe('Cpp-Italian (non-Spanish braces mapping)', () => {
    it('round-trips a class containing main, if/else, a loop, and a print', () => {
      const code = `classe Ciao {
  intero principale() {
    se (vero) {
      cout << "ciao" << endl;
    } altrimenti {
      cout << "no" << endl;
    }
    per (intero i = 0; i < 3; i++) {
      interrompi;
    }
  }
};`;
      const blocks = parseCodeToBlocks(code, cppItalian);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('clase');
      const main = blocks[0].children[0];
      expect(main.type).toBe('main');
      const [ifBlock, forBlock] = main.children;
      expect(ifBlock.type).toBe('si');
      expect(ifBlock.params).toBe('vero');
      expect(ifBlock.children[0].type).toBe('imprimir');
      expect(ifBlock.children[0].params).toBe('"ciao"');
      expect(ifBlock.elseChildren[0].params).toBe('"no"');
      expect(forBlock.type).toBe('para');
      expect(forBlock.params).toBe('intero i = 0; i < 3; i++');
      expect(forBlock.children[0].type).toBe('romper');
    });
  });

  describe('Java-Japanese (non-Latin-script braces mapping)', () => {
    it('round-trips a class containing a Unicode main header, if/else, and a print', () => {
      const code = `クラス こんにちは {
  パブリック スタティック から メイン(ストリング[] ひきすう) {
    もし (ほんとう) {
      システム.いんさつ("こんにちは");
    } ほか {
      システム.いんさつ("いいえ");
    }
  }
}`;
      const blocks = parseCodeToBlocks(code, javaJapanese);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('clase');
      expect(blocks[0].params).toBe('こんにちは');
      const main = blocks[0].children[0];
      expect(main.type).toBe('main');
      const ifBlock = main.children[0];
      expect(ifBlock.type).toBe('si');
      expect(ifBlock.params).toBe('ほんとう');
      expect(ifBlock.children[0].type).toBe('imprimir');
      expect(ifBlock.children[0].params).toBe('"こんにちは"');
      expect(ifBlock.elseChildren[0].params).toBe('"いいえ"');
    });

    it('does not let a keyword falsely match inside a longer word sharing its prefix', () => {
      // もし ("if") must not match inside もしもし ("hello", literally "if-if") — the
      // exact class of bug \b (ASCII-only) can never catch for non-Latin scripts.
      const blocks = parseCodeToBlocks('システム.いんさつ("もしもし");', javaJapanese);
      expect(blocks[0].type).toBe('imprimir');
    });

    it('parses a variable declaration using the internal block-type tag as its keyword', () => {
      // No typeOverrides defined for this mapping, so the literal word block-generated
      // code actually contains here is the internal Spanish block-type tag "entero"
      // itself (see genericGenerator.ts's hc_${blockType} handler: `typeOverrides?.[bt]
      // ?? bt`) — not a Japanese word, since no Japanese vocabulary was registered for
      // this specific block type.
      const blocks = parseCodeToBlocks('entero カウント = 0;', javaJapanese);
      expect(blocks[0].type).toBe('entero');
      expect(blocks[0].params).toBe('カウント = 0');
    });
  });

  describe('C-French (typeOverrides collision, no try/catch)', () => {
    it('round-trips a while loop with a printf call', () => {
      // 'entero' has no typeOverride in this mapping (only cadena/booleano/var do —
      // see c-french's typeOverrides above), so per genericGenerator.ts's own fallback
      // (`typeOverrides?.[blockType] ?? blockType`) real block-generated code for an
      // hc_entero declaration literally contains the word "entero" itself here, not a
      // French word — this is what the forward generator actually emits today (a
      // separate, pre-existing gap in genericGenerator.ts, not something this reverse
      // parser can or should paper over — it must round-trip what's really produced).
      const code = `entier principal() {
  entero x = 0;
  tantque (x < 3) {
    printf("bonjour");
    x = x + 1;
  }
}`;
      const blocks = parseCodeToBlocks(code, cFrench);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
      const [decl, whileBlock] = blocks[0].children;
      expect(decl.type).toBe('entero');
      expect(decl.params).toBe('x = 0');
      expect(whileBlock.type).toBe('mientras');
      expect(whileBlock.params).toBe('x < 3');
      expect(whileBlock.children[0].type).toBe('imprimir');
      expect(whileBlock.children[0].params).toBe('"bonjour"');
    });

    it('resolves the typeOverrides collision by picking the block type that requested it first', () => {
      // Unlike C-ES (where 'booleano' and 'var' both collide on the WORD "entero", the
      // canonical/non-overridden word for a DIFFERENT block type — so that one wins),
      // here 'booleano' and 'var' collide on "entier", a word neither block type owns
      // canonically. Nothing else claims "entier", so the map (built by iterating
      // VAR_BLOCK_TYPES in a fixed order) resolves it to whichever of the two was
      // inserted first — 'booleano'. This is a real, if minor, systemic ambiguity
      // (recovering which of two DIFFERENT block types produced an identical override
      // word is fundamentally underdetermined from text alone), not a parser bug.
      const blocks = parseCodeToBlocks('entier compte = 1;', cFrench);
      expect(blocks[0].type).toBe('booleano');
    });

    it('has no switch/case ambiguity with the "selon" keyword', () => {
      const code = 'selon (x) {\ncas 1:\ninterrompre;\n}';
      const blocks = parseCodeToBlocks(code, cFrench);
      expect(blocks[0].type).toBe('cambiar');
      expect(blocks[0].params).toBe('x');
    });
  });

  describe('Python-Portuguese (non-Spanish indent mapping)', () => {
    it('round-trips the paren-less main header, an if without parens, and a range for-loop', () => {
      const code = [
        'se __name__ == "__main__":',
        '    para i em intervalo(0, 3):',
        '        se i > 0:',
        '            print(i)',
      ].join('\n');
      const blocks = parseCodeToBlocks(code, pythonPortuguese);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
      const forBlock = blocks[0].children[0];
      expect(forBlock.type).toBe('para');
      expect(forBlock.params).toBe('i em intervalo(0, 3)');
      const ifBlock = forBlock.children[0];
      expect(ifBlock.type).toBe('si');
      expect(ifBlock.params).toBe('i > 0');
      expect(ifBlock.children[0].type).toBe('imprimir');
    });
  });

  // Regressions found by an independent adversarial review of the rewrite above (4
  // reviewers stress-testing braces/indent/template-matching/Go edge cases, each
  // finding verified against the real code and real language mappings before being
  // trusted) — one test per confirmed bug, each locking in the actual fix.
  describe('Adversarial-review regressions', () => {
    it('does not lose a block body when a "}" appears inside a print argument string', () => {
      // extractBraceBlock's brace-depth counter used to count every '{'/'}' character
      // literally, including ones inside a string literal — so the '}' in "a } b" was
      // mistaken for main()'s real closing brace, and the whole imprimir statement
      // (and the block's structure past that point) silently vanished.
      const code = `publico estatico vacio principal(cadena[] argumentos) {
  sistema.imprimir("a } b");
}`;
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
      expect(blocks[0].children).toHaveLength(1);
      expect(blocks[0].children[0].type).toBe('imprimir');
      expect(blocks[0].children[0].params).toBe('"a } b"');
    });

    it('recognizes a modifier-less, return-type-less constructor as a method, nested correctly under its class', () => {
      const code = `clase Persona {
    Persona(cadena nombre) {
        sistema.imprimir(nombre);
    }
}`;
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('clase');
      expect(blocks[0].children).toHaveLength(1);
      const ctor = blocks[0].children[0];
      expect(ctor.type).toBe('metodo');
      expect(ctor.params).toBe('Persona(cadena nombre)');
      expect(ctor.children).toHaveLength(1);
      expect(ctor.children[0].type).toBe('imprimir');
    });

    it('does not reject a Python if-header containing a set/dict literal with braces', () => {
      // isIndentBlockOpener used to also require the line contain no '{' at all — a
      // check that was redundant (style is already fully decided by vocab.braces
      // before this is ever reached) and actively wrong for real Python source using a
      // set/dict literal or f-string in a condition.
      const code = [
        'si __name__ == "__main__":',
        '    si accion en {"crear", "editar", "borrar"}:',
        '        print(accion)',
      ].join('\n');
      const blocks = parseCodeToBlocks(code, pythonEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('main');
      const ifBlock = blocks[0].children[0];
      expect(ifBlock.type).toBe('si');
      expect(ifBlock.params).toBe('accion en {"crear", "editar", "borrar"}');
      expect(ifBlock.children).toHaveLength(1);
      expect(ifBlock.children[0].type).toBe('imprimir');
    });

    it('does not swallow the next line\'s statement into throwTemplate\'s {EXC} capture', () => {
      // A semicolon nested inside the EXC value's own string/call-args ("a;b") must not
      // be mistaken for the statement's real terminator either — extractStatementTail
      // has to track paren/string nesting, not just find *a* semicolon.
      const code = 'lanzar nuevo Foo("a;b");\notra_cosa();';
      const blocks = parseCodeToBlocks(code, javaEs);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('lanzar');
      expect(blocks[0].params).toBe('Foo("a;b")');
      expect(blocks[1].type).toBe('raw');
      expect(blocks[1].params).toBe('otra_cosa();');
    });

    it('does not retain an accidental double trailing semicolon inside throwTemplate\'s {EXC} capture', () => {
      const blocks = parseCodeToBlocks('lanzar nuevo RuntimeException("msg");;', javaEs);
      expect(blocks[0].type).toBe('lanzar');
      expect(blocks[0].params).toBe('RuntimeException("msg")');
    });

    it('does not misclassify a Python if-header with extra trailing condition text as the main block', () => {
      // buildMainHeaderRegex's paren-less branch used to have no end anchor, so a line
      // that merely STARTED with the exact main-check text but continued with more
      // condition clauses before the ':' still matched — silently discarding everything
      // after "__main__" and misfiling the line as the parameterless main() block.
      const code = 'si __name__ == "__main__" and verbose:\n    retornar 1';
      const blocks = parseCodeToBlocks(code, pythonEs);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('si');
      expect(blocks[0].params).toBe('__name__ == "__main__" and verbose');
      expect(blocks[0].children[0].type).toBe('retornar');
    });

    it('does not leave a stray "{}" in a for-loop\'s params when its (empty) body sits on the same line', () => {
      const blocks = parseCodeToBlocks('para i := 0; i < 10; i++ {}', goEs);
      expect(blocks[0].type).toBe('para');
      expect(blocks[0].params).toBe('i := 0; i < 10; i++');
      expect(blocks[0].children).toHaveLength(0);
    });
  });
});
