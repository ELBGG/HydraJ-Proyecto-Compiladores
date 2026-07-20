import type { Block, BlockType } from './blockModel.js';
import { makeBlock } from './blockModel.js';
import type { IHumanLanguageMapping, IBlockCodeTemplate, VarBlockType } from '../../../languages/tokens/types.js';

// ── Mapping-driven vocabulary ────────────────────────────────────────────────
//
// Every regex below is built from the SAME mapping.blockTemplate a given prog+human
// language pair's Blockly generator (genericGenerator.ts) uses to go blocks → code —
// see that file's header comment for why that guarantees the vocabulary here actually
// matches what real block-generated (or carefully hand-typed) source looks like. This
// used to be a fixed Spanish+English keyword table (KW_IF, KW_WHILE, ...) that only
// worked for the two languages it hardcoded; any other human language's Blocks mode
// (Italian, Portuguese, French, Japanese, ...) silently failed to recognize anything.

const VAR_BLOCK_TYPES: VarBlockType[] = ['entero', 'cadena', 'booleano', 'doble', 'flotante', 'largo', 'caracter', 'corto', 'var'];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Net brace delta for one physical line, treating characters inside a single-line
 *  string/char literal (single- or double-quoted, backslash-escaped) as inert — so a
 *  '{' or '}' inside a print argument's own text (e.g. `imprimir("a } b")`) is never
 *  mistaken for a real block delimiter. Multi-line (triple-quoted) strings aren't
 *  tracked — this is a line-based structural recognizer, not a full lexer, and that
 *  shape is rare enough not to special-case. */
function braceDelta(line: string): number {
  let delta = 0;
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') { i++; continue; } // skip the escaped character
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') delta++;
    else if (ch === '}') delta--;
  }
  return delta;
}

/** Extracts a statement's expression text starting right after its leading keyword,
 *  stopping at the first top-level ';' (outside any paren/bracket/brace nesting and any
 *  string literal) or the end of the string if there is none — used for a value with no
 *  fixed literal text after it in its template (e.g. throwTemplate's "{EXC}" sitting at
 *  the very end), where a single regex can't reliably tell "the value ends here" from
 *  "there's more value to capture". Without this, a semicolon nested inside a string
 *  ("a;b") or inside the value's own call arguments would end the capture too early, OR
 *  (with a naive greedy/lazy regex) a genuinely separate following statement on the same
 *  physical line would get silently absorbed into the value instead of being left for
 *  the next parse step. */
function extractStatementTail(text: string): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; continue; }
    if (ch === ';' && depth === 0) return text.slice(0, i).trim();
  }
  return text.trim();
}

/** True at the position right after `keyword` in `t`, matched at a real lexical word
 *  boundary — uses Unicode \p{L}/\p{N} property classes rather than \w, so it works for
 *  keywords in any script (French accents, Japanese kana/kanji, ...), not just ASCII.
 *  Mirrors the fix TranspilerEngine needed for the same underlying reason (see
 *  TranspilerEngine.ts's keyword-boundary regex) — plain \b silently never matches
 *  around a non-ASCII character. */
function startsWithKeyword(t: string, keyword: string): boolean {
  return new RegExp(`^${escapeRegExp(keyword)}(?![\\p{L}\\p{N}_])`, 'u').test(t);
}

interface ParserVocab {
  template: IBlockCodeTemplate;
  braces: boolean;
  /** Strips zero or more leading modifier words (publico, estatico, ...) — this
   *  mapping's own `modifiers` vocabulary, never a hardcoded Spanish/English list. */
  stripModifiers: (t: string) => string;
  /** True if `t` starts with at least one modifier word. */
  hasLeadingModifier: (t: string) => boolean;
  classPrefix: string | null;
  mainHeaderRe: RegExp | null;
  /** Non-empty literal keyword a method header must start with (Python's "funcion",
   *  Go's "funcion") — null when the template's method field is bare "{SIGNATURE}"
   *  (Java/C/C++), where a method header is only recognizable by its shape. */
  methodPrefix: string | null;
  varDeclParts: { prefix: string; sep: string; hasType: boolean } | null;
  /** keyword actually appearing in source → the BlockType it means. Resolves
   *  typeOverrides collisions (e.g. C maps both 'booleano' and 'var' to the literal
   *  word "entero") by preferring the block type whose own name is the keyword. */
  typeKeywordToBlockType: Map<string, VarBlockType>;
  /** Every control-flow keyword this mapping defines (if/else/while/for/do/switch/
   *  try/catch) — used solely to stop isMethodDef's bare-constructor shape check from
   *  mistaking a control-flow header for a method definition (both look like "word
   *  (...) {" from a pure shape perspective). */
  controlFlowWords: Set<string>;
}

