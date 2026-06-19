// scripts/setup-extensions.mjs
// One-time script: copies java/cpp/python grammar files from D:\HydraCode\vscode\extensions\
// Run: node scripts/setup-extensions.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = 'D:\\HydraCode\\vscode\\extensions';
const DEST = path.join(ROOT, 'extensions');

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
const resolveNls = (obj, nls) =>
  JSON.parse(JSON.stringify(obj).replace(/%([^%]+)%/g, (_, k) => nls[k] ?? k));

function writeJson(destPath, obj) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, JSON.stringify(obj, null, 2), 'utf-8');
}

function copyFile(srcPath, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  console.log('  copy', path.relative(ROOT, destPath));
}

function setupExtension(extName, opts = {}) {
  const src = path.join(SRC, extName);
  const dest = path.join(DEST, extName);
  let pkg = readJsonc(path.join(src, 'package.json'));
  const nlsPath = path.join(src, 'package.nls.json');
  const nls = fs.existsSync(nlsPath) ? readJsonc(nlsPath) : {};
  pkg = resolveNls(pkg, nls);

  // Drop unwanted top-level fields
  for (const k of ['scripts', 'repository', 'license', 'bugs', 'icon', 'galleryBanner', 'qna']) {
    delete pkg[k];
  }

  // Filter languages if requested (e.g. keep only c+cpp, drop cuda-cpp)
  if (opts.keepLangs) {
    if (pkg.contributes?.languages)
      pkg.contributes.languages = pkg.contributes.languages.filter(l => opts.keepLangs.includes(l.id));
    if (pkg.contributes?.grammars)
      pkg.contributes.grammars = pkg.contributes.grammars.filter(
        g => !g.language || opts.keepLangs.includes(g.language)
      );
  }

  // Drop unwanted contributes keys
  for (const k of opts.dropContribs ?? []) {
    delete pkg.contributes?.[k];
  }

  writeJson(path.join(dest, 'package.json'), pkg);
  console.log(extName, 'package.json written');

  // Copy all language-configuration files referenced in contributes.languages
  const langConfigs = new Set(
    (pkg.contributes?.languages ?? []).map(l => l.configuration).filter(Boolean)
  );
  for (const relPath of langConfigs) {
    const srcFile = path.join(src, relPath);
    const destFile = path.join(dest, relPath);
    if (!fs.existsSync(srcFile)) { console.warn('  missing', relPath); continue; }
    // Strip JSONC comments before writing (language-configuration.json uses them)
    writeJson(destFile, readJsonc(srcFile));
  }

  // Copy all grammar files referenced in contributes.grammars (verbatim — large binary-like JSON)
  for (const g of pkg.contributes?.grammars ?? []) {
    if (!g.path) continue;
    copyFile(path.join(src, g.path), path.join(dest, g.path));
  }

  console.log(extName, 'done\n');
}

// ── java ─────────────────────────────────────────────────────────────────────
setupExtension('java', {
  dropContribs: ['snippets', 'configurationDefaults'],
});

// ── cpp (keep c + cpp only, drop cuda-cpp) ───────────────────────────────────
setupExtension('cpp', {
  keepLangs: ['c', 'cpp'],
  dropContribs: ['problemPatterns', 'problemMatchers', 'snippets', 'configurationDefaults'],
});

// ── python ───────────────────────────────────────────────────────────────────
setupExtension('python', {
  dropContribs: ['configurationDefaults', 'configuration', 'problemPatterns', 'snippets'],
});

console.log('All extensions set up in', DEST);
