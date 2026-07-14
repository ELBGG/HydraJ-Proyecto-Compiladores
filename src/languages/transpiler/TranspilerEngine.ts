import type { IHumanLanguageMapping, IMultiWordPattern, ITranspileRequest, ITranspileResult } from '../tokens/types.js';
import { LanguageRegistry } from '../api/LanguageRegistry.js';

/** A contiguous slice of source: either translatable code, or a string/comment span to leave untouched. */
interface ICodeSegment {
  text: string;
  isCode: boolean;
}

interface IKeywordReplacement {
  regex: RegExp;
  replacement: string;
}

export class TranspilerEngine {
  transpile(request: ITranspileRequest): ITranspileResult {
    const mapping = LanguageRegistry.getMapping(request.languageId, request.humanLanguageId);
    if (!mapping) {
      return {
        success: false,
        output: request.code,
        languageId: request.languageId,
        humanLanguageId: request.humanLanguageId,
        error: `No mapping found for ${request.languageId} → ${request.humanLanguageId}`,
      };
    }

    try {
      const output = this._transpileCode(request.code, mapping);
      return {
        success: true,
        output,
        languageId: request.languageId,
        humanLanguageId: request.humanLanguageId,
      };
    } catch (err) {
      return {
        success: false,
        output: request.code,
        languageId: request.languageId,
        humanLanguageId: request.humanLanguageId,
        error: String(err),
      };
    }
  }

  private _transpileCode(code: string, mapping: IHumanLanguageMapping): string {
    // 1. Build a combined replacement map (modifiers + keywords + types + literals)
    const allMappings: Record<string, string> = {};
    const insertMapping = (src: string, dst: string) => {
      if (!src || !dst) return;
      allMappings[src] = dst;
    };

    for (const [src, dst] of Object.entries(mapping.modifiers)) insertMapping(src, dst);
    for (const [src, dst] of Object.entries(mapping.keywords)) insertMapping(src, dst);
    for (const [src, dst] of Object.entries(mapping.types)) insertMapping(src, dst);
    for (const [src, dst] of Object.entries(mapping.literals)) insertMapping(src, dst);

    // Sort by longest first to avoid partial replacements
    const sortedTerms = Object.keys(allMappings).sort((a, b) => b.length - a.length);
    const keywordReplacements: IKeywordReplacement[] = sortedTerms.map((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { regex: new RegExp(`\\b${escaped}\\b`, 'g'), replacement: allMappings[term] };
    });

    // 2. Split the source into code spans vs. string-literal/comment spans, so that
    // Spanish prose living inside a string or a comment is never mistaken for code.
    const segments = this._scanCodeSegments(code, mapping.languageId);

    // 3. Translate only the code spans; string/comment spans pass through verbatim.
    let result = '';
    for (const segment of segments) {
      result += segment.isCode
        ? this._translateSpan(segment.text, mapping.patterns, keywordReplacements)
        : segment.text;
    }

    return result;
  }

  /** Applies multi-word patterns (longest match first) then word-boundary keyword replacement to one code span. */
  private _translateSpan(
    text: string,
    patterns: IMultiWordPattern[] | undefined,
    keywordReplacements: IKeywordReplacement[],
  ): string {
    let result = text;

    if (patterns) {
      for (const pattern of patterns) {
        result = result.replace(pattern.from, pattern.to);
      }
    }

    for (const { regex, replacement } of keywordReplacements) {
      result = result.replace(regex, replacement);
    }

    return result;
  }

  /**
   * Walks the source once, classifying each character span as translatable "code" or a
   * string-literal/comment span that must be preserved verbatim. Recognizes double-,
   * single-, and backtick-quoted strings (tracking `\` escape sequences so an escaped
   * quote doesn't end the string early), `//` and `/* *\/` comments, and Python's `#`
   * line comments.
   */
  private _scanCodeSegments(code: string, languageId: string): ICodeSegment[] {
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
}