function buildMainHeaderRegex(mainTemplate: string, braces: boolean): RegExp {
  const parenIdx = mainTemplate.indexOf('(');
  if (parenIdx === -1) {
    // No parens at all (Python's main is an `if __name__ == "__main__"` header, not a
    // function) — match the whole template text verbatim, whitespace-normalized, and
    // anchored so only the block-opener token (immediately, modulo whitespace) may
    // follow it. Without this anchor, a hand-typed line that merely STARTS with the
    // same text but continues with extra condition clauses before the real opener
    // (e.g. `si __name__ == "__main__" and verbose:`) would still match — silently
    // misclassifying it as the parameterless main block and discarding " and verbose".
    const parts = mainTemplate.trim().split(/\s+/).map(escapeRegExp);
    const opener = braces ? '\\{' : ':';
    return new RegExp(`^${parts.join('\\s+')}\\s*${opener}`, 'u');
  }
  // Only require the text up to the opening paren — a hand-typed file's exact parameter
  // list/name (e.g. a different args variable name) shouldn't stop recognition, the same
  // leniency the original hardcoded parser had for "public static void main(".
  const prefix = mainTemplate.slice(0, parenIdx).trim();
  const parts = prefix.split(/\s+/).map(escapeRegExp);
  return new RegExp(`^${parts.join('\\s+')}\\s*\\(`, 'u');
}

function buildVarDeclParts(varDecl: string): { prefix: string; sep: string; hasType: boolean } {
  if (varDecl.includes('{TYPE}')) {
    const [prefix, rest] = varDecl.split('{TYPE}');
    const sep = (rest ?? '').split('{VAR}')[0] ?? '';
    return { prefix, sep, hasType: true };
  }
  // No {TYPE} token (Go's "var {VAR}") — the language infers the type, so which
  // hc_* block this came from can't be recovered from text alone.
  return { prefix: varDecl.split('{VAR}')[0] ?? '', sep: '', hasType: false };
}

function buildControlFlowWords(template: IBlockCodeTemplate): Set<string> {
  const words = [
    template.ifKeyword, template.elseKeyword, template.whileKeyword, template.forKeyword,
    template.doKeyword, template.switchKeyword, template.tryKeyword, template.catchKeyword,
  ].filter((w): w is string => !!w);
  return new Set(words);
}

function buildTypeKeywordMap(template: IBlockCodeTemplate): Map<string, VarBlockType> {
  const map = new Map<string, VarBlockType>();
  for (const bt of VAR_BLOCK_TYPES) {
    if (!template.typeOverrides?.[bt]) map.set(bt, bt);
  }
  for (const bt of VAR_BLOCK_TYPES) {
    const override = template.typeOverrides?.[bt];
    if (override && !map.has(override)) map.set(override, bt);
  }
  return map;
}

function buildVocab(mapping: IHumanLanguageMapping): ParserVocab | null {
  const template = mapping.blockTemplate;
  if (!template) return null;

  const modifierWords = Object.keys(mapping.modifiers);
  const modifierAlt = modifierWords.map(escapeRegExp).join('|');
  const stripRe = modifierWords.length
    ? new RegExp(`^(?:(?:${modifierAlt})(?![\\p{L}\\p{N}_])\\s*)*`, 'u')
    : null;
  const requireRe = modifierWords.length
    ? new RegExp(`^(?:(?:${modifierAlt})(?![\\p{L}\\p{N}_])\\s*)+`, 'u')
    : null;

  const braces = template.style === 'braces';
  const classPrefix = template.class ? (template.class.split('{NAME}')[0].trim() || null) : null;
  const mainHeaderRe = template.main ? buildMainHeaderRegex(template.main, braces) : null;
  const methodPrefix = template.method.split('{SIGNATURE}')[0].trim() || null;
  const varDeclParts = template.varDecl ? buildVarDeclParts(template.varDecl) : null;

  return {
    template,
    braces,
    stripModifiers: (t) => (stripRe ? t.replace(stripRe, '') : t),
    hasLeadingModifier: (t) => (requireRe ? requireRe.test(t) : false),
    classPrefix,
    mainHeaderRe,
    methodPrefix,
    varDeclParts,
    typeKeywordToBlockType: buildTypeKeywordMap(template),
    controlFlowWords: buildControlFlowWords(template),
  };
}

// ── Structural helpers (language-agnostic) ──────────────────────────────────

