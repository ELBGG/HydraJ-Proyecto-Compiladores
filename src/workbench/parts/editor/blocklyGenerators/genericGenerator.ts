import * as Blockly from 'blockly/core';
import type { IHumanLanguageMapping, VarBlockType, IBlockCodeTemplate, PreambleKey } from '../../../../languages/tokens/types.js';

const VAR_BLOCK_TYPES: VarBlockType[] = ['entero', 'cadena', 'booleano', 'doble', 'flotante', 'largo', 'caracter', 'corto', 'var'];

/** A Blockly.CodeGenerator augmented with a place to accumulate which PreambleKey
 *  constructs were actually used during the current top-level generation pass — read
 *  back by finalizeGeneratedCode() once all top blocks have been converted to code, so
 *  only the imports a program actually needs get prepended (never an unconditional
 *  "always emit this import", which would itself be a compile error in a language like
 *  Go if the construct ended up unused). */
export interface IHydraCodeGenerator extends Blockly.CodeGenerator {
  usedPreambleKeys: Set<PreambleKey>;
}

/** Best-effort parse of a C-style counting for-loop's INIT field text
 *  ("entero i = 0; i < 10; i++") into its variable/start/comparison/end parts, for
 *  reconstruction into some other language's native loop shape (Python's range(),
 *  Go's short-declaration for). Returns null if the text doesn't match this common
 *  single-counter shape (e.g. multiple variables, a decrementing loop, a non-'++'
 *  step), so the caller can fall back to a commented passthrough instead of emitting
 *  confidently-wrong code. */
export function parseCountingForLoop(init: string): { varName: string; start: string; op: '<' | '<='; end: string } | null {
  const m = init.match(/^\s*(?:\w+\s+)?(\w+)\s*=\s*(\S+)\s*;\s*\1\s*(<=?)\s*(\S+)\s*;\s*\1\s*\+\+\s*$/);
  if (!m) return null;
  const [, varName, start, op, end] = m;
  return { varName, start, op: op as '<' | '<=', end };
}

/**
 * Builds a Blockly.CodeGenerator that produces `mapping`'s flavor of Spanish-keyword
 * source for every hc_* block, driven entirely by `mapping.blockTemplate` — no
 * per-language TypeScript file needed. This is what makes adding a new programming
 * language to the visual block editor a documentation-and-data change (write a mapping
 * with a blockTemplate — see LANGUAGE_MAPPINGS.md) rather than a code change.
 *
 * Returns null if the mapping has no blockTemplate at all — Blocks mode is then
 * unavailable for that language (see blocklyRenderer.ts's generatorFor()), which is
 * the correct behavior: silently falling back to some OTHER language's generator would
 * produce confidently-wrong code in the user's actual file, which is worse than clearly
 * not offering the feature.
 */
