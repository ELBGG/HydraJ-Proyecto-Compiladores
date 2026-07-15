export { goSpanish } from './GoSpanish.js';

import { goSpanish } from './GoSpanish.js';
import { LanguageRegistry } from '../api/LanguageRegistry.js';

export function registerGoLanguages(): void {
  LanguageRegistry.register(goSpanish);
}
