import type { Block, BlockType } from './blockModel.js';
import { makeBlock } from './blockModel.js';

// ── Language-neutral keyword maps ──────────────────────────────────────────

const KW_CLASS    = /^(?:(?:publico|privado|protegido|public|private|protected)\s+)?(?:clase|class)\s+/;
const KW_IF       = /^(?:si|if)\s*\(/;
const KW_WHILE    = /^(?:mientras|while)\s*\(/;
const KW_DO       = /^(?:hacer|do)\s*\{/;
const KW_FOR      = /^(?:para|for)\s*\(/;
const KW_SWITCH   = /^(?:cambiar|switch)\s*\(/;
const KW_TRY      = /^(?:intentar|try)\s*\{/;
const KW_RETURN   = /^(?:retornar|return)\b/;
const KW_THROW    = /^(?:lanzar|throw)\b/;
const KW_BREAK    = /^(?:romper|break)\s*;?\s*$/;
const KW_CONTINUE = /^(?:continuar|continue)\s*;?\s*$/;
const KW_MAIN     = /(?:publico\s+estatico\s+vacio\s+principal|public\s+static\s+void\s+main|(?:int|void)\s+main)\s*\(/;
const KW_METHOD   = /^(?:publico|privado|protegido|public|private|protected)\s+/;

// Detect Python-style (no braces, indentation-based)
function isPythonIndent(lines: string[], startIdx: number): boolean {
  const t = lines[startIdx]?.trim() ?? '';
  if (/:\s*$/.test(t) && !t.includes('{')) return true;
  return false;
}

function extractPythonBlock(lines: string[], startIdx: number, baseIndent: number): { inner: string[]; consumed: number } {
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

// ── Extract a brace-delimited block from lines ────────────────────────────

function extractBraceBlock(lines: string[], startIdx: number): { inner: string[]; consumed: number } {
  let depth = 0;
  const all: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    all.push(line);
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    if (all.length === 1 && depth === 0) break;
    if (depth === 0 && all.length > 1) break;
  }

  const inner = all.slice(1, all.length - 1);
  return { inner, consumed: all.length };
}

// ── Extract parameter string from a line ─────────────────────────────────

function extractParens(line: string): string {
  const m = line.match(/\((.+?)(?:\)\s*\{|\)\s*:\s*$|\)\s*$)/s);
  return m ? m[1].trim() : '';
}

// ── Detect if line is a function/method definition (not class, not main) ──

function isMethodDef(t: string): boolean {
  return KW_METHOD.test(t) && /\w+\s*\(/.test(t) && (t.includes('{') || /:\s*$/.test(t));
}

/** Matches a C/C++/Java bare function like `int main(`, `void foo(`, `string bar(` */
function isBareFuncDef(t: string): boolean {
  // word (maybe pointer) then word then (...
  return /^\w+(?:\s*[*&])?\s+\w+\s*\(/.test(t) && t.includes('{') && !t.includes(';');
}

function isPythonFuncDef(t: string): boolean {
  return /^def\s+\w+\s*\(/.test(t) && /:\s*$/.test(t);
}

function isPythonClassDef(t: string): boolean {
  return /^class\s+\w+/.test(t) && /:\s*$/.test(t);
}

// ── Parse code string into a Block tree ──────────────────────────────────

// Nesting deeper than this is treated as flat 'raw' content rather than recursed
// into, so pathological/machine-generated input can't blow the real call stack.
const MAX_NESTING_DEPTH = 200;

export function parseCodeToBlocks(code: string): Block[] {
  const lines = code.split('\n');
  return parseLines(lines, 0);
}

function parseLines(lines: string[], depth = 0): Block[] {
  const blocks: Block[] = [];

  if (depth > MAX_NESTING_DEPTH) {
    // Too deep to safely recurse further — preserve everything from here on
    // verbatim as 'raw' blocks instead of risking a stack overflow.
    for (const raw of lines) {
      const t = raw.trim();
      if (!t || t.startsWith('//') || t === '}' || t === '};') continue;
      blocks.push(makeBlock('stack', 'raw', 'raw', t, '#888888'));
    }
    return blocks;
  }

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    if (!t || t.startsWith('//') || t === '}' || t === '};') { i++; continue; }

    const result = parseOneLine(lines, i, depth);
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

function parseOneLine(lines: string[], i: number, depth = 0): { block: Block; consumed: number } | null {
  const t = lines[i].trim();

  // ── Class (clase / class / Python class) ───────────────────────────────
  if (KW_CLASS.test(t) && (t.includes('{') || isPythonIndent(lines, i))) {
    const nameMatch = t.match(/(?:clase|class)\s+(\w+)/);
    const name = nameMatch?.[1] ?? 'NombreClase';
    const hasBraces = t.includes('{');
    const { inner, consumed } = hasBraces
      ? extractBraceBlock(lines, i)
      : extractPythonBlock(lines, i, countIndent(lines[i]));
    return {
      block: makeBlock('hat', 'clase', 'clase', name, '#9966ff', parseLines(inner, depth + 1)),
      consumed,
    };
  }

  // ── Python class ─────────────────────────────────────────────────────
  if (isPythonClassDef(t)) {
    const nameMatch = t.match(/class\s+(\w+)/);
    const name = nameMatch?.[1] ?? 'NombreClase';
    const { inner, consumed } = extractPythonBlock(lines, i, countIndent(lines[i]));
    return {
      block: makeBlock('hat', 'clase', 'clase', name, '#9966ff', parseLines(inner, depth + 1)),
      consumed,
    };
  }

  // ── Python function def ──────────────────────────────────────────────
  if (isPythonFuncDef(t)) {
    const { inner, consumed } = extractPythonBlock(lines, i, countIndent(lines[i]));
    const sig = t.replace(/:\s*$/, '').trim();
    return {
      block: makeBlock('hat', 'metodo', 'método', sig, '#9966ff', parseLines(inner, depth + 1)),
      consumed,
    };
  }

  // ── main() ─────────────────────────────────────────────────────────────
  if (KW_MAIN.test(t) && (t.includes('{') || isPythonIndent(lines, i))) {
    const hasBraces = t.includes('{');
    const { inner, consumed } = hasBraces
      ? extractBraceBlock(lines, i)
      : extractPythonBlock(lines, i, countIndent(lines[i]));
    return {
      block: makeBlock('hat', 'main', 'main()', '', '#ff8c1a', parseLines(inner, depth + 1)),
      consumed,
    };
  }

  // ── method def ─────────────────────────────────────────────────────────
  if ((isMethodDef(t) || isBareFuncDef(t) || isPythonFuncDef(t)) && !KW_MAIN.test(t)) {
    const hasBraces = t.includes('{');
    const { inner, consumed } = hasBraces
      ? extractBraceBlock(lines, i)
      : extractPythonBlock(lines, i, countIndent(lines[i]));
    const sig = hasBraces ? t.replace(/\{.*/, '').trim() : t.replace(/:\s*$/, '').trim();
    return {
      block: makeBlock('hat', 'metodo', 'método', sig, '#9966ff', parseLines(inner, depth + 1)),
      consumed,
    };
  }

  // ── if / si (handle both braces and Python indent) ───────────────────
  if (KW_IF.test(t) && (t.includes('{') || isPythonIndent(lines, i))) {
    const params = extractParens(t);
    const hasBraces = t.includes('{');

    if (hasBraces) {
      const compound = extractSiSino(lines, i);
      if (compound) {
        return {
          block: makeBlock('c-if', 'si', compound.hasSino ? 'si / sino' : 'si', params, '#ffab19',
            parseLines(compound.ifBody, depth + 1), compound.hasSino ? parseLines(compound.elseBody, depth + 1) : []),
          consumed: compound.consumed,
        };
      }
      const { inner, consumed } = extractBraceBlock(lines, i);
      return {
        block: makeBlock('c-if', 'si', 'si', params, '#ffab19', parseLines(inner, depth + 1), []),
        consumed,
      };
    } else {
      // Python indent-based
      const baseIndent = countIndent(lines[i]);
      const { inner: ifInner, consumed: ifConsumed } = extractPythonBlock(lines, i, baseIndent);
      let elseChildren: Block[] = [];
      let totalConsumed = ifConsumed;
      // Check for elif/else at next line
      const nextIdx = i + ifConsumed;
      if (nextIdx < lines.length) {
        const nextTrim = lines[nextIdx].trim();
        if (/^(?:sino_si|elif)\s/.test(nextTrim)) {
          // Treat as else-if: parse as nested if
          const elifResult = parseOneLine(lines, nextIdx, depth + 1);
          if (elifResult) {
            elseChildren = [elifResult.block];
            totalConsumed += elifResult.consumed;
          }
        } else if (nextTrim === 'sino:' || nextTrim === 'else:') {
          const { inner: elseInner, consumed: elseConsumed } = extractPythonBlock(lines, nextIdx, baseIndent);
          elseChildren = parseLines(elseInner, depth + 1);
          totalConsumed += elseConsumed;
        }
      }
      return {
        block: makeBlock('c-if', 'si', 'si', params, '#ffab19',
          parseLines(ifInner, depth + 1), elseChildren),
        consumed: totalConsumed,
      };
    }
  }

  // ── for / para ─────────────────────────────────────────────────────────
  if (KW_FOR.test(t) && (t.includes('{') || isPythonIndent(lines, i))) {
    const params = extractParens(t);
    const hasBraces = t.includes('{');
    const { inner, consumed } = hasBraces
      ? extractBraceBlock(lines, i)
      : extractPythonBlock(lines, i, countIndent(lines[i]));
    return {
      block: makeBlock('c-loop', 'para', 'para', params, '#ffab19', parseLines(inner, depth + 1)),
      consumed,
    };
  }

  // ── while / mientras ─────────────────────────────────────────────────
  if (KW_WHILE.test(t) && (t.includes('{') || isPythonIndent(lines, i))) {
    const params = extractParens(t);
    const hasBraces = t.includes('{');
    const { inner, consumed } = hasBraces
      ? extractBraceBlock(lines, i)
      : extractPythonBlock(lines, i, countIndent(lines[i]));
    return {
      block: makeBlock('c-loop', 'mientras', 'mientras', params, '#ffab19', parseLines(inner, depth + 1)),
      consumed,
    };
  }

  // ── do / hacer (do-while) ───────────────────────────────────────────
  if (KW_DO.test(t)) {
    const { inner, consumed } = extractBraceBlock(lines, i);
    const lastLine = lines[i + consumed - 1]?.trim() ?? '';
    const m = lastLine.match(/(?:mientras|while)\s*\((.+?)\)\s*;?\s*$/);
    const cond = m ? m[1].trim() : 'condición';
    return {
      block: makeBlock('c-loop', 'hacer', 'hacer / mientras', cond, '#ffab19', parseLines(inner, depth + 1)),
      consumed,
    };
  }

  // ── switch / cambiar ────────────────────────────────────────────────
  if (KW_SWITCH.test(t) && t.includes('{')) {
    const params = extractParens(t);
    const { inner, consumed } = extractBraceBlock(lines, i);
    return {
      block: makeBlock('c-loop', 'cambiar', 'cambiar', params, '#ffab19', parseLines(inner, depth + 1)),
      consumed,
    };
  }

  // ── try / intentar ─────────────────────────────────────────────────
  if (KW_TRY.test(t)) {
    const tryResult = extractTryCatch(lines, i);
    if (tryResult) {
      return {
        block: makeBlock('c-try', 'intentar', 'intentar/capturar', tryResult.catchParam, '#ff6680',
          parseLines(tryResult.tryBody, depth + 1), parseLines(tryResult.catchBody, depth + 1)),
        consumed: tryResult.consumed,
      };
    }
  }

  // ── Python try/except ──────────────────────────────────────────────
  if (/^try\s*:\s*$/.test(t)) {
    const baseIndent = countIndent(lines[i]);
    const { inner: tryInner, consumed: tryConsumed } = extractPythonBlock(lines, i, baseIndent);
    let catchBody: string[] = [];
    let catchParam = 'excepcion e';
    let totalConsumed = tryConsumed;
    const nextIdx = i + tryConsumed;
    if (nextIdx < lines.length) {
      const nextTrim = lines[nextIdx].trim();
      const excMatch = nextTrim.match(/^except\s+(\w+(?:\s+as\s+\w+)?)\s*:\s*$/);
      if (excMatch) {
        catchParam = excMatch[1];
        const { inner: cBody, consumed: cConsumed } = extractPythonBlock(lines, nextIdx, countIndent(lines[nextIdx]));
        catchBody = cBody;
        totalConsumed += cConsumed;
      } else if (/^except\s*:\s*$/.test(nextTrim)) {
        catchParam = 'Exception';
        const { inner: cBody, consumed: cConsumed } = extractPythonBlock(lines, nextIdx, countIndent(lines[nextIdx]));
        catchBody = cBody;
        totalConsumed += cConsumed;
      }
    }
    return {
      block: makeBlock('c-try', 'intentar', 'intentar/capturar', catchParam, '#ff6680',
        parseLines(tryInner, depth + 1), parseLines(catchBody, depth + 1)),
      consumed: totalConsumed,
    };
  }

  // ── Print / sistema.imprimir / cout ────────────────────────────────
  if (/^sistema\.imprimir\s*\(/.test(t)) {
    const m = t.match(/sistema\.imprimir\s*\((.+)\)\s*;?$/s);
    return { block: makeBlock('stack', 'imprimir', 'imprimir', m?.[1].trim() ?? '', '#59c059'), consumed: 1 };
  }
  if (/^System\.out\.println\s*\(/.test(t) || /^System\.out\.print\s*\(/.test(t)) {
    const m = t.match(/System\.out\.(?:println|print)\s*\((.+)\)\s*;?$/s);
    return { block: makeBlock('stack', 'imprimir', 'imprimir', m?.[1].trim() ?? '', '#59c059'), consumed: 1 };
  }
  if (/^print\s*\(/.test(t)) {
    const m = t.match(/print\s*\((.+)\)\s*;?$/s);
    return { block: makeBlock('stack', 'imprimir', 'imprimir', m?.[1].trim() ?? '', '#59c059'), consumed: 1 };
  }
  if (/^printf\s*\(/.test(t)) {
    const m = t.match(/printf\s*\((.+)\)\s*;?$/s);
    return { block: makeBlock('stack', 'imprimir', 'imprimir', m?.[1].trim() ?? '', '#59c059'), consumed: 1 };
  }
  if (/^cout\s*<</.test(t)) {
    const val = t.replace(/^cout\s*<<\s*/, '').replace(/;\s*$/, '').trim();
    return { block: makeBlock('stack', 'imprimir', 'imprimir', val, '#59c059'), consumed: 1 };
  }

  // ── return / retornar ────────────────────────────────────────────────
  if (KW_RETURN.test(t)) {
    const val = t.replace(/^(?:retornar|return)\s*/, '').replace(/;$/, '').trim();
    return { block: makeBlock('stack', 'retornar', 'retornar', val, '#9966ff'), consumed: 1 };
  }

  // ── throw / lanzar ──────────────────────────────────────────────────
  if (KW_THROW.test(t)) {
    const val = t.replace(/^(?:lanzar|throw)\s+(?:nuevo|new\s+)?/, '').replace(/;$/, '').trim();
    return { block: makeBlock('stack', 'lanzar', 'lanzar', val, '#ff6680'), consumed: 1 };
  }

  // ── break / romper ──────────────────────────────────────────────────
  if (KW_BREAK.test(t)) {
    return { block: makeBlock('stack', 'raw', 'romper', 'romper;', '#888888'), consumed: 1 };
  }

  // ── continue / continuar ────────────────────────────────────────────
  if (KW_CONTINUE.test(t)) {
    return { block: makeBlock('stack', 'raw', 'continuar', 'continuar;', '#888888'), consumed: 1 };
  }

  // ── variable declaration ───────────────────────────────────────────────
  const varTypes: Array<{ es: string; en: string[] }> = [
    { es: 'entero',    en: ['int', 'Int'] },
    { es: 'cadena',    en: ['String', 'string', 'str'] },
    { es: 'booleano',  en: ['boolean', 'bool'] },
    { es: 'doble',     en: ['double'] },
    { es: 'flotante',  en: ['float'] },
    { es: 'largo',     en: ['long'] },
    { es: 'corto',     en: ['short'] },
    { es: 'caracter',  en: ['char'] },
    { es: 'var',       en: ['var', 'auto'] },
  ];
  for (const vt of varTypes) {
    const allKeywords = [vt.es, ...vt.en];
    for (const kw of allKeywords) {
      const regex = new RegExp(`^${kw}\\s+`);
      if (regex.test(t) && !t.includes('(') && !t.includes('{')) {
        const params = t.replace(regex, '').replace(/;$/, '').trim();
        return { block: makeBlock('stack', vt.es as BlockType, vt.es, params, '#4c97ff'), consumed: 1 };
      }
    }
  }

  return null;
}

// ── si/sino compound extractor ────────────────────────────────────────────

/** Split same-line inline statement text on ';' into separate parseable "lines". */
function splitInlineStatements(text: string): string[] {
  return text
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => `${s};`);
}

function extractSiSino(lines: string[], startIdx: number): {
  ifBody: string[];
  elseBody: string[];
  hasSino: boolean;
  consumed: number;
} | null {
  const firstLine = lines[startIdx].trim();
  if (!firstLine.includes('{')) return null;

  // Collect the if body
  let depth = 0;
  const allLines: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    allLines.push(line);
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    if (depth === 0 && allLines.length > 1) {
      break;
    }
  }

  // Find "} sino {" or "} else {" as a separator
  let sinoIdx = -1;
  let elseDepth = 0;
  const processedLines: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const trimLine = line.trim();
    processedLines.push(line);

    for (const ch of line) {
      if (ch === '{') elseDepth++;
      if (ch === '}') elseDepth--;
    }

    if (trimLine.match(/^}\s*(?:sino|else)\s*\{$/) && elseDepth === 1 && processedLines.length > 1) {
      sinoIdx = processedLines.length - 1;
    }

    // A fully single-line block (braces open & close on the first physical line)
    // must stop here without consuming any further lines — mirrors extractBraceBlock's
    // `all.length === 1 && depth === 0` special case.
    if (processedLines.length === 1 && elseDepth === 0) break;
    if (elseDepth === 0 && processedLines.length > 1) break;
  }

  const consumed = processedLines.length;

  if (sinoIdx !== -1) {
    const ifBody = processedLines.slice(1, sinoIdx);
    const elseBody = processedLines.slice(sinoIdx + 1, processedLines.length - 1);
    return { ifBody, elseBody, hasSino: true, consumed };
  }

  if (processedLines.length === 1) {
    // The entire "si (...) { ... }" lives on one physical line — pull the body
    // out from between the first '{' and the last '}' instead of slicing lines.
    const only = processedLines[0];
    const openIdx = only.indexOf('{');
    const closeIdx = only.lastIndexOf('}');
    const inline = openIdx !== -1 && closeIdx > openIdx ? only.slice(openIdx + 1, closeIdx).trim() : '';
    return { ifBody: inline ? splitInlineStatements(inline) : [], elseBody: [], hasSino: false, consumed };
  }

  const ifBody = processedLines.slice(1, processedLines.length - 1);
  return { ifBody, elseBody: [], hasSino: false, consumed };
}

// ── try/catch extractor ───────────────────────────────────────────────────

function extractTryCatch(lines: string[], startIdx: number): {
  tryBody: string[];
  catchBody: string[];
  catchParam: string;
  consumed: number;
} | null {
  const collected: string[] = [];
  let depth = 0;
  let catchStart = -1;
  let catchParam = 'excepcion e';

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const trimLine = line.trim();
    collected.push(line);

    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }

    if (trimLine.match(/^}\s*(?:capturar|catch)\s*\(/) && depth === 1) {
      const m = trimLine.match(/(?:capturar|catch)\s*\((.+?)\)/);
      if (m) catchParam = m[1].trim();
      catchStart = collected.length - 1;
    }

    // A fully single-line "intentar { ... }" must stop here without consuming
    // any further lines — mirrors extractBraceBlock's `all.length === 1 && depth === 0`.
    if (collected.length === 1 && depth === 0) break;
    if (depth === 0 && collected.length > 1) break;
  }

  if (!collected.length) return null;

  if (collected.length === 1 && catchStart === -1) {
    // The entire "intentar { ... }" lives on one physical line with no catch
    // clause on that same line — pull the body out from between the first
    // '{' and the last '}' instead of slicing lines.
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
