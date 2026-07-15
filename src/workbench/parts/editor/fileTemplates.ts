import type { IHumanLanguageMapping } from '../../../languages/tokens/types.js';

function wrapBody(header: string, body: string, braces: boolean): string {
  return braces ? `${header} {\n${body}}\n` : `${header}:\n${body}`;
}

function indentBlock(block: string, indentUnit: string): string {
  return block.split('\n').filter(Boolean).map(line => `${indentUnit}${line}\n`).join('');
}

/** Java convention: a class name is idiomatically PascalCase and must be a valid
 *  identifier — strip anything that isn't a letter/digit/underscore (so "mi-programa"
 *  doesn't produce an invalid class name) and capitalize the first letter. Not marking
 *  the class `public`, so it deliberately does NOT need to case-match the filename the
 *  way a public class legally would — Java only enforces that for public classes. */
function toClassName(fileBaseName: string): string {
  const cleaned = fileBaseName.replace(/[^a-zA-Z0-9_]/g, '');
  const safe = cleaned || 'Principal';
  return safe.charAt(0).toUpperCase() + safe.slice(1);
}

/**
 * Builds the "Hola Mundo" starter content for a brand-new file (see titlebarPart.ts's
 * New File flow), reusing the same structural fields the Blockly generic engine reads
 * (filePrefix/main/mainRequiresClass/class/print/preamble) instead of hand-writing a
 * separate literal template per language — a new mapping gets a starter file for free
 * the moment it defines a blockTemplate, no extra file to write.
 *
 * Returns null when there's no mapping for this prog+human language pair, or the
 * mapping has no blockTemplate — callers should fall back to an empty file in that case
 * (there's no Spanish vocabulary to generate from).
 */
export function buildStarterFile(mapping: IHumanLanguageMapping | undefined, fileBaseName: string): string | null {
  const t = mapping?.blockTemplate;
  if (!t) return null;

  const braces = t.style === 'braces';
  const end = t.statementTerminator ?? (braces ? ';' : '');
  const indentUnit = '    ';

  const printStatement = `${t.print.replace('{TEXT}', '"Hola Mundo"')}${end}\n`;
  let block = t.main ? wrapBody(t.main, indentBlock(printStatement, indentUnit), braces) : printStatement;

  if (t.mainRequiresClass && t.class) {
    const header = t.class.replace('{NAME}', toClassName(fileBaseName));
    block = wrapBody(header, indentBlock(block, indentUnit), braces);
  }

  let out = '';
  if (t.filePrefix) out += `${t.filePrefix}\n\n`;
  if (t.preamble?.print?.length) out += `${t.preamble.print.join('\n')}\n\n`;
  return out + block;
}
