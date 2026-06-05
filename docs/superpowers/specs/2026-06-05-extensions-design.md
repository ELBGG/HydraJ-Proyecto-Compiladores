# Extensions System Design — HydraCode

**Date:** 2026-06-05  
**Status:** Approved

---

## Overview

A VS Code-style extension panel in the sidebar that connects to the VS Code Marketplace API to discover and install language support extensions. Installing an extension activates syntax highlighting (via Monaco built-in language support) and Spanish keyword transpilation (via bundled mappings for Python, C, C++ or user-imported JSON for other languages).

---

## Architecture

### New files

```
src/workbench/parts/sidebar/
  extensionStore.ts       — VS Code Marketplace API client (queries via IPC)
  extensionRegistry.ts    — installed extension state, persistence, events
  extensionsPanel.ts      — sidebar UI (replaces current placeholder)

src/languages/
  python/PythonTokens.ts  — Python keyword/type token definitions
  python/PythonSpanish.ts — Spanish→Python mapping
  python/index.ts
  c/CSpanish.ts           — Spanish→C mapping (CTokens.ts already exists)
  cpp/CppSpanish.ts       — Spanish→C++ mapping (CppTokens.ts already exists)

electron/main.cjs         — 3 new IPC handlers: marketplace:query, extensions:save, extensions:load
electron/preload.cjs      — exposes extensionOps to renderer
```

### Existing files modified

- `src/workbench/parts/sidebar/sidebarPart.ts` — wire extensionsPanel into `case 'extensions'`
- `src/workbench/parts/statusbar/statusbarPart.ts` — dynamic language list (addLanguage/removeLanguage)
- `src/workbench/workbench.ts` — subscribe to extensionRegistry events, initialize on startup
- `src/languages/index.ts` — register C, C++, Python mappings on startup
- `src/workbench/parts/sidebar/sidebarPart.css` — extensions panel styles

---

## Data Model

### Installed extension record

```ts
interface InstalledExtension {
  id: string;          // "ms-python.python"
  name: string;        // "Python"
  publisher: string;   // "Microsoft"
  version: string;
  monacoLang: string;  // "python" — Monaco built-in language id
  mappingId: string | null;  // "python-es" | null (no bundled mapping)
  installedAt: number; // Unix timestamp
}
```

### Persistence

Saved to `{userData}/hydracode-extensions.json` as a JSON array.  
Custom user mappings saved to `{userData}/hydracode-mappings/{langId}.json`.

### Bundled mapping IDs

| mappingId  | language | status    |
|------------|----------|-----------|
| `java-es`  | Java     | existing  |
| `python-es`| Python   | new       |
| `c-es`     | C        | new       |
| `cpp-es`   | C++      | new       |

---

## VS Code Marketplace API

**Endpoint:** `POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery`

All requests are made from `electron/main.cjs` via Node.js `https` to avoid CORS restrictions in the renderer.

**Query body:**
```json
{
  "filters": [{
    "criteria": [
      { "filterType": 8,  "value": "Microsoft.VisualStudio.Code" },
      { "filterType": 5,  "value": "Programming Languages" },
      { "filterType": 10, "value": "<searchText>" }
    ],
    "pageSize": 20,
    "pageNumber": 1
  }],
  "flags": 512
}
```

**Normalized response** returned to renderer:
```ts
interface MarketplaceExtension {
  id: string;
  name: string;
  publisher: string;
  description: string;
  version: string;
  iconUrl: string | null;
  downloads: number;
  monacoLang: string | null;  // null = unsupported in Monaco
}
```

