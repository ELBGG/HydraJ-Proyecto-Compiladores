import { scanCodeSegments } from '../../../languages/transpiler/codeScanner.js';

export interface ISyntaxDiagnostic {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning';
}

const OPENERS: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
const CLOSERS: Record<string, string> = { '}': '{', ')': '(', ']': '[' };

interface IStackEntry {
  char: string;
  line: number;
  column: number;
}

/**
 * Lightweight, parser-free structural check — brace/paren/bracket balance and
 * unterminated string/block-comment detection. Deliberately does NOT try to validate
 * grammar (missing semicolons, undeclared variables, etc.): those require a real
 * compiler/language-server per target language, which is out of scope here (see
 * languageIntelligence.ts's design note). This runs directly on the ORIGINAL
 * Spanish/mapped source, not the transpiled output — brackets, quotes, and comment
 * markers are never touched by keyword translation, so positions need no remapping.
 */
export function checkSyntax(code: string, languageId: string): ISyntaxDiagnostic[] {
  const diagnostics: ISyntaxDiagnostic[] = [];
  const segments = scanCodeSegments(code, languageId);

  let line = 1;
  let column = 1;
  const stack: IStackEntry[] = [];

  const advance = (ch: string) => {
    if (ch === '\n') { line++; column = 1; }
    else { column++; }
  };

  for (const segment of segments) {
    if (!segment.isCode) {
      // Unterminated string literal: the scanner cuts a string segment off at end-of-line
      // or end-of-file when it never finds the matching closing quote, so a properly-closed
      // string segment's last character always equals its first (the same quote char);
      // anything else means it ran off the end unterminated.
      const first = segment.text[0];
      const isStringLike = first === '"' || first === '\'' || first === '`';
      if (isStringLike && (segment.text.length < 2 || segment.text[segment.text.length - 1] !== first)) {
        diagnostics.push({
          startLineNumber: line, startColumn: column,
          endLineNumber: line, endColumn: column + 1,
          message: 'Cadena de texto sin cerrar (falta la comilla de cierre).',
          severity: 'error',
        });
      }
      // Unterminated block comment: only /* ... */ can run off the end of the file this
      // way — // and # line comments always end cleanly at a newline or EOF by design.
      if (segment.text.startsWith('/*') && !segment.text.endsWith('*/')) {
        diagnostics.push({
          startLineNumber: line, startColumn: column,
          endLineNumber: line, endColumn: column + 2,
          message: 'Comentario de bloque sin cerrar (falta */).',
          severity: 'error',
        });
      }
      for (const ch of segment.text) advance(ch);
      continue;
    }

    for (const ch of segment.text) {
      if (ch in OPENERS) {
        stack.push({ char: ch, line, column });
      } else if (ch in CLOSERS) {
        const top = stack[stack.length - 1];
        if (!top) {
          diagnostics.push({
            startLineNumber: line, startColumn: column,
            endLineNumber: line, endColumn: column + 1,
            message: `'${ch}' no tiene un '${CLOSERS[ch]}' correspondiente.`,
            severity: 'error',
          });
        } else if (top.char !== CLOSERS[ch]) {
          diagnostics.push({
            startLineNumber: line, startColumn: column,
            endLineNumber: line, endColumn: column + 1,
            message: `Se esperaba '${OPENERS[top.char]}' pero se encontró '${ch}'.`,
            severity: 'error',
          });
          stack.pop();
        } else {
          stack.pop();
        }
      }
      advance(ch);
    }
  }

  // Anything still open at EOF is unclosed — report at the opener, which is far more
  // actionable than a generic "unexpected end of file" at the last line.
  for (const entry of stack) {
    diagnostics.push({
      startLineNumber: entry.line, startColumn: entry.column,
      endLineNumber: entry.line, endColumn: entry.column + 1,
      message: `'${entry.char}' nunca se cierra con '${OPENERS[entry.char]}'.`,
      severity: 'error',
    });
  }

  return diagnostics;
}
