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

  // Expose API globally for extensions/plugins
  (window as any).HydraCode = {
    LanguageRegistry,
    TranspilerEngine: TranspilerEngine,
    transpiler,
    languages: {
      java: { tokens: null, mappings: () => LanguageRegistry.getMappingsForLanguage('java') },
      c: { tokens: null, mappings: () => LanguageRegistry.getMappingsForLanguage('c') },
      cpp: { tokens: null, mappings: () => LanguageRegistry.getMappingsForLanguage('cpp') },
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
