export { LanguageTokens } from './tokens/LanguageTokens.js';
export { HumanLanguageMapping } from './tokens/HumanLanguageMapping.js';
export type {
  ILanguageTokens,
  IHumanLanguageMapping,
  IMultiWordPattern,
  ITranspileRequest,
  ITranspileResult,
} from './tokens/types.js';

export { TranspilerEngine } from './transpiler/TranspilerEngine.js';
export { LanguageRegistry } from './api/LanguageRegistry.js';

export { javaTokens, javaSpanish, registerJavaLanguages } from './java/index.js';
export { cTokens, registerCLanguages } from './c/index.js';
export { cppTokens, registerCppLanguages } from './cpp/index.js';

import { registerJavaLanguages } from './java/index.js';
import { registerCLanguages } from './c/index.js';
import { registerCppLanguages } from './cpp/index.js';

export function registerAllLanguages(): void {
  registerJavaLanguages();
  registerCLanguages();
  registerCppLanguages();
}
