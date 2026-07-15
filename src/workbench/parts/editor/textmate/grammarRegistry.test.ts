import { describe, it, expect, beforeAll, vi } from 'vitest';

// grammarRegistry.ts loads the real oniguruma WASM binary (via a Vite `?url` import +
// fetch) at module scope — that only resolves in a browser/Electron environment, not
// plain Node/vitest, and would otherwise surface as an unhandled rejection unrelated to
// what's actually under test here (shouldInjectSpanish doesn't touch the oniguruma lib).
vi.mock('./oniguruma.js', () => ({ getOnigLib: () => Promise.resolve({}) }));

import { shouldInjectSpanish } from './grammarRegistry.js';
import { registerCppLanguages } from '../../../../languages/cpp/index.js';

describe('shouldInjectSpanish', () => {
  beforeAll(() => {
    registerCppLanguages();
  });

  it('is true for a base scope with a registered mapping', () => {
    expect(shouldInjectSpanish('source.cpp')).toBe(true);
  });

  it('is false for a language with no registered mapping', () => {
    expect(shouldInjectSpanish('source.rust')).toBe(false);
  });

  // Regression test: without this guard, an already-injected scope re-extracts the
  // same progLang and gets injected into again, producing an unbounded chain
  // (source.cpp.es-injection -> source.cpp.es-injection.es-injection -> ...) that
  // OOM-crashed the whole renderer process the moment a .cpp file was opened.
  it('is false for a scope that is already an injection grammar, breaking recursion', () => {
    expect(shouldInjectSpanish('source.cpp.es-injection')).toBe(false);
    expect(shouldInjectSpanish('source.cpp.es-injection.es-injection')).toBe(false);
  });
});
