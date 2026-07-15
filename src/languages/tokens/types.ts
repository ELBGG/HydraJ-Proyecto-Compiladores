export interface ILanguageTokens {
  readonly languageId: string;
  readonly languageName: string;
  readonly keywords: string[];
  readonly types: string[];
  readonly literals: string[];
  readonly modifiers: string[];
  readonly operators: string[];
  readonly delimiters: string[];
}

export interface IHumanLanguageMapping {
  readonly id: string;
  readonly name: string;
  readonly nativeName: string;
  readonly languageId: string;
  readonly version?: string;

  readonly keywords: Record<string, string>;
  readonly types: Record<string, string>;
  readonly literals: Record<string, string>;
  readonly modifiers: Record<string, string>;

  readonly patterns?: IMultiWordPattern[];

  /** Structural code-shape knowledge the Blockly visual editor needs to generate this
   *  language's flavor of code (brace vs. indent blocks, how "main" is wrapped, which
   *  control-flow constructs exist, etc.) — see LANGUAGE_MAPPINGS.md. A mapping
   *  without this can still transpile and syntax-highlight; it just won't offer Blocks
   *  mode (blocklyRenderer.ts's generatorFor() returns null rather than guessing). */
  readonly blockTemplate?: IBlockCodeTemplate;
}

export interface IMultiWordPattern {
  readonly from: RegExp;
  readonly to: string;
}

export type VarBlockType = 'entero' | 'cadena' | 'booleano' | 'doble' | 'flotante' | 'largo' | 'caracter' | 'corto' | 'var';

/** Block constructs that can trigger a required preamble line — see
 *  IBlockCodeTemplate.preamble. Deliberately just the two with a demonstrated real need
 *  across the bundled mappings (Go's fmt.Println, C's printf, C++'s cout, Python's
 *  sys.stderr) rather than a speculative entry per hc_* block type; extend this union
 *  (and genericGenerator.ts's two call sites that mark usage) if a future mapping needs
 *  one for another construct, e.g. 'throw' or 'tryCatch'. */
export type PreambleKey = 'print' | 'printError';

export interface IBlockCodeTemplate {
  /** 'braces': body wrapped in { }; blocks close with '}' (Java/C/C++-family).
   *  'indent': body is only indented; blocks open with ':' and have no closing token
   *  (Python-family). Everything below is written assuming the generic engine handles
   *  this wrapping — templates below never include braces/colons themselves. */
  style: 'braces' | 'indent';

  /** Program entry point header for the top-level `hc_main` block — just the header line
   *  (e.g. "entero principal()"); the generic engine appends the body wrapping (braces or
   *  colon+indent per `style`) uniformly, so no {BODY} placeholder belongs here. Use null
   *  if the language has no "main" concept at all — the body is then emitted flat,
   *  unwrapped (no header line at all). Do NOT fold a required package/module
   *  declaration into this string even if it conventionally sits right above the entry
   *  point (Go's `package main`) — that belongs in `filePrefix` instead, so `preamble`
   *  can be placed between the two. */
  main: string | null;

  /** A line that must be the very first thing in the generated file, before even
   *  `preamble` — for languages whose grammar requires a package/module declaration to
   *  physically precede import statements (Go: `paquete principal`, i.e. `package
   *  main`). Omit for languages with no such requirement (everything else today). */
  filePrefix?: string;

  /** True when a free-standing `main` cannot exist on its own and must be nested inside
   *  a class (Java: a method can never exist outside a class at all). Used by
   *  fileTemplates.ts's New File starter generator to decide whether to wrap the entry
   *  point in `class` — the Blockly editor doesn't need this itself, since there the
   *  user places an `hc_clase` block by hand if they want one. Requires `class` to also
   *  be non-null; false/omitted for a language where `main` is valid on its own
   *  (C/C++/Go/Python all allow a top-level entry point with no enclosing class). */
  mainRequiresClass?: boolean;

  /** Class declaration header for `hc_clase`. {NAME} placeholder only — body wrapping is
   *  automatic, same as `main`. Use null if the language has no classes — the class
   *  block's body still emits, flattened, with an explanatory comment, the same
   *  honest-approximation approach as unsupported try/catch or switch. */
  class: string | null;
  /** True if a class needs a trailing statement terminator after its closing brace
   *  (C++'s `};`) that a plain function/if/loop block does not. */
  classTrailingSemicolon?: boolean;

  /** Function/method declaration header for `hc_metodo`. {SIGNATURE} placeholder only. */
  method: string;
  /** Regexes stripped from a pasted/default SIGNATURE field before substitution, for
   *  languages whose functions don't have visibility/return-type modifiers the way
   *  Java's does (e.g. Python's `def`) — avoids emitting "funcion publico vacio foo():". */
  stripFromSignature?: string[];

