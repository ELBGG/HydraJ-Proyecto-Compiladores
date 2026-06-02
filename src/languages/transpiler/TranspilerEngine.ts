import type { IHumanLanguageMapping, ITranspileRequest, ITranspileResult } from '../tokens/types.js';
import { LanguageRegistry } from '../api/LanguageRegistry.js';

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
    let result = code;

    // 1. Multi-word patterns first (longest match)
    if (mapping.patterns) {
      for (const pattern of mapping.patterns) {
        result = result.replace(pattern.from, pattern.to);
      }
    }

    // 2. Build a combined replacement map (modifiers + keywords + types + literals)
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

    // 3. Word-boundary replacement
    for (const term of sortedTerms) {
      const replacement = allMappings[term];
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'g');
      result = result.replace(regex, replacement);
    }

    return result;
  }
}
