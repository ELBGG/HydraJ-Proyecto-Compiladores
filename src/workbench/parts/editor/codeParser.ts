import type { Block, BlockKind, BlockType } from './blockModel.js';
import { makeBlock } from './blockModel.js';

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
  const m = line.match(/\((.+?)(?:\)\s*\{|\)\s*$)/s);
  return m ? m[1].trim() : '';
}

// ── Parse code string into a Block tree ──────────────────────────────────

export function parseCodeToBlocks(code: string): Block[] {
  const lines = code.split('\n');
  return parseLines(lines);
}

function parseLines(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    if (!t || t.startsWith('//') || t === '}' || t === '};') { i++; continue; }

    const result = parseOneLine(lines, i);
    if (result) {
      blocks.push(result.block);
      i += result.consumed;
    } else {
      i++;
    }
  }
  return blocks;
}

function parseOneLine(lines: string[], i: number): { block: Block; consumed: number } | null {
  const t = lines[i].trim();

  // ── clase ──────────────────────────────────────────────────────────────
  if (/^(?:publico\s+)?(?:privado\s+)?clase\s+/.test(t) && t.includes('{')) {
    const nameMatch = t.match(/clase\s+(\w+)/);
    const name = nameMatch?.[1] ?? 'NombreClase';
    const { inner, consumed } = extractBraceBlock(lines, i);
    return {
      block: makeBlock('hat', 'clase', 'clase', name, '#9966ff', parseLines(inner)),
      consumed,
    };
  }

  // ── main() ─────────────────────────────────────────────────────────────
  if (/publico\s+estatico\s+vacio\s+principal/.test(t) && t.includes('{')) {
    const { inner, consumed } = extractBraceBlock(lines, i);
    return {
      block: makeBlock('hat', 'main', 'main()', '', '#ff8c1a', parseLines(inner)),
      consumed,
    };
  }

  // ── método público/privado (but NOT main, not clase) ───────────────────
  if (/^(?:publico|privado|protegido)/.test(t) && /\w+\s*\(/.test(t) && t.includes('{')) {
    const { inner, consumed } = extractBraceBlock(lines, i);
    const sig = t.replace(/\{.*/, '').trim();
    return {
      block: makeBlock('hat', 'metodo', 'método', sig, '#9966ff', parseLines(inner)),
      consumed,
    };
  }

  // ── si / si+sino ───────────────────────────────────────────────────────
  if (/^si\s*\(/.test(t) && t.includes('{')) {
    const params = extractParens(t);
    const { inner: ifInner, consumed: ifConsumed } = extractBraceBlock(lines, i);
    let children = parseLines(ifInner);
    let elseChildren: Block[] = [];
    let totalConsumed = ifConsumed;

    // Check if next non-empty line is "} sino {"
    const nextIdx = i + ifConsumed;
    const nextTrim = lines[nextIdx]?.trim() ?? '';
    if (/^}\s*sino\s*\{/.test(nextTrim) || nextTrim === '} sino {') {
      // The } sino { is already consumed in the brace block (depth tracking)
      // Actually we need to re-examine: extractBraceBlock stops at depth=0
      // The `} sino {` keeps depth at 1 so it's already inside.
      // Let's check if our snippet already contains 'sino'
    }

    // Re-examine: if the extracted inner is from a block that includes } sino {
    // we need to split it properly. Let's instead extract IF and ELSE separately.

    // Re-do: manually track si/sino as one compound block
    const compound = extractSiSino(lines, i);
    if (compound) {
      return {
        block: makeBlock('c-if', 'si', compound.hasSino ? 'si / sino' : 'si', params, '#ffab19',
          parseLines(compound.ifBody), compound.hasSino ? parseLines(compound.elseBody) : []),
        consumed: compound.consumed,
      };
    }

    return {
      block: makeBlock('c-if', 'si', 'si', params, '#ffab19', children, elseChildren),
      consumed: totalConsumed,
    };
  }

  // ── para ───────────────────────────────────────────────────────────────
  if (/^para\s*\(/.test(t) && t.includes('{')) {
    const params = extractParens(t);
    const { inner, consumed } = extractBraceBlock(lines, i);
    return {
      block: makeBlock('c-loop', 'para', 'para', params, '#ffab19', parseLines(inner)),
      consumed,
    };
  }

  // ── mientras ───────────────────────────────────────────────────────────
  if (/^mientras\s*\(/.test(t) && t.includes('{')) {
    const params = extractParens(t);
    const { inner, consumed } = extractBraceBlock(lines, i);
    return {
      block: makeBlock('c-loop', 'mientras', 'mientras', params, '#ffab19', parseLines(inner)),
      consumed,
    };
  }

  // ── cambiar ────────────────────────────────────────────────────────────
  if (/^cambiar\s*\(/.test(t) && t.includes('{')) {
    const params = extractParens(t);
    const { inner, consumed } = extractBraceBlock(lines, i);
    return {
      block: makeBlock('c-loop', 'cambiar', 'cambiar', params, '#ffab19', parseLines(inner)),
      consumed,
    };
  }

  // ── intentar ───────────────────────────────────────────────────────────
  if (/^intentar\s*\{/.test(t)) {
    const tryResult = extractTryCatch(lines, i);
    if (tryResult) {
      return {
        block: makeBlock('c-try', 'intentar', 'intentar/capturar', tryResult.catchParam, '#ff6680',
          parseLines(tryResult.tryBody), parseLines(tryResult.catchBody)),
        consumed: tryResult.consumed,
      };
    }
  }

  // ── sistema.imprimir ───────────────────────────────────────────────────
  if (/^sistema\.imprimir\s*\(/.test(t)) {
    const m = t.match(/sistema\.imprimir\s*\((.+)\)\s*;?$/s);
    return { block: makeBlock('stack', 'imprimir', 'imprimir', m?.[1].trim() ?? '', '#59c059'), consumed: 1 };
  }

  // ── retornar ───────────────────────────────────────────────────────────
  if (/^retornar\b/.test(t)) {
    const val = t.replace(/^retornar\s*/, '').replace(/;$/, '').trim();
    return { block: makeBlock('stack', 'retornar', 'retornar', val, '#9966ff'), consumed: 1 };
  }

  // ── lanzar ─────────────────────────────────────────────────────────────
  if (/^lanzar\b/.test(t)) {
    const val = t.replace(/^lanzar\s+(?:nuevo\s+)?/, '').replace(/;$/, '').trim();
    return { block: makeBlock('stack', 'lanzar', 'lanzar', val, '#ff6680'), consumed: 1 };
  }

  // ── variable declaration ───────────────────────────────────────────────
  const varTypes = ['entero','cadena','booleano','doble','flotante','largo','corto','caracter','var'];
  for (const vt of varTypes) {
    if (new RegExp(`^${vt}\\s+`).test(t)) {
      const params = t.replace(new RegExp(`^${vt}\\s+`), '').replace(/;$/, '').trim();
      return { block: makeBlock('stack', vt as BlockType, vt, params, '#4c97ff'), consumed: 1 };
    }
  }

  return null;
}

// ── si/sino compound extractor ────────────────────────────────────────────

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
  let ifEnd = -1;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    allLines.push(line);
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    if (depth === 0 && allLines.length > 1) {
      ifEnd = allLines.length - 1;
      break;
    }
  }

  // Check if the last line is "} sino {" or if the next line has "sino"
  const lastLine = allLines[allLines.length - 1]?.trim() ?? '';
  if (lastLine.includes('sino') && lastLine.includes('{')) {
    // The sino block is included in our extraction — split it
    const closingBraceIdx = allLines.findIndex((l, idx) => idx > 0 && l.trim().match(/^}\s*sino\s*\{/));
    if (closingBraceIdx !== -1) {
      const ifBody = allLines.slice(1, closingBraceIdx);
      // Now extract the else body
      const remaining = lines.slice(startIdx + allLines.length - (allLines.length - closingBraceIdx - 1));
      // This gets complex. Let's do a cleaner approach.
    }
  }

  // Simpler: find "} sino {" as a separator
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

    // If we hit depth=0 on a line that ends with '{' (like "} sino {"), mark sino position
    // Actually: "} sino {" transitions: } → depth-1, { → depth+1, net: depth unchanged
    if (trimLine.match(/^}\s*sino\s*\{$/) && elseDepth === 1 && processedLines.length > 1) {
      sinoIdx = processedLines.length - 1;
    }

    if (elseDepth === 0 && processedLines.length > 1) break;
  }

  const consumed = processedLines.length;

  if (sinoIdx !== -1) {
    const ifBody = processedLines.slice(1, sinoIdx);
    const elseBody = processedLines.slice(sinoIdx + 1, processedLines.length - 1);
    return { ifBody, elseBody, hasSino: true, consumed };
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

    if (trimLine.match(/^}\s*capturar\s*\(/) && depth === 1) {
      const m = trimLine.match(/capturar\s*\((.+?)\)/);
      if (m) catchParam = m[1].trim();
      catchStart = collected.length - 1;
    }

    if (depth === 0 && collected.length > 1) break;
  }

  if (!collected.length) return null;

  const tryBody = catchStart !== -1 ? collected.slice(1, catchStart) : collected.slice(1, -1);
  const catchBody = catchStart !== -1 ? collected.slice(catchStart + 1, -1) : [];

  return { tryBody, catchBody, catchParam, consumed: collected.length };
}