  /** This language's `//`- or `#`-style single-line comment marker, used when the
   *  generic engine has to fall back to an explanatory comment (unsupported class,
   *  switch, or try/catch) instead of guessing at nonexistent syntax. */
  lineComment: string;

  ifKeyword: string;
  elseKeyword: string;
  whileKeyword: string;
  forKeyword: string;
  /** Keyword introducing a do/while loop's body (Spanish "hacer"-equivalent) — only
   *  meaningful, and only required, when `supportsDoWhile` is true. */
  doKeyword?: string;
  /** True if the language has a real do/while-style construct; if false, the generic
   *  engine emits the body once unwrapped followed by an equivalent `while (cond) { body
   *  }` (body duplicated, no extra vocabulary needed) instead of guessing at nonexistent
   *  syntax. */
  supportsDoWhile: boolean;
  /** 'c-style': `for (init; cond; incr)` used verbatim, parenthesized (Java/C/C++-family).
   *  'range': the init/cond/incr shape is converted into a range-style loop (Python) —
   *  see genericGenerator.ts's parseCountingForLoop.
   *  'go-style': same counting-loop shape as 'range', but reconstructed as an
   *  unparenthesized short-declaration three-clause loop (Go: `for i := 0; i < 10; i++`)
   *  — Go's ForClause grammar allows no surrounding parens and its init clause must be a
   *  short (":=") declaration, not a typed one, so the c-style header can't be used
   *  verbatim the way it is for Java/C/C++. */
  forStyle: 'c-style' | 'range' | 'go-style';
  /** Keyword for a native switch/match construct, or null if the language has none —
   *  the generic engine then emits the switch body flattened with an explanatory comment. */
  switchKeyword: string | null;
  /** True if the language has real exception handling; if false, `hc_intentar`'s body
   *  emits flattened (with a comment) and `hc_lanzar` is omitted (with a comment). */
  supportsTryCatch: boolean;
  tryKeyword?: string;
  catchKeyword?: string;

  /** {TEXT} placeholder for `hc_imprimir`/`hc_imprimir_error`. May use this language's
   *  own Spanish vocabulary (Java's `sistema.imprimir(TEXT)`) or real native syntax
   *  verbatim when no Spanish pattern is registered for it (C++'s `cout << TEXT << endl`). */
  print: string;
  printError: string;

  /** Import/include statements (or other required preamble lines, e.g. C++'s `using
   *  namespace std;`) to prepend when the corresponding construct is actually used at
   *  least once in the generated program — e.g. Go's fmt.Println needs `importar
   *  "fmt"`, C's printf needs `#include <stdio.h>`. The generic engine collects the
   *  deduped union of every USED construct's lines (never an unconditional "always
   *  emit this import") and prepends them once, after `filePrefix` — unconditionally
   *  emitting an import that ends up unused would itself be a compile error in a
   *  language like Go. Omit a key (or the whole field) for a construct/language that
   *  needs nothing extra (Java's System.out, Python's print()). */
  preamble?: Partial<Record<PreambleKey, string[]>>;

  /** "{TYPE} {VAR}" template for a variable declaration, or null if the language has no
   *  static variable declarations at all (Python: the VAR field like "x = 0" already IS
   *  the complete statement). */
  varDecl: string | null;
  /** Per-block-type type-keyword overrides for the `hc_entero`/`hc_cadena`/etc. blocks —
   *  lets a language substitute its own word (or omit typing) for a specific block
   *  without needing a matching `types` vocabulary entry (C has no boolean or string
   *  type, so hc_cadena/hc_booleano need something other than a straight lookup). Falls
   *  back to `types[blockType]` when a key isn't present here. */
  typeOverrides?: Partial<Record<VarBlockType, string>>;

  returnKeyword: string;
  /** "{EXC}" template for `hc_lanzar`, or null alongside supportsTryCatch:false. */
  throwTemplate: string | null;
  breakKeyword: string;
  continueKeyword: string;

  /** Terminator appended to simple (non-block) statements — var decls, print, return,
   *  throw, break, continue. Defaults to ';' when style:'braces' and '' when
   *  style:'indent' if omitted (matches Java/C/C++/Python). Set explicitly to '' for a
   *  braces-style language that omits semicolons, like Go — a trailing ';' there is
   *  harmless (Go's grammar allows it) but non-idiomatic, and this is what real Go
   *  formatters (gofmt) strip. */
  statementTerminator?: string;
}

export interface ITranspileRequest {
  code: string;
  languageId: string;
  humanLanguageId: string;
}

export interface ITranspileResult {
  success: boolean;
  output: string;
  languageId: string;
  humanLanguageId: string;
  error?: string;
}
