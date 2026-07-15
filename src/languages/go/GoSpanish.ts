import { HumanLanguageMapping } from '../tokens/HumanLanguageMapping.js';

export const goSpanish = new HumanLanguageMapping(
  'es',
  'Spanish',
  'Español',
  'go',
  {
    version: '1',
    // Go has no public/private/static-style visibility keywords at all — exported vs.
    // unexported is decided purely by identifier capitalization. 'const' is the only
    // real modifier-shaped reserved word Go has.
    modifiers: {
      'constante': 'const',
    },
    keywords: {
      'romper': 'break',
      'caso': 'case',
      'canal': 'chan',
      'continuar': 'continue',
      'predeterminado': 'default',
      'diferir': 'defer',
      'sino': 'else',
      'continuar_caso': 'fallthrough',
      'para': 'for',
      'funcion': 'func',
      'concurrente': 'go',
      'ir_a': 'goto',
      'si': 'if',
      'importar': 'import',
      'interfaz': 'interface',
      'mapa': 'map',
      'paquete': 'package',
      'rango': 'range',
      'retornar': 'return',
      'seleccionar': 'select',
      'estructura': 'struct',
      'cambiar': 'switch',
      'tipo': 'type',
      'var': 'var',
      // Not a real reserved word — "main" is a *convention* (func name in package
      // main), same treatment Java/C already give it for their own entry points.
      'principal': 'main',
    },
    types: {
      'entero': 'int',
      'entero8': 'int8',
      'entero16': 'int16',
      'entero32': 'int32',
      'entero64': 'int64',
      'entero_sin_signo': 'uint',
      'byte': 'byte',
      'flotante': 'float32',
      'doble': 'float64',
      'complejo64': 'complex64',
      'complejo128': 'complex128',
      'cadena': 'string',
      'booleano': 'bool',
      // Go has no dedicated "char" type — rune (an int32 alias representing a Unicode
      // code point) is the closest real equivalent.
      'caracter': 'rune',
      'error': 'error',
      // No 'vacio' (void) entry on purpose — Go has no void keyword at all; a
      // no-return-value function simply omits a return type. See blockTemplate's
      // stripFromSignature below, which removes a stray "vacio" instead of mistranslating it.
    },
    literals: {
      'verdadero': 'true',
      'falso': 'false',
      'nulo': 'nil',
    },
    blockTemplate: {
      style: 'braces',
      // Just the entry-point function header — the "package main" line lives in
      // filePrefix instead (below), so the engine can slot the preamble (imports)
      // between the two, matching real Go file structure.
      main: 'funcion principal()',
      // Must physically precede any import statements — this is why it's kept
      // separate from `main` above rather than folded into one multi-line string.
      filePrefix: 'paquete principal',
      // Go has no classes and struct methods can't be nested inside the struct's
      // braces (they're declared separately with a receiver) — same fields-only
      // struct approximation C already uses for the same reason.
      class: 'estructura {NAME}',
      // Go has an explicit function keyword ("func"/"funcion"), unlike Java/C/C++
      // where the signature text alone (return type + name) is already complete —
      // so, like Python's "funcion {SIGNATURE}", it must be prefixed here.
      method: 'funcion {SIGNATURE}',
      // Strip Java-flavored visibility/void modifiers a shared free-text SIGNATURE
      // field might carry over from its default placeholder ("publico vacio nombre()").
      stripFromSignature: ['^(publico|privado|protegido|estatico)\\s+', '^vacio\\s+'],
      lineComment: '//',
      // Go has no separate while keyword — a for-loop with only a condition (no
      // init/post clauses) is its while-equivalent, so both point at the same word.
      ifKeyword: 'si', elseKeyword: 'sino', whileKeyword: 'para', forKeyword: 'para',
      supportsDoWhile: false,
      // 'go-style', not 'c-style': Go's three-clause for-clause allows no
      // surrounding parens and needs a short ":=" declaration, not a typed one —
      // see IBlockCodeTemplate.forStyle and genericGenerator.ts's parseCountingForLoop.
      forStyle: 'go-style',
      switchKeyword: 'cambiar',
      // No exceptions in Go — error values and panic/recover are a fundamentally
      // different idiom that doesn't fit a generic try/catch block shape honestly.
      supportsTryCatch: false,
      // Real fmt/os calls used directly, the same way C's printf and C++'s cout are
      // (no Spanish-word pattern registered for either).
      print: 'fmt.Println({TEXT})', printError: 'fmt.Fprintln(os.Stderr, {TEXT})',
      // "importar" (not raw "import") since — unlike C's #include — Go already has a
      // real Spanish word for this in `keywords` above; reusing it keeps the
      // block-generated source Spanish-flavored like everything else it emits.
      preamble: {
        print: ['importar "fmt"'],
        printError: ['importar "fmt"', 'importar "os"'],
      },
      // Go infers the type from the initializer, so a single "var {VAR}" (e.g.
      // "var nombre = 0") is complete and correct — there's no valid slot to put an
      // explicit {TYPE} in front of a "name = value" pair the way C-family
      // "{TYPE} {VAR}" does; every hc_* variable block collapses to the same shape.
      varDecl: 'var {VAR}',
      returnKeyword: 'retornar', throwTemplate: null,
      breakKeyword: 'romper', continueKeyword: 'continuar',
      // Go's grammar allows an explicit trailing ';' but gofmt always strips it —
      // omit it so generated code matches real Go style instead of C-family style.
      statementTerminator: '',
    },
  },
);