/** Detects an indent-style block opener: a line ending in ':' — the Python-family
 *  shape. Named generically (not "isPythonIndent") since nothing about the check
 *  itself is Python-specific; it applies to any mapping whose blockTemplate declares
 *  style:'indent'. Deliberately does NOT also require the line to contain no '{' —
 *  opensBlock() already branches on vocab.braces (from template.style) before this is
 *  ever reached, so that extra check was redundant for its original purpose and only
 *  served to wrongly reject legitimate indent-style headers containing a dict/set
 *  literal or f-string with braces (e.g. `si accion en {"crear", "editar"}:`). */
function isIndentBlockOpener(lines: string[], startIdx: number): boolean {
  const t = lines[startIdx]?.trim() ?? '';
  return /:\s*$/.test(t);
}

function extractIndentBlock(lines: string[], startIdx: number, baseIndent: number): { inner: string[]; consumed: number } {
  const inner: string[] = [];
  let consumed = 1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || /^\s*#/.test(line)) { consumed++; continue; }
    const indent = line.search(/\S/);
    if (indent <= baseIndent) break;
    inner.push(line);
    consumed++;
  }
  return { inner, consumed };
}

function countIndent(line: string): number {
  return line.search(/\S/);
}

function extractBraceBlock(lines: string[], startIdx: number): { inner: string[]; consumed: number } {
  let depth = 0;
  const all: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    all.push(line);
    depth += braceDelta(line);
    if (all.length === 1 && depth === 0) break;
    if (depth === 0 && all.length > 1) break;
  }

  const inner = all.slice(1, all.length - 1);
  return { inner, consumed: all.length };
}

function extractParens(line: string): string {
  const m = line.match(/\((.+?)(?:\)\s*\{|\)\s*:\s*$|\)\s*$)/s);
  return m ? m[1].trim() : '';
}

function stripBlockOpener(t: string, vocab: ParserVocab): string {
  // The optional trailing '}' handles a header whose (empty) body sits on the same
  // physical line as the header itself (e.g. a Go for-loop written as "... {}") —
  // without it, only a bare trailing '{' with nothing after it would match, leaving a
  // stray "{}" baked into the extracted header text.
  return vocab.braces ? t.replace(/\{\s*\}?\s*$/, '') : t.replace(/:\s*$/, '');
}

/** Split same-line inline statement text on ';' into separate parseable "lines". */
function splitInlineStatements(text: string): string[] {
  return text
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => `${s};`);
}

// ── Template-substitution matchers ──────────────────────────────────────────
//
// print/printError/throwTemplate are full statement templates with one placeholder
// (e.g. Java's "sistema.imprimir({TEXT})", C++'s "cout << {TEXT} << endl") — not a
// simple keyword+paren shape, so they need a real template→regex compiler rather than
// a hand-picked pattern per construct.

function buildPlaceholderRegex(before: string, after: string): RegExp {
  const b = escapeRegExp(before);
  const a = escapeRegExp(after);
  // Non-greedy: with fixed literal text on both sides of the capture, a greedy (.+)
  // would only give back characters `after` actually forces it to — but since `after`
  // is guaranteed non-empty here (see matchPlaceholderTemplate's caller), backtracking
  // still finds the correct (last) valid split point even when the captured value
  // itself contains text matching `after` earlier on (e.g. a print argument containing
  // the literal word "endl" when `after` is " << endl") — this only holds because
  // `after` is a real anchor to backtrack against, unlike the empty-`after` case.
  return new RegExp(`^${b}(.+?)${a}\\s*;?\\s*$`, 'su');
}

/** Matches `t` against a "before{PLACEHOLDER}after" template and returns the captured
 *  placeholder value, or null if it doesn't match.
 *
 *  When `after` is non-empty, a regex search anchors correctly even if the captured
 *  value itself contains text that happens to look like `after`.
 *
 *  When `after` is empty (the placeholder sits at the very end of the template, e.g.
 *  throwTemplate's "lanzar nuevo {EXC}"), there is no literal text following it to
 *  anchor against — a single regex can't tell "the value ends here" from "there's more
 *  value to capture" (a plain greedy OR lazy quantifier here always ends up expanding
 *  to the last semicolon in the line, since the only thing after the capture is an
 *  entirely optional `;`). A top-level-statement-boundary scan is used instead (see
 *  extractStatementTail), which correctly stops at the first REAL end of the value —
 *  respecting nested parens/brackets and string literals — rather than absorbing a
 *  trailing accidental double-semicolon or an entirely separate following statement. */
function matchPlaceholderTemplate(t: string, template: string, placeholder: string): string | null {
  const parts = template.split(placeholder);
  if (parts.length !== 2) return null; // malformed template — no reliable match possible
  const [before, after] = parts;

  if (after === '') {
    if (!t.startsWith(before)) return null;
    return extractStatementTail(t.slice(before.length));
  }

  const m = t.match(buildPlaceholderRegex(before, after));
  return m ? m[1].trim() : null;
}