**`monacoLang` detection** — static lookup table in `extensionStore.ts`:
```ts
const MARKETPLACE_TO_MONACO: Record<string, string> = {
  'ms-python.python':          'python',
  'ms-vscode.cpptools':        'cpp',
  'golang.go':                 'go',
  'rust-lang.rust-analyzer':   'rust',
  'ms-dotnettools.csharp':     'csharp',
  'redhat.java':               'java',
  'vscjava.vscode-java-pack':  'java',
  'ms-vscode.powershell':      'powershell',
  'ms-vscode.vscode-typescript-next': 'typescript',
  'dbaeumer.vscode-eslint':    'javascript',
  'golang.go-nightly':         'go',
  'swift.swift-lang':          'swift',
  'vadimcn.vscode-lldb':       'cpp',
  'ms-vscode.cmake-tools':     'cpp',
  'ms-vscode.mono-debug':      'csharp',
  'kotlin.kotlin':             'kotlin',
  'fwcd.kotlin':               'kotlin',
  'scalameta.metals':          'scala',
  'mathiasfrohlich.kotlin':    'kotlin',
  'ms-vscode.ruby':            'ruby',
  'rebornix.ruby':             'ruby',
};
```

Extensions with `monacoLang: null` are shown in results but "Install" is disabled with tooltip "Lenguaje no soportado por el editor aún."

---

## Extensions Panel UI

Rendered in sidebar when `case 'extensions'` is active. Replaces the current `_renderPlaceholder` call.

**Layout:**
```
┌─────────────────────────────────┐
│ [🔍 Buscar extensiones...     ] │
├─────────────────────────────────┤
│ INSTALADAS (n)                  │
│  ● Python        Microsoft  ✓   │
│  ● C/C++         Microsoft  ✓   │
├─────────────────────────────────┤
│ RESULTADOS                      │
│  ┌──────────────────────────┐   │
│  │  Python                  │   │
│  │  Microsoft · 50M inst    │   │
│  │  Python language support │   │
│  │               [Install]  │   │
│  └──────────────────────────┘   │
├─────────────────────────────────┤
│ [+ Importar mapping JSON]       │
└─────────────────────────────────┘
```

**Button states:**
- `[Install]` — monacoLang known, not installed
- `[Instalado ✓]` — already installed; click uninstalls
- `[No soportado]` — monacoLang null; disabled

**Search behavior:**
- Empty input → top popular language extensions (initial query with `"language support"`)
- Typing → 400ms debounce → `extensionStore.search(text)`
- Loading spinner while waiting for marketplace response

**Import mapping:**
- Opens native file dialog via Electron IPC (`dialog:openFile` filter: `.json`)
- Validates JSON schema: `{ langId, keywords, types }`
- Saves to `userData/hydracode-mappings/{langId}.json`
- Shows success/error toast in panel

---

## Language Activation Flow

### On install

```ts
extensionRegistry.onDidInstall(({ monacoLang, mappingId }) => {
  if (mappingId) {
    const mapping = loadBundledMapping(mappingId);    // or userData mapping
    if (mapping) LanguageRegistry.register(monacoLang, mapping);
  }
  statusbar.addLanguage(monacoLang);
});
```

Monaco activates built-in language support automatically when `editor.setModelLanguage(model, monacoLang)` is called — no extra configuration needed.

### On uninstall

```ts
extensionRegistry.onDidUninstall(({ monacoLang }) => {
  statusbar.removeLanguage(monacoLang);
  // LanguageRegistry mapping stays registered (harmless)
});
```

### On app startup

`Workbench` calls `extensionRegistry.loadInstalled()` before rendering, which replays all `onDidInstall` events for persisted extensions. Java is always active as a true built-in (not managed by extensionRegistry).

C and C++ are **pre-installed extensions**: if `hydracode-extensions.json` is absent or empty, `extensionRegistry` seeds it with C and C++ entries on first run. This means they appear as installed in the panel from the start and are added to the statusbar cycle via the normal `onDidInstall` flow — no special casing needed.

---

## StatusBar Changes

`_progLangs` changes from a static `['java', 'cpp', 'c']` array to a dynamic list:

