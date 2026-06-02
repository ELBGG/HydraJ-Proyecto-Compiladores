import type { IHumanLanguageMapping } from '../tokens/types.js';
import { HumanLanguageMapping } from '../tokens/HumanLanguageMapping.js';

type MappingEntry = {
  mapping: IHumanLanguageMapping;
  registeredAt: number;
};

export class LanguageRegistry {
  private static _mappings = new Map<string, MappingEntry>();
  private static _counter = 0;

  static register(mapping: IHumanLanguageMapping): void {
    const key = `${mapping.languageId}::${mapping.id}`;
    if (this._mappings.has(key)) {
      console.warn(`[HydraCode] Overriding existing mapping: ${key}`);
    }
    this._mappings.set(key, {
      mapping,
      registeredAt: ++this._counter,
    });
    console.log(`[HydraCode] Registered mapping: ${mapping.name} (${mapping.nativeName}) → ${mapping.languageId}`);
  }

  static getMapping(languageId: string, humanLanguageId: string): IHumanLanguageMapping | undefined {
    const key = `${languageId}::${humanLanguageId}`;
    return this._mappings.get(key)?.mapping;
  }

  static getAllMappings(): IHumanLanguageMapping[] {
    return Array.from(this._mappings.values())
      .sort((a, b) => a.registeredAt - b.registeredAt)
      .map(entry => entry.mapping);
  }

  static getMappingsForLanguage(languageId: string): IHumanLanguageMapping[] {
    return this.getAllMappings().filter(m => m.languageId === languageId);
  }

  static createMapping(
    id: string,
    name: string,
    nativeName: string,
    languageId: string,
    defs: {
      keywords?: Record<string, string>;
      types?: Record<string, string>;
      literals?: Record<string, string>;
      modifiers?: Record<string, string>;
      patterns?: { from: RegExp; to: string }[];
    },
  ): HumanLanguageMapping {
    return new HumanLanguageMapping(id, name, nativeName, languageId, defs);
  }

  static unregister(languageId: string, humanLanguageId: string): boolean {
    const key = `${languageId}::${humanLanguageId}`;
    return this._mappings.delete(key);
  }

  static clear(): void {
    this._mappings.clear();
  }
}