// ── Variable declaration ─────────────────────────────────────────────────────

function detectVarDecl(t: string, vocab: ParserVocab): { blockType: VarBlockType; params: string } | null {
  const { template, varDeclParts, typeKeywordToBlockType } = vocab;
  if (!template.varDecl || !varDeclParts) return null;
  // Never mistake a call or block-opening line for a declaration.
  if (t.includes('(') || t.includes('{')) return null;

  if (varDeclParts.hasType) {
    for (const [keyword, blockType] of typeKeywordToBlockType) {
      const re = new RegExp(
        `^${escapeRegExp(varDeclParts.prefix)}${escapeRegExp(keyword)}(?![\\p{L}\\p{N}_])${escapeRegExp(varDeclParts.sep)}`,
        'u',
      );
      const m = t.match(re);
      if (m) {
        const params = t.slice(m[0].length).replace(/;\s*$/, '').trim();
        return { blockType, params };
      }
    }
    return null;
  }

  // No {TYPE} token (e.g. Go's "var {VAR}") — the language infers the type, so the
  // reverse mapping is inherently lossy here; 'var' (an untyped/inferred declaration)
  // is the honest generic match for whatever hc_* block this came from.
  const prefix = varDeclParts.prefix.trim();
  if (!prefix || !startsWithKeyword(t, prefix)) return null;
  const params = t.replace(new RegExp(`^${escapeRegExp(prefix)}\\s*`, 'u'), '').replace(/;\s*$/, '').trim();
  return { blockType: 'var', params };
}

// ── Parse code string into a Block tree ───────────────────────────────────────

// Nesting deeper than this is treated as flat 'raw' content rather than recursed
// into, so pathological/machine-generated input can't blow the real call stack.
const MAX_NESTING_DEPTH = 200;

export function parseCodeToBlocks(code: string, mapping: IHumanLanguageMapping): Block[] {
  const vocab = buildVocab(mapping);
  if (!vocab) {
    // No blockTemplate — callers (editorPart.ts's setBlocksMode) are expected to have
    // already checked isBlocksModeSupported() and refused to enter Blocks mode at all,
    // so this is unreachable in practice; preserved as a safe fallback rather than a
    // thrown error, matching this function's overall "never lose the user's code" ethos.
    return code.trim() ? [makeBlock('stack', 'raw', 'raw', code, '#888888')] : [];
  }
  const lines = code.split('\n');
  return parseLines(lines, vocab, 0);
}

function parseLines(lines: string[], vocab: ParserVocab, depth: number): Block[] {
  const blocks: Block[] = [];

  if (depth > MAX_NESTING_DEPTH) {
    // Too deep to safely recurse further — preserve everything from here on
    // verbatim as 'raw' blocks instead of risking a stack overflow.
    for (const raw of lines) {
      const t = raw.trim();
      if (!t || t.startsWith(vocab.template.lineComment) || t === '}' || t === '};') continue;
      blocks.push(makeBlock('stack', 'raw', 'raw', t, '#888888'));
    }
    return blocks;
  }

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    if (!t || t.startsWith(vocab.template.lineComment) || t === '}' || t === '};') { i++; continue; }

    const result = parseOneLine(lines, i, vocab, depth);
    if (result) {
      blocks.push(result.block);
      i += result.consumed;
    } else {
      // Unrecognized statement (bare assignment, function call, break/continue,
      // case/default label, etc.) — preserve the original source verbatim
      // instead of silently deleting it.
      blocks.push(makeBlock('stack', 'raw', 'raw', t, '#888888'));
      i++;
    }
  }
  return blocks;
}

function opensBlock(t: string, lines: string[], i: number, vocab: ParserVocab): boolean {
  return vocab.braces ? t.includes('{') : isIndentBlockOpener(lines, i);
}

function extractBody(lines: string[], i: number, vocab: ParserVocab): { inner: string[]; consumed: number } {
  return vocab.braces ? extractBraceBlock(lines, i) : extractIndentBlock(lines, i, countIndent(lines[i]));
}