```ts
private _progLangs: string[] = ['java'];  // java always present

addLanguage(lang: string): void {
  if (!this._progLangs.includes(lang)) {
    this._progLangs.push(lang);
    this._updateLanguageDisplay();
  }
}

removeLanguage(lang: string): void {
  this._progLangs = this._progLangs.filter(l => l !== lang);
  if (this._currentProgLang === lang) {
    this._currentProgLang = 'java';
    this._onLanguageChange.fire({ progLang: 'java', humanLang: this._currentHumanLang });
  }
  this._updateLanguageDisplay();
}
```

---

## Bundled Spanish Mappings

### Python (`python-es`)

```ts
keywords: {
  'para': 'for', 'si': 'if', 'sino': 'else', 'mientras': 'while',
  'retornar': 'return', 'importar': 'import', 'clase': 'class',
  'funcion': 'def', 'en': 'in', 'y': 'and', 'o': 'or', 'no': 'not',
  'intentar': 'try', 'excepto': 'except', 'finalmente': 'finally',
  'con': 'with', 'como': 'as', 'pasar': 'pass', 'continuar': 'continue',
  'romper': 'break', 'del': 'del', 'lambda': 'lambda', 'rendimiento': 'yield',
  'global': 'global', 'nonlocal': 'nonlocal', 'elevar': 'raise',
  'afirmar': 'assert', 'desde': 'from',
}
types: {
  'entero': 'int', 'texto': 'str', 'lista': 'list', 'diccionario': 'dict',
  'conjunto': 'set', 'tupla': 'tuple', 'flotante': 'float',
  'complejo': 'complex', 'booleano': 'bool', 'bytes': 'bytes',
  'verdadero': 'True', 'falso': 'False', 'nulo': 'None',
}
```

### C (`c-es`)

```ts
keywords: {
  'para': 'for', 'si': 'if', 'sino': 'else', 'mientras': 'while',
  'hacer': 'do', 'retornar': 'return', 'romper': 'break',
  'continuar': 'continue', 'cambiar': 'switch', 'caso': 'case',
  'predeterminado': 'default', 'ir_a': 'goto', 'typedef': 'typedef',
  'estructura': 'struct', 'union': 'union', 'enum': 'enum',
  'externo': 'extern', 'estatico': 'static', 'volatil': 'volatile',
  'const': 'const', 'registrar': 'register', 'auto': 'auto',
}
types: {
  'entero': 'int', 'flotante': 'float', 'caracter': 'char',
  'vacio': 'void', 'doble': 'double', 'largo': 'long',
  'corto': 'short', 'sin_signo': 'unsigned', 'con_signo': 'signed',
}
```

### C++ (`cpp-es`)

Inherits all C mappings plus:
```ts
keywords: {
  'clase': 'class', 'nuevo': 'new', 'eliminar': 'delete',
  'publico': 'public', 'privado': 'private', 'protegido': 'protected',
  'virtual': 'virtual', 'heredar': 'using', 'espacio_nombres': 'namespace',
  'intentar': 'try', 'capturar': 'catch', 'lanzar': 'throw',
  'plantilla': 'template', 'tipoid': 'typename', 'en_linea': 'inline',
  'amigo': 'friend', 'this': 'this', 'operador': 'operator',
}
types: {
  'cadena': 'string', 'vector': 'vector', 'booleano': 'bool',
  'mapa': 'map', 'conjunto': 'set', 'par': 'pair',
  'verdadero': 'true', 'falso': 'false', 'nulo': 'nullptr',
}
```

C and C++ mappings are loaded by `extensionRegistry` during startup (via the pre-installed seed), so they follow the same path as any installed extension.

---

## IPC Summary

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `marketplace:query` | renderer→main | Query VS Code Marketplace API |
| `extensions:save` | renderer→main | Persist installed list to userData |
| `extensions:load` | renderer→main | Load installed list from userData |
| `dialog:openFile` | renderer→main | Open native file picker (for mapping import) |

`dialog:openFile` may already exist; if not, a minimal handler is added.

---

## Out of Scope

- Downloading or executing `.vsix` files
- Language servers (LSP)
- Extension settings/configuration UI
- Extension updates/version management
- Non-language extensions (themes, keymaps, etc.)
