import type { IRawGrammar } from 'vscode-textmate';
import type { IHumanLanguageMapping } from '../../../../languages/index.js';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds an in-memory TextMate grammar that injects Spanish keyword colors
 * into a base scope (e.g. source.c) using vscode-textmate's injection mechanism.
 *
 * The injected patterns assign conventional TextMate scope names so the
 * Dark+ theme colors them identically to their English equivalents:
 *   keyword.control   → purple  (#C586C0)
 *   storage.type      → teal    (#4EC9B0)
 *   constant.language → blue    (#4FC1FF)
 *   storage.modifier  → blue    (#569CD6 via keyword rule)
 */
export function buildSpanishInjectionGrammar(
  mapping: IHumanLanguageMapping,
  baseScopeName: string,
): IRawGrammar {
  const lang = baseScopeName.split('.')[1]; // 'c', 'cpp', 'java', 'python'

  const patterns: Array<{ match: string; name: string }> = [
    ...Object.keys(mapping.keywords).map(k => ({
      match: `\\b(${escapeRe(k)})\\b`,
      name: `keyword.control.${lang}`,
    })),
    ...Object.keys(mapping.types).map(k => ({
      match: `\\b(${escapeRe(k)})\\b`,
      name: `storage.type.${lang}`,
    })),
    ...Object.keys(mapping.literals).map(k => ({
      match: `\\b(${escapeRe(k)})\\b`,
      name: `constant.language.${lang}`,
    })),
    ...Object.keys(mapping.modifiers ?? {}).map(k => ({
      match: `\\b(${escapeRe(k)})\\b`,
      name: `storage.modifier.${lang}`,
    })),
  ];

  return {
    scopeName: `${baseScopeName}.es-injection`,
    injectionSelector: `L:${baseScopeName}`,
    patterns,
    repository: {},
  } as unknown as IRawGrammar;
}