export function buildGenericGenerator(mapping: IHumanLanguageMapping): IHydraCodeGenerator | null {
  const t = mapping.blockTemplate;
  if (!t) return null;

  const gen = new Blockly.CodeGenerator(`Hydra_${mapping.languageId}`) as unknown as IHydraCodeGenerator;
  gen.usedPreambleKeys = new Set();
  gen.INDENT = '    ';
  const braces = t.style === 'braces';
  const end = t.statementTerminator ?? (braces ? ';' : '');

  const condHeader = (keyword: string, cond: string): string => (braces ? `${keyword} (${cond})` : `${keyword} ${cond}`);
  const wrapBody = (header: string, body: string): string => (braces ? `${header} {\n${body}}\n` : `${header}:\n${body}`);
  // NOTE: mapping.nativeName is the *human* language's name ("Español") — every one
  // of these mappings has that same value regardless of target, so messages here must
  // reference mapping.languageId (the target language, e.g. "go") instead.
  const unsupported = (what: string, body: string): string =>
    `${t.lineComment} ${mapping.languageId} no soporta ${what} — cuerpo tratado como código normal\n${body}`;

  gen.forBlock['hc_clase'] = (block) => {
    const name = block.getFieldValue('NAME');
    const body = gen.statementToCode(block, 'BODY');
    if (!t.class) return unsupported('clases', body);
    const header = t.class.replace('{NAME}', name);
    return braces ? `${header} {\n${body}}${t.classTrailingSemicolon ? ';' : ''}\n` : `${header}:\n${body}`;
  };

  gen.forBlock['hc_main'] = (block) => {
    const body = gen.statementToCode(block, 'BODY');
    return t.main ? wrapBody(t.main, body) : body;
  };

  gen.forBlock['hc_metodo'] = (block) => {
    let signature: string = block.getFieldValue('SIGNATURE');
    for (const pattern of t.stripFromSignature ?? []) {
      signature = signature.replace(new RegExp(pattern, 'i'), '');
    }
    const body = gen.statementToCode(block, 'BODY');
    return wrapBody(t.method.replace('{SIGNATURE}', signature.trim()), body);
  };

  gen.forBlock['hc_si'] = (block: Blockly.Block) => {
    const cond = block.getFieldValue('COND');
    const body = gen.statementToCode(block, 'DO');
    const elseBody = gen.statementToCode(block, 'ELSE');
    const header = condHeader(t.ifKeyword, cond);
    if (!elseBody) return wrapBody(header, body);
    return braces
      ? `${header} {\n${body}} ${t.elseKeyword} {\n${elseBody}}\n`
      : `${header}:\n${body}${t.elseKeyword}:\n${elseBody}`;
  };

  gen.forBlock['hc_mientras'] = (block) => {
    const cond = block.getFieldValue('COND');
    const body = gen.statementToCode(block, 'DO');
    return wrapBody(condHeader(t.whileKeyword, cond), body);
  };

  gen.forBlock['hc_hacer'] = (block) => {
    const body = gen.statementToCode(block, 'DO');
    const cond = block.getFieldValue('COND');
    if (t.supportsDoWhile && t.doKeyword && braces) {
      return `${t.doKeyword} {\n${body}} ${t.whileKeyword} (${cond})${end}\n`;
    }
    // No native do-while: run the body once, then an equivalent while loop with the
    // same body (duplicated) — needs no extra vocabulary beyond whileKeyword, unlike a
    // while-true+break idiom, which would need a negation operator this schema has no
    // field for.
    return `${body}${wrapBody(condHeader(t.whileKeyword, cond), body)}`;
  };

  gen.forBlock['hc_para'] = (block) => {
    const init = block.getFieldValue('INIT');
    const body = gen.statementToCode(block, 'DO');

    if (t.forStyle === 'c-style') {
      return wrapBody(`${t.forKeyword} (${init})`, body);
    }

    const parsed = parseCountingForLoop(init);
    if (!parsed) {
      return `${t.lineComment} ${t.forKeyword} (${init}) — traducción automática no disponible para este patrón de bucle; reescríbelo manualmente\n`;
    }

    if (t.forStyle === 'go-style') {
      // No surrounding parens (Go's ForClause grammar has none) and a short ":="
      // declaration — a typed "entero i = 0" isn't valid there even after translation.
      return wrapBody(`${t.forKeyword} ${parsed.varName} := ${parsed.start}; ${parsed.varName} ${parsed.op} ${parsed.end}; ${parsed.varName}++`, body);
    }

    // 'range' — NOTE: "en rango(...)" is currently Python-specific wording, not a
    // generic field; if a second range()-style language is added later this should grow
    // an inKeyword/rangeFunction pair on the template instead of hardcoding Spanish here.
    const rangeEnd = parsed.op === '<=' ? `${parsed.end} + 1` : parsed.end;
    return wrapBody(`${t.forKeyword} ${parsed.varName} en rango(${parsed.start}, ${rangeEnd})`, body);
  };

  gen.forBlock['hc_cambiar'] = (block) => {
    const variable = block.getFieldValue('VAR');
    const body = gen.statementToCode(block, 'DO');
    if (!t.switchKeyword) return unsupported("una construcción nativa equivalente a 'cambiar'", body);
    return wrapBody(condHeader(t.switchKeyword, variable), body);
  };

  gen.forBlock['hc_intentar'] = (block) => {
    const body = gen.statementToCode(block, 'DO');
    if (!t.supportsTryCatch || !t.tryKeyword || !t.catchKeyword) return unsupported('excepciones', body);
    const exc = block.getFieldValue('EXC');
    const catchBody = gen.statementToCode(block, 'CATCH');
    return braces
      ? `${t.tryKeyword} {\n${body}} ${t.catchKeyword} (${exc}) {\n${catchBody}}\n`
      : `${t.tryKeyword}:\n${body}${t.catchKeyword} ${exc}:\n${catchBody}`;
  };

  gen.forBlock['hc_imprimir'] = (block) => {
    gen.usedPreambleKeys.add('print');
    return `${t.print.replace('{TEXT}', block.getFieldValue('TEXT'))}${end}\n`;
  };
  gen.forBlock['hc_imprimir_error'] = (block) => {
    gen.usedPreambleKeys.add('printError');
    return `${t.printError.replace('{TEXT}', block.getFieldValue('TEXT'))}${end}\n`;
  };

  for (const blockType of VAR_BLOCK_TYPES) {
    gen.forBlock[`hc_${blockType}`] = (block) => {
      const varName = block.getFieldValue('VAR');
      if (!t.varDecl) return `${varName}${end}\n`;
      // Falls back to the block's own Spanish name (e.g. "entero"), NOT
      // mapping.types[blockType] — that would look up the *English* translation
      // ("int"), the opposite of what block-generated Spanish source needs.
      const typeWord = t.typeOverrides?.[blockType] ?? blockType;
      return `${t.varDecl.replace('{TYPE}', typeWord).replace('{VAR}', varName)}${end}\n`;
    };
  }

  gen.forBlock['hc_retornar'] = (block) => `${t.returnKeyword} ${block.getFieldValue('VALUE')}${end}\n`;
  gen.forBlock['hc_lanzar'] = (block) => {
    if (!t.throwTemplate) return `${t.lineComment} ${mapping.languageId} no soporta excepciones — bloque omitido\n`;
    return `${t.throwTemplate.replace('{EXC}', block.getFieldValue('EXC'))}${end}\n`;
  };
  gen.forBlock['hc_romper'] = () => `${t.breakKeyword}${end}\n`;
  gen.forBlock['hc_continuar'] = () => `${t.continueKeyword}${end}\n`;

  return gen;
}

