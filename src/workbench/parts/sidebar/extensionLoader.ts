const _pkgFiles = import.meta.glob('/extensions/*/package.json', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

interface LangEntry {
  scopeName: string;
  configPath: string | null;
  fileExts: string[];
}

const _langMap = new Map<string, LangEntry>();   // monacoLangId → entry
const _scopeToPath = new Map<string, string>();  // scopeName → /extensions/…/foo.tmLanguage.json
const _extToLang = new Map<string, string>();    // '.java' → 'java'

async function _init(): Promise<void> {
  for (const [pkgKey, loader] of Object.entries(_pkgFiles)) {
    let pkg: any;
    try { pkg = JSON.parse(await loader()); } catch { continue; }

    const extDir = pkgKey.replace(/\/package\.json$/, ''); // '/extensions/java'
    const abs = (rel: string) => extDir + '/' + rel.replace(/^\.\//, '');

    for (const g of pkg.contributes?.grammars ?? []) {
      if (g.scopeName && g.path) _scopeToPath.set(g.scopeName, abs(g.path));
    }

    for (const l of pkg.contributes?.languages ?? []) {
      if (!l.id) continue;
      // A language id can have multiple grammar entries (e.g. cpp/package.json lists an
      // embedded-macro partial grammar before the real "source.cpp" grammar) — prefer the
      // one whose scopeName matches the conventional "source.<langId>" primary scope,
      // rather than blindly taking the first match.
      const candidates = (pkg.contributes?.grammars ?? []).filter((g: any) => g.language === l.id);
      const primary = candidates.find((g: any) => g.scopeName === `source.${l.id}`);
      const grammar = primary ?? candidates[0];
      _langMap.set(l.id, {
        scopeName: grammar?.scopeName ?? '',
        configPath: l.configuration ? abs(l.configuration) : null,
        fileExts: l.extensions ?? [],
      });
      for (const ext of l.extensions ?? []) {
        _extToLang.set(ext.toLowerCase(), l.id);
      }
    }
  }
}

// Eagerly kicked off at module load; consumers await waitReady() before querying.
const _ready = _init();

export async function waitReady(): Promise<void> { await _ready; }

export function getScopeForLang(monacoLangId: string): string {
  return _langMap.get(monacoLangId)?.scopeName ?? '';
}

export function getGrammarPath(scopeName: string): string {
  return _scopeToPath.get(scopeName) ?? '';
}

export function getAllScopePaths(): ReadonlyMap<string, string> {
  return _scopeToPath;
}

/** File-extension → Monaco language id (e.g. '.java' → 'java'). */
export function getExtToLangMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ext, lang] of _extToLang) out[ext] = lang;
  return out;
}

/**
 * Returns one entry per primary language in bundled extensions.
 * Return type is inferred — structurally compatible with InstalledExtension from extensionRegistry.ts.
 * NOT importing InstalledExtension here to avoid a circular module dependency
 * (extensionRegistry.ts imports extensionLoader.ts).
 */
export function getBuiltinExtensions() {
  const result = [];
  for (const [id, info] of _langMap) {
    if (!info.scopeName) continue;
    result.push({
      id: `builtin.${id}`,
      displayName: id.charAt(0).toUpperCase() + id.slice(1),
      languages: [{ id, extensions: info.fileExts }],
      grammars: [{ language: id, scopeName: info.scopeName, path: getGrammarPath(info.scopeName) }],
      installPath: `extensions/${id}`,
      builtin: true as const,
    });
  }
  return result;
}
