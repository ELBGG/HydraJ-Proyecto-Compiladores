import type { IHumanLanguageMapping, IMultiWordPattern } from '../tokens/types.js';

export class HumanLanguageMapping implements IHumanLanguageMapping {
  readonly keywords: Record<string, string>;
  readonly types: Record<string, string>;
  readonly literals: Record<string, string>;
  readonly modifiers: Record<string, string>;
  readonly patterns: IMultiWordPattern[];

  constructor(
    readonly id: string,
    readonly name: string,
    readonly nativeName: string,
    readonly languageId: string,
    defs: {
      keywords?: Record<string, string>;
      types?: Record<string, string>;
      literals?: Record<string, string>;
      modifiers?: Record<string, string>;
      patterns?: IMultiWordPattern[];
    },
  ) {
    this.keywords = defs.keywords ?? {};
    this.types = defs.types ?? {};
    this.literals = defs.literals ?? {};
    this.modifiers = defs.modifiers ?? {};
    this.patterns = defs.patterns ?? [];
  }
}