/**
 * Assembles the final file from a generation pass's concatenated body code: prepends
 * `template.filePrefix` (if any) and the deduped preamble lines for whichever
 * PreambleKey constructs `gen` recorded as used (if any), in that order, each block
 * separated by a blank line. Call once after generating every top-level block's code —
 * see BlocklySession.getCode(). Clears `gen.usedPreambleKeys` afterward so the next
 * getCode() call (the generator instance is cached and reused across calls) starts from
 * a clean slate instead of accumulating stale keys from a since-edited workspace.
 */
export function finalizeGeneratedCode(bodyCode: string, gen: IHydraCodeGenerator, template: IBlockCodeTemplate): string {
  const preambleLines: string[] = [];
  const seen = new Set<string>();
  for (const key of gen.usedPreambleKeys) {
    for (const line of template.preamble?.[key] ?? []) {
      if (!seen.has(line)) { seen.add(line); preambleLines.push(line); }
    }
  }
  gen.usedPreambleKeys.clear();

  let prefix = '';
  if (template.filePrefix) prefix += `${template.filePrefix}\n\n`;
  if (preambleLines.length > 0) prefix += `${preambleLines.join('\n')}\n\n`;
  return prefix + bodyCode;
}

/** Exposed for tests/tools that want to inspect a template's shape without building a
 *  full Blockly generator. */
export type { IBlockCodeTemplate };
