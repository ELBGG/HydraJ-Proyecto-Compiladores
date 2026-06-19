export { pythonTokens } from './PythonTokens.js';
export { pythonSpanish } from './PythonSpanish.js';

import { pythonSpanish } from './PythonSpanish.js';
import { LanguageRegistry } from '../api/LanguageRegistry.js';

export function registerPythonLanguages(): void {
  LanguageRegistry.register(pythonSpanish);
}
