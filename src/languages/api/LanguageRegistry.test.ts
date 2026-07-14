import { describe, it, expect, beforeEach } from 'vitest';
import { LanguageRegistry } from './LanguageRegistry.js';
import { HumanLanguageMapping } from '../tokens/HumanLanguageMapping.js';

describe('LanguageRegistry', () => {
  beforeEach(() => {
    LanguageRegistry.clear();
  });

  it('registers and retrieves a mapping', () => {
    const mapping = new HumanLanguageMapping('es', 'Spanish', 'Español', 'java', {
      keywords: { clase: 'class' },
    });
    LanguageRegistry.register(mapping);
    const retrieved = LanguageRegistry.getMapping('java', 'es');
    expect(retrieved).toBeDefined();
    expect(retrieved!.keywords.clase).toBe('class');
  });

  it('returns undefined for missing mapping', () => {
    const result = LanguageRegistry.getMapping('nonexistent', 'es');
    expect(result).toBeUndefined();
  });

  it('lists all mappings', () => {
    const jv = new HumanLanguageMapping('es', 'Spanish', 'Español', 'java', {});
    const py = new HumanLanguageMapping('es', 'Spanish', 'Español', 'python', {});
    LanguageRegistry.register(jv);
    LanguageRegistry.register(py);
    const all = LanguageRegistry.getAllMappings();
    expect(all).toHaveLength(2);
  });

  it('filters mappings by language', () => {
    const jv = new HumanLanguageMapping('es', 'Spanish', 'Español', 'java', {});
    const jv2 = new HumanLanguageMapping('en', 'English', 'English', 'java', {});
    const py = new HumanLanguageMapping('es', 'Spanish', 'Español', 'python', {});
    LanguageRegistry.register(jv);
    LanguageRegistry.register(jv2);
    LanguageRegistry.register(py);
    const javaMappings = LanguageRegistry.getMappingsForLanguage('java');
    expect(javaMappings).toHaveLength(2);
  });

  it('unregisters mappings', () => {
    const mapping = new HumanLanguageMapping('es', 'Spanish', 'Español', 'java', {});
    LanguageRegistry.register(mapping);
    expect(LanguageRegistry.getMapping('java', 'es')).toBeDefined();
    LanguageRegistry.unregister('java', 'es');
    expect(LanguageRegistry.getMapping('java', 'es')).toBeUndefined();
  });

  it('clears all mappings', () => {
    const mapping = new HumanLanguageMapping('es', 'Spanish', 'Español', 'java', {});
    LanguageRegistry.register(mapping);
    LanguageRegistry.clear();
    expect(LanguageRegistry.getAllMappings()).toHaveLength(0);
  });
});
