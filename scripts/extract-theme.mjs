// scripts/extract-theme.mjs
// One-time: merges dark_vs.json + dark_plus.json into a clean JSON for bundling.
// Run: node scripts/extract-theme.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const THEMES = 'D:\\HydraCode\\vscode\\extensions\\theme-defaults\\themes';
const DEST = path.join(ROOT, 'src', 'workbench', 'parts', 'editor', 'textmate', 'dark-plus-theme.json');

function stripJsonc(text) {
  let o = '', S = false, L = false, B = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (L) { if (c === '\n') { L = false; o += c; } continue; }
    if (B) { if (c === '*' && n === '/') { B = false; i++; } continue; }
    if (S) { o += c; if (c === '\\') { o += n; i++; } else if (c === '"') S = false; continue; }
    if (c === '"') { S = true; o += c; continue; }
    if (c === '/' && n === '/') { L = true; i++; continue; }
    if (c === '/' && n === '*') { B = true; i++; continue; }
    o += c;
  }
  return o.replace(/,(\s*[}\]])/g, '$1');
}

const readJsonc = p => JSON.parse(stripJsonc(fs.readFileSync(p, 'utf-8')));

const darkVs   = readJsonc(path.join(THEMES, 'dark_vs.json'));
const darkPlus = readJsonc(path.join(THEMES, 'dark_plus.json'));

// dark_plus.json has "include": "./dark_vs.json" — merge manually.
const merged = {
  name: 'Dark+ (default dark)',
  tokenColors: [
    ...(darkVs.tokenColors ?? darkVs.settings ?? []),
    ...(darkPlus.tokenColors ?? darkPlus.settings ?? []),
  ],
  colors: darkVs.colors ?? {},
};

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, JSON.stringify(merged, null, 2), 'utf-8');
console.log('Written:', DEST);
console.log('tokenColors:', merged.tokenColors.length, 'rules');
console.log('colors:', Object.keys(merged.colors).length, 'entries');
