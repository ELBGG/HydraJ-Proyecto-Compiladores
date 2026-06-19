import * as monaco from 'monaco-editor';
import darkPlusRaw from './dark-plus-theme.json';

type VsTokenColor = {
  scope?: string | string[];
  settings?: { foreground?: string; background?: string; fontStyle?: string };
};

export function applyTheme(): void {
  const tokenColors: VsTokenColor[] = (darkPlusRaw as any).tokenColors ?? [];

  const rules: monaco.editor.ITokenThemeRule[] = [];
  for (const rule of tokenColors) {
    const fg = rule.settings?.foreground?.replace(/^#/, '');
    const fs = rule.settings?.fontStyle;
    if (!fg && !fs) continue;
    const scopes = Array.isArray(rule.scope)
      ? rule.scope
      : typeof rule.scope === 'string'
      ? [rule.scope]
      : [];
    for (const scope of scopes) {
      if (!scope) continue;
      rules.push({ token: scope, foreground: fg, fontStyle: fs });
    }
  }

  monaco.editor.defineTheme('hydra-dark-plus', {
    base: 'vs-dark',
    inherit: true,
    rules,
    colors: (darkPlusRaw as any).colors as monaco.editor.IColors,
  });
  monaco.editor.setTheme('hydra-dark-plus');
}
