import type { IHumanLanguageMapping, IMultiWordPattern, IBlockCodeTemplate } from '../tokens/types.js';

export class HumanLanguageMapping implements IHumanLanguageMapping {
  readonly keywords: Record<string, string>;
  readonly types: Record<string, string>;
  readonly literals: Record<string, string>;
  readonly modifiers: Record<string, string>;
  readonly patterns: IMultiWordPattern[];
  readonly version?: string;
  readonly blockTemplate?: IBlockCodeTemplate;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly nativeName: string,
    readonly languageId: string,
    defs: {
      version?: string;
      keywords?: Record<string, string>;
      types?: Record<string, string>;
      literals?: Record<string, string>;
      modifiers?: Record<string, string>;
      patterns?: IMultiWordPattern[];
      blockTemplate?: IBlockCodeTemplate;
    },
  ) {
    this.keywords = defs.keywords ?? {};
    this.types = defs.types ?? {};
    this.literals = defs.literals ?? {};
    this.modifiers = defs.modifiers ?? {};
    this.patterns = defs.patterns ?? [];
    this.version = defs.version;
    this.blockTemplate = defs.blockTemplate;
  }
}