function parseOneLine(lines: string[], i: number, vocab: ParserVocab, depth: number): { block: Block; consumed: number } | null {
  const t = lines[i].trim();
  const { template } = vocab;

  // ── class ──────────────────────────────────────────────────────────────
  if (vocab.classPrefix) {
    const stripped = vocab.stripModifiers(t);
    if (startsWithKeyword(stripped, vocab.classPrefix) && opensBlock(t, lines, i, vocab)) {
      const nameMatch = stripped.match(new RegExp(`^${escapeRegExp(vocab.classPrefix)}\\s+([\\p{L}\\p{N}_]+)`, 'u'));
      const name = nameMatch?.[1] ?? 'NombreClase';
      const { inner, consumed } = extractBody(lines, i, vocab);
      return {
        block: makeBlock('hat', 'clase', 'clase', name, '#9966ff', parseLines(inner, vocab, depth + 1)),
        consumed,
      };
    }
  }

  // ── main() ─────────────────────────────────────────────────────────────
  if (vocab.mainHeaderRe && vocab.mainHeaderRe.test(t) && opensBlock(t, lines, i, vocab)) {
    const { inner, consumed } = extractBody(lines, i, vocab);
    return {
      block: makeBlock('hat', 'main', 'main()', '', '#ff8c1a', parseLines(inner, vocab, depth + 1)),
      consumed,
    };
  }

  // ── method / function def ────────────────────────────────────────────
  // Checked AFTER main: main's own header would otherwise also satisfy the
  // modifier-prefixed shape check below (e.g. Java's "publico estatico vacio
  // principal(...)" starts with modifiers, has '(' and '{', just like any method).
  if (isMethodDef(t, vocab) && opensBlock(t, lines, i, vocab)) {
    const { inner, consumed } = extractBody(lines, i, vocab);
    const sig = vocab.braces
      ? t.replace(/\{.*/s, '').trim()
      : t.replace(/:\s*$/, '').trim();
    return {
      block: makeBlock('hat', 'metodo', 'método', sig, '#9966ff', parseLines(inner, vocab, depth + 1)),
      consumed,
    };
  }

  // ── if ─────────────────────────────────────────────────────────────────
  if (startsWithKeyword(t, template.ifKeyword) && opensBlock(t, lines, i, vocab)) {
    const cond = extractCondition(t, template.ifKeyword, vocab);

    if (vocab.braces) {
      const compound = extractCompoundIf(lines, i, template.elseKeyword);
      if (compound) {
        return {
          block: makeBlock('c-if', 'si', compound.hasElse ? 'si / sino' : 'si', cond, '#ffab19',
            parseLines(compound.ifBody, vocab, depth + 1), compound.hasElse ? parseLines(compound.elseBody, vocab, depth + 1) : []),
          consumed: compound.consumed,
        };
      }
      const { inner, consumed } = extractBraceBlock(lines, i);
      return {
        block: makeBlock('c-if', 'si', 'si', cond, '#ffab19', parseLines(inner, vocab, depth + 1), []),
        consumed,
      };
    }

    // Indent-style
    const baseIndent = countIndent(lines[i]);
    const { inner: ifInner, consumed: ifConsumed } = extractIndentBlock(lines, i, baseIndent);
    let elseChildren: Block[] = [];
    let totalConsumed = ifConsumed;
    const nextIdx = i + ifConsumed;
    if (nextIdx < lines.length) {
      const nextTrim = lines[nextIdx].trim();
      if (startsWithKeyword(nextTrim, template.elseKeyword) && /:\s*$/.test(nextTrim)) {
        const { inner: elseInner, consumed: elseConsumed } = extractIndentBlock(lines, nextIdx, baseIndent);
        elseChildren = parseLines(elseInner, vocab, depth + 1);
        totalConsumed += elseConsumed;
      }
    }
    return {
      block: makeBlock('c-if', 'si', 'si', cond, '#ffab19', parseLines(ifInner, vocab, depth + 1), elseChildren),
      consumed: totalConsumed,
    };
  }

  // ── for ────────────────────────────────────────────────────────────────
  // looksLikeForHeader disambiguates a genuine for-loop from a while-equivalent when
  // the mapping shares one keyword between them (Go: both "para", since Go has no
  // separate while — a condition-only for loop *is* its while) — without it, this
  // branch would unconditionally claim every "para"-prefixed line by keyword text
  // alone, never letting the while-branch below run at all.
  if (startsWithKeyword(t, template.forKeyword) && opensBlock(t, lines, i, vocab) && looksLikeForHeader(t, vocab)) {
    const params = extractForParams(t, vocab);
    const { inner, consumed } = extractBody(lines, i, vocab);
    return {
      block: makeBlock('c-loop', 'para', 'para', params, '#ffab19', parseLines(inner, vocab, depth + 1)),
      consumed,
    };
  }

  // ── while ──────────────────────────────────────────────────────────────
  if (startsWithKeyword(t, template.whileKeyword) && opensBlock(t, lines, i, vocab)) {
    const cond = extractCondition(t, template.whileKeyword, vocab);
    const { inner, consumed } = extractBody(lines, i, vocab);
    return {
      block: makeBlock('c-loop', 'mientras', 'mientras', cond, '#ffab19', parseLines(inner, vocab, depth + 1)),
      consumed,
    };
  }

  // ── do-while ───────────────────────────────────────────────────────────
  if (template.supportsDoWhile && template.doKeyword && startsWithKeyword(t, template.doKeyword)) {
    const { inner, consumed } = extractBraceBlock(lines, i);
    const lastLine = lines[i + consumed - 1]?.trim() ?? '';
    const m = lastLine.match(new RegExp(`${escapeRegExp(template.whileKeyword)}\\s*\\((.+?)\\)\\s*;?\\s*$`, 'u'));
    const cond = m ? m[1].trim() : 'condición';
    return {
      block: makeBlock('c-loop', 'hacer', 'hacer / mientras', cond, '#ffab19', parseLines(inner, vocab, depth + 1)),
      consumed,
    };
  }

  // ── switch ─────────────────────────────────────────────────────────────
  if (template.switchKeyword && startsWithKeyword(t, template.switchKeyword) && t.includes('{')) {
    const params = extractCondition(t, template.switchKeyword, vocab);
    const { inner, consumed } = extractBraceBlock(lines, i);
    return {
      block: makeBlock('c-loop', 'cambiar', 'cambiar', params, '#ffab19', parseLines(inner, vocab, depth + 1)),
      consumed,
    };
  }

  // ── try/catch ──────────────────────────────────────────────────────────
  if (template.supportsTryCatch && template.tryKeyword && template.catchKeyword) {
    if (vocab.braces && startsWithKeyword(t, template.tryKeyword)) {
      const tryResult = extractTryCatch(lines, i, template.catchKeyword);
      if (tryResult) {
        return {
          block: makeBlock('c-try', 'intentar', 'intentar/capturar', tryResult.catchParam, '#ff6680',
            parseLines(tryResult.tryBody, vocab, depth + 1), parseLines(tryResult.catchBody, vocab, depth + 1)),
          consumed: tryResult.consumed,
        };
      }
    } else if (!vocab.braces && new RegExp(`^${escapeRegExp(template.tryKeyword)}\\s*:\\s*$`, 'u').test(t)) {
      const baseIndent = countIndent(lines[i]);
      const { inner: tryInner, consumed: tryConsumed } = extractIndentBlock(lines, i, baseIndent);
      let catchBody: string[] = [];
      let catchParam = 'e';
      let totalConsumed = tryConsumed;
      const nextIdx = i + tryConsumed;
      if (nextIdx < lines.length) {
        const nextTrim = lines[nextIdx].trim();
        const excMatch = nextTrim.match(new RegExp(`^${escapeRegExp(template.catchKeyword)}\\s+(.+?)\\s*:\\s*$`, 'u'));
        const bareMatch = new RegExp(`^${escapeRegExp(template.catchKeyword)}\\s*:\\s*$`, 'u').test(nextTrim);
        if (excMatch || bareMatch) {
          if (excMatch) catchParam = excMatch[1].trim();
          const { inner: cBody, consumed: cConsumed } = extractIndentBlock(lines, nextIdx, countIndent(lines[nextIdx]));
          catchBody = cBody;
          totalConsumed += cConsumed;
        }
      }
      return {
        block: makeBlock('c-try', 'intentar', 'intentar/capturar', catchParam, '#ff6680',
          parseLines(tryInner, vocab, depth + 1), parseLines(catchBody, vocab, depth + 1)),
        consumed: totalConsumed,
      };
    }
  }

  // ── print / printError ────────────────────────────────────────────────
  // printError checked first: its template can be a strict superset of print's own
  // (Python: "print({TEXT})" vs "print({TEXT}, file=sys.stderr)") — testing the wider
  // pattern first avoids print's greedy (.+) swallowing printError's extra arguments.
  const printErrorText = matchPlaceholderTemplate(t, template.printError, '{TEXT}');
  if (printErrorText !== null) {
    return { block: makeBlock('stack', 'imprimir_error', 'imprimir_error', printErrorText, '#e05252'), consumed: 1 };
  }
  const printText = matchPlaceholderTemplate(t, template.print, '{TEXT}');
  if (printText !== null) {
    return { block: makeBlock('stack', 'imprimir', 'imprimir', printText, '#59c059'), consumed: 1 };
  }

  // ── return ─────────────────────────────────────────────────────────────
  if (startsWithKeyword(t, template.returnKeyword)) {
    const val = t.replace(new RegExp(`^${escapeRegExp(template.returnKeyword)}\\s*`, 'u'), '').replace(/;$/, '').trim();
    return { block: makeBlock('stack', 'retornar', 'retornar', val, '#9966ff'), consumed: 1 };
  }

  // ── throw ──────────────────────────────────────────────────────────────
  if (template.throwTemplate) {
    const excText = matchPlaceholderTemplate(t, template.throwTemplate, '{EXC}');
    if (excText !== null) return { block: makeBlock('stack', 'lanzar', 'lanzar', excText, '#ff6680'), consumed: 1 };
  }

  // ── break ──────────────────────────────────────────────────────────────
  if (new RegExp(`^${escapeRegExp(template.breakKeyword)}\\s*;?\\s*$`, 'u').test(t)) {
    return { block: makeBlock('stack', 'romper', 'romper', '', '#ffab19'), consumed: 1 };
  }

  // ── continue ───────────────────────────────────────────────────────────
  if (new RegExp(`^${escapeRegExp(template.continueKeyword)}\\s*;?\\s*$`, 'u').test(t)) {
    return { block: makeBlock('stack', 'continuar', 'continuar', '', '#ffab19'), consumed: 1 };
  }

  // ── variable declaration ─────────────────────────────────────────────
  const varDecl = detectVarDecl(t, vocab);
  if (varDecl) {
    return { block: makeBlock('stack', varDecl.blockType as BlockType, varDecl.blockType, varDecl.params, '#4c97ff'), consumed: 1 };
  }

  return null;
}

// ── method-def detection ──────────────────────────────────────────────────

function isMethodDef(t: string, vocab: ParserVocab): boolean {
  if (vocab.methodPrefix) {
    // e.g. Python/Go's "funcion {SIGNATURE}" — the literal keyword makes this
    // unambiguous, no shape heuristics needed.
    if (startsWithKeyword(t, vocab.methodPrefix) && t.includes('(') && (t.includes('{') || /:\s*$/.test(t))) return true;
  }

  // "{SIGNATURE}" only (Java/C/C++-style: the free-text signature IS the whole header,
  // no dedicated keyword) — recognizable only by shape.
  if (t.includes('(') && (t.includes('{') || /:\s*$/.test(t))) {
    if (vocab.hasLeadingModifier(t)) return true; // "publico entero suma(...)"
    // Bare "returnType name(" shape, no modifier — e.g. package-private Java methods,
    // or a plain C/C++ function. Requires two identifier-like tokens before the paren
    // so a lone call statement ("foo(x)") or control-flow line isn't misread as a def.
    if (/^[\p{L}\p{N}_]+(?:\s*[*&])?\s+[\p{L}\p{N}_]+\s*\(/u.test(t) && t.includes('{') && !t.includes(';')) return true;
    // Bare "Name(" with no return type at all (a Java/C++ constructor, which
    // conventionally carries neither a modifier nor a return type). A single identifier
    // token immediately followed by '(' — excluded when that identifier IS one of this
    // mapping's own control-flow keywords (if/while/for/do/switch/try/catch), since
    // those have the exact same "word(...) {" shape and are handled by their own
    // dedicated branches earlier in parseOneLine, not here.
    const bareMatch = t.match(/^([\p{L}\p{N}_]+)\s*\(/u);
    if (bareMatch && !vocab.controlFlowWords.has(bareMatch[1]) && t.includes('{') && !t.includes(';')) return true;
  }

  return false;
}

// ── condition / for-header extraction ───────────────────────────────────────

function extractCondition(t: string, keyword: string, vocab: ParserVocab): string {
  if (vocab.braces) return extractParens(t);
  const stripped = t.replace(new RegExp(`^${escapeRegExp(keyword)}\\s*`, 'u'), '');
  return stripBlockOpener(stripped, vocab).trim();
}

/** True if `t` actually has the shape a for-loop's forStyle implies, used only to
 *  disambiguate a shared if/while/for keyword (Go: forKeyword === whileKeyword) from a
 *  genuine while-shaped line matching the for-branch by keyword text alone. Always
 *  true when the mapping has a distinct whileKeyword (the normal case) or uses
 *  'c-style' (parenthesized, already unambiguous by shape) — only the paren-less
 *  multi-clause styles ('range'/'go-style') need the real check: a for-loop's header
 *  has multiple ';'-separated clauses, a while-equivalent's condition never does. */
function looksLikeForHeader(t: string, vocab: ParserVocab): boolean {
  const { template } = vocab;
  if (template.forKeyword !== template.whileKeyword) return true;
  if (template.forStyle === 'c-style') return true;
  const stripped = t.replace(new RegExp(`^${escapeRegExp(template.forKeyword)}\\s*`, 'u'), '');
  return stripped.includes(';');
}

function extractForParams(t: string, vocab: ParserVocab): string {
  const { template } = vocab;
  const stripped = t.replace(new RegExp(`^${escapeRegExp(template.forKeyword)}\\s*`, 'u'), '');
  if (template.forStyle === 'c-style') {
    return extractParens(t);
  }
  // 'range' / 'go-style': no wrapping parens around the whole header — the remaining
  // text up to the block-opening token IS the meaningful content (e.g. "i en rango(0,
  // 10)" or "i := 0; i < 10; i++"); capturing only what a naive paren-search would find
  // ("0, 10") would silently drop the loop variable.
  return stripBlockOpener(stripped, vocab).trim();
}

// ── if/else compound extractor (braces style) ───────────────────────────────

function extractCompoundIf(lines: string[], startIdx: number, elseKeyword: string): {
  ifBody: string[];
  elseBody: string[];
  hasElse: boolean;
  consumed: number;
} | null {
  const firstLine = lines[startIdx].trim();
  if (!firstLine.includes('{')) return null;

  let elseSplitIdx = -1;
  let depth = 0;
  const processedLines: string[] = [];
  const elseRe = new RegExp(`^\\}\\s*${escapeRegExp(elseKeyword)}\\s*\\{$`, 'u');

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const trimLine = line.trim();
    processedLines.push(line);
    depth += braceDelta(line);

    if (elseRe.test(trimLine) && depth === 1 && processedLines.length > 1) {
      elseSplitIdx = processedLines.length - 1;
    }

    // A fully single-line block (braces open & close on the first physical line) must
    // stop here without consuming any further lines — mirrors extractBraceBlock's
    // `all.length === 1 && depth === 0` special case.
    if (processedLines.length === 1 && depth === 0) break;
    if (depth === 0 && processedLines.length > 1) break;
  }

  const consumed = processedLines.length;

  if (elseSplitIdx !== -1) {
    const ifBody = processedLines.slice(1, elseSplitIdx);
    const elseBody = processedLines.slice(elseSplitIdx + 1, processedLines.length - 1);
    return { ifBody, elseBody, hasElse: true, consumed };
  }

  if (processedLines.length === 1) {
    // The entire "if (...) { ... }" lives on one physical line — pull the body out
    // from between the first '{' and the last '}' instead of slicing lines.
    const only = processedLines[0];
    const openIdx = only.indexOf('{');
    const closeIdx = only.lastIndexOf('}');
    const inline = openIdx !== -1 && closeIdx > openIdx ? only.slice(openIdx + 1, closeIdx).trim() : '';
    return { ifBody: inline ? splitInlineStatements(inline) : [], elseBody: [], hasElse: false, consumed };
  }

  const ifBody = processedLines.slice(1, processedLines.length - 1);
  return { ifBody, elseBody: [], hasElse: false, consumed };
}

// ── try/catch extractor (braces style) ──────────────────────────────────────

function extractTryCatch(lines: string[], startIdx: number, catchKeyword: string): {
  tryBody: string[];
  catchBody: string[];
  catchParam: string;
  consumed: number;
} | null {
  const collected: string[] = [];
  let depth = 0;
  let catchStart = -1;
  let catchParam = 'e';
  const catchRe = new RegExp(`^\\}\\s*${escapeRegExp(catchKeyword)}\\s*\\(`, 'u');
  const catchParamRe = new RegExp(`${escapeRegExp(catchKeyword)}\\s*\\((.+?)\\)`, 'u');

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const trimLine = line.trim();
    collected.push(line);
    depth += braceDelta(line);

    if (catchRe.test(trimLine) && depth === 1) {
      const m = trimLine.match(catchParamRe);
      if (m) catchParam = m[1].trim();
      catchStart = collected.length - 1;
    }

    // A fully single-line "try { ... }" must stop here without consuming any further
    // lines — mirrors extractBraceBlock's `all.length === 1 && depth === 0`.
    if (collected.length === 1 && depth === 0) break;
    if (depth === 0 && collected.length > 1) break;
  }

  if (!collected.length) return null;

  if (collected.length === 1 && catchStart === -1) {
    // The entire "try { ... }" lives on one physical line with no catch clause on that
    // same line — pull the body out from between the first '{' and the last '}'.
    const only = collected[0];
    const openIdx = only.indexOf('{');
    const closeIdx = only.lastIndexOf('}');
    const inline = openIdx !== -1 && closeIdx > openIdx ? only.slice(openIdx + 1, closeIdx).trim() : '';
    return { tryBody: inline ? splitInlineStatements(inline) : [], catchBody: [], catchParam, consumed: collected.length };
  }

  const tryBody = catchStart !== -1 ? collected.slice(1, catchStart) : collected.slice(1, -1);
  const catchBody = catchStart !== -1 ? collected.slice(catchStart + 1, -1) : [];

  return { tryBody, catchBody, catchParam, consumed: collected.length };
}
