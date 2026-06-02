import type { ILanguageTokens } from './types.js';

export class LanguageTokens implements ILanguageTokens {
  readonly keywords: string[];
  readonly types: string[];
  readonly literals: string[];
  readonly modifiers: string[];
  readonly operators: string[];
  readonly delimiters: string[];

  constructor(
    readonly languageId: string,
    readonly languageName: string,
    defs: Partial<ILanguageTokens>,
  ) {
    this.keywords = defs.keywords ?? [];
    this.types = defs.types ?? [];
    this.literals = defs.literals ?? [];
    this.modifiers = defs.modifiers ?? [];
    this.operators = defs.operators ?? [];
    this.delimiters = defs.delimiters ?? [];
  }

  getAllTokens(): string[] {
    return [
      ...this.keywords,
      ...this.types,
      ...this.literals,
      ...this.modifiers,
    ];
  }
}
