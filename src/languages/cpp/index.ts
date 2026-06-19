export { cppTokens } from './CppTokens.js';
export { cppSpanish } from './CppSpanish.js';

import { cppSpanish } from './CppSpanish.js';
import { LanguageRegistry } from '../api/LanguageRegistry.js';

export function registerCppLanguages(): void {
  LanguageRegistry.register(cppSpanish);
}
