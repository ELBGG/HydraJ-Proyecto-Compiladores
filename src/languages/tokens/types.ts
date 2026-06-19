export interface ILanguageTokens {
  readonly languageId: string;
  readonly languageName: string;
  readonly keywords: string[];
  readonly types: string[];
  readonly literals: string[];
  readonly modifiers: string[];
  readonly operators: string[];
  readonly delimiters: string[];
}

export interface IHumanLanguageMapping {
  readonly id: string;
  readonly name: string;
  readonly nativeName: string;
  readonly languageId: string;
  readonly version?: string;

  readonly keywords: Record<string, string>;
  readonly types: Record<string, string>;
  readonly literals: Record<string, string>;
  readonly modifiers: Record<string, string>;

  readonly patterns?: IMultiWordPattern[];
}

export interface IMultiWordPattern {
  readonly from: RegExp;
  readonly to: string;
}

export interface ITranspileRequest {
  code: string;
  languageId: string;
  humanLanguageId: string;
}

export interface ITranspileResult {
  success: boolean;
  output: string;
  languageId: string;
  humanLanguageId: string;
  error?: string;
}
