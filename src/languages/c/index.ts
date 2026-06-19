export { cTokens } from './CTokens.js';
export { cSpanish } from './CSpanish.js';

import { cSpanish } from './CSpanish.js';
import { LanguageRegistry } from '../api/LanguageRegistry.js';

export function registerCLanguages(): void {
  LanguageRegistry.register(cSpanish);
}
