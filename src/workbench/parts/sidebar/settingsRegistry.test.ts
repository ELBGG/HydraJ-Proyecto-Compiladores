import { describe, it, expect, beforeAll } from 'vitest';
import { SETTINGS_SCHEMA, getSettingDefinition } from './settingsRegistry.js';
import { registerJavaLanguages } from '../../../languages/java/index.js';

beforeAll(() => {
  // humanLanguageOptions()/progLanguageOptions() read LanguageRegistry.getAllMappings() —
  // needs at least one mapping registered for the enum-options assertions below to have
  // something real to check, mirroring how workbench.ts registers languages at startup.
  registerJavaLanguages();
});

describe('SETTINGS_SCHEMA', () => {
  it('has no duplicate ids', () => {
    const ids = SETTINGS_SCHEMA.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every id is dot-namespaced (category.name), matching the flat settings.json shape', () => {
    for (const def of SETTINGS_SCHEMA) {
      expect(def.id).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
    }
  });

  it('every default matches its declared type', () => {
    for (const def of SETTINGS_SCHEMA) {
      switch (def.type) {
        case 'boolean':
          expect(typeof def.default).toBe('boolean');
          break;
        case 'number':
          expect(typeof def.default).toBe('number');
          break;
        case 'string':
        case 'secret':
        case 'enum':
          expect(typeof def.default).toBe('string');
          break;
      }
    }
  });

  it('every enum setting provides enumOptions and its default is one of them', () => {
    for (const def of SETTINGS_SCHEMA.filter(s => s.type === 'enum')) {
      expect(def.enumOptions).toBeTypeOf('function');
      const options = def.enumOptions!();
      expect(options.length).toBeGreaterThan(0);
      // Dynamic option lists (e.g. installed prog languages) can't guarantee the
      // hardcoded default is present in every possible runtime state, so this only
      // applies to statically-defined option lists.
      const isDynamic = def.id === 'workbench.humanLanguage' || def.id === 'workbench.defaultProgLanguage' || def.id === 'stt.language';
      if (!isDynamic) {
        expect(options.map(o => o.value)).toContain(def.default);
      }
    }
  });

  it('every numeric setting with min/max brackets its own default', () => {
    for (const def of SETTINGS_SCHEMA.filter(s => s.type === 'number')) {
      if (def.min !== undefined) expect(def.default as number).toBeGreaterThanOrEqual(def.min);
      if (def.max !== undefined) expect(def.default as number).toBeLessThanOrEqual(def.max);
    }
  });

  it("workbench.humanLanguage's enumOptions resolves real registered languages", () => {
    const def = getSettingDefinition('workbench.humanLanguage')!;
    const options = def.enumOptions!();
    expect(options.some(o => o.value === 'es')).toBe(true);
  });

  it('getSettingDefinition returns undefined for an unknown id', () => {
    expect(getSettingDefinition('not.a.real.setting')).toBeUndefined();
  });

  it('getSettingDefinition returns the matching entry for a known id', () => {
    expect(getSettingDefinition('editor.fontSize')?.label).toBe('Tamaño de fuente');
  });
});
