/** A contiguous slice of source: either translatable code, or a string/comment span to leave untouched. */
export interface ICodeSegment {
  text: string;
  isCode: boolean;
}

/**
 * Walks the source once, classifying each character span as translatable "code" or a
 * string-literal/comment span that must be preserved verbatim. Recognizes double-,
 * single-, and backtick-quoted strings (tracking `\` escape sequences so an escaped
 * quote doesn't end the string early), `//` and `/* *\/` comments, and Python's `#`
 * line comments.
 *
 * Shared by TranspilerEngine (so string/comment content is never mistranslated) and
 * syntaxDiagnostics (so bracket/string checks ignore braces that only appear inside a
 * comment or string literal, e.g. `// this comment has an unmatched {`).
 */
export function scanCodeSegments(code: string, languageId: string): ICodeSegment[] {
  const segments: ICodeSegment[] = [];
  const lineCommentMarker = languageId === 'python' ? '#' : '//';
  const supportsBlockComment = languageId !== 'python';

  const n = code.length;
  let i = 0;
  let segmentStart = 0;

  const flush = (end: number, isCode: boolean) => {
    if (end > segmentStart) {
      segments.push({ text: code.slice(segmentStart, end), isCode });
    }
    segmentStart = end;
  };

  while (i < n) {
    // Line comments: // for C-family languages, # for Python.
    if (code.startsWith(lineCommentMarker, i)) {
      flush(i, true);
      const newlineIdx = code.indexOf('\n', i);
      i = newlineIdx === -1 ? n : newlineIdx;
      flush(i, false);
      continue;
    }

    // Block comments: /* ... */ (not applicable to Python).
    if (supportsBlockComment && code[i] === '/' && code[i + 1] === '*') {
      flush(i, true);
      const closeIdx = code.indexOf('*/', i + 2);
      i = closeIdx === -1 ? n : closeIdx + 2;
      flush(i, false);
      continue;
    }

    // String / char literals: "...", '...', `...`.
    const ch = code[i];
    if (ch === '"' || ch === '\'' || ch === '`') {
      flush(i, true);
      let j = i + 1;
      while (j < n) {
        const cj = code[j];
        if (cj === '\\') {
          j += 2;
          continue;
        }
        if (cj === ch) {
          j += 1;
          break;
        }
        if (cj === '\n') {
          break;
        }
        j += 1;
      }
      i = Math.min(j, n);
      flush(i, false);
      continue;
    }

    i += 1;
  }

  flush(n, true);
  return segments;
}
