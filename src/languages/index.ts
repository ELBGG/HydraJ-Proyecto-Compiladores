export { LanguageTokens } from './tokens/LanguageTokens.js';
export { HumanLanguageMapping } from './tokens/HumanLanguageMapping.js';
export type {
  ILanguageTokens,
  IHumanLanguageMapping,
  IMultiWordPattern,
  ITranspileRequest,
  ITranspileResult,
} from './tokens/types.js';
export { parseMappingFile, mappingToFile, MappingFileError } from './tokens/mappingFile.js';
export type { IHydraMappingFile, IHydraMappingFilePattern } from './tokens/mappingFile.js';

export { TranspilerEngine } from './transpiler/TranspilerEngine.js';
export { LanguageRegistry } from './api/LanguageRegistry.js';

export { javaTokens, javaSpanish, registerJavaLanguages } from './java/index.js';
export { cTokens, cSpanish, registerCLanguages } from './c/index.js';
export { cppTokens, cppSpanish, registerCppLanguages } from './cpp/index.js';
export { pythonTokens, pythonSpanish, registerPythonLanguages } from './python/index.js';
export { goSpanish, registerGoLanguages } from './go/index.js';

export function registerAllLanguages(): void {
  // All languages registered via ExtensionRegistry on startup (pre-installed seed)
}
