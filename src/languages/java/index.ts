export { javaTokens } from './JavaTokens.js';
export { javaSpanish } from './JavaSpanish.js';

import { javaSpanish } from './JavaSpanish.js';
import { LanguageRegistry } from '../api/LanguageRegistry.js';

export function registerJavaLanguages(): void {
  LanguageRegistry.register(javaSpanish);
}
