import './workbench/media/style.css';
import { Workbench } from './workbench/workbench.js';
import { registerAllLanguages, LanguageRegistry, TranspilerEngine } from './languages/index.js';

const transpiler = new TranspilerEngine();

function main(): void {
  const root = document.getElementById('workbench-root');
  if (!root) {
    throw new Error('Workbench root element not found');
  }

  registerAllLanguages();

  window.HydraCode = {
    LanguageRegistry,
    TranspilerEngine: TranspilerEngine,
    transpiler,
    get languages(): Record<string, { tokens: null; mappings: () => any[] }> {
      const allMappings = LanguageRegistry.getAllMappings();
      const langs: Record<string, any> = {};
      const seen = new Set<string>();
      for (const m of allMappings) {
        if (!seen.has(m.languageId)) {
          seen.add(m.languageId);
          langs[m.languageId] = {
            tokens: null,
            mappings: () => LanguageRegistry.getMappingsForLanguage(m.languageId),
          };
        }
      }
      return langs;
    },
  };

  const workbench = new Workbench(root);

  window.addEventListener('resize', () => {
    workbench.layout();
  });

  window.addEventListener('load', () => {
    workbench.layout();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
