export interface MarketplaceExtension {
  id: string;
  name: string;
  publisher: string;
  description: string;
  version: string;
  iconUrl: string | null;
  downloads: number;
  monacoLang: string | null;
}

const MARKETPLACE_TO_MONACO: Record<string, string> = {
  'ms-python.python':                     'python',
  'ms-vscode.cpptools':                   'cpp',
  'golang.go':                            'go',
  'golang.go-nightly':                    'go',
  'rust-lang.rust-analyzer':              'rust',
  'matklad.rust-analyzer':                'rust',
  'ms-dotnettools.csharp':                'csharp',
  'ms-dotnettools.vscode-dotnet-runtime': 'csharp',
  'redhat.java':                          'java',
  'vscjava.vscode-java-pack':             'java',
  'ms-vscode.powershell':                 'powershell',
  'ms-vscode.vscode-typescript-next':     'typescript',
  'dbaeumer.vscode-eslint':               'javascript',
  'esbenp.prettier-vscode':              'javascript',
  'sswg.swift-lang':                      'swift',
  'swift-lang.swift':                     'swift',
  'vadimcn.vscode-lldb':                  'cpp',
  'ms-vscode.cmake-tools':               'cpp',
  'ms-vscode.mono-debug':                 'csharp',
  'kotlin.kotlin':                        'kotlin',
  'fwcd.kotlin':                          'kotlin',
  'mathiasfrohlich.kotlin':               'kotlin',
  'scalameta.metals':                     'scala',
  'ms-vscode.ruby':                       'ruby',
  'rebornix.ruby':                        'ruby',
  'Shopify.ruby-lsp':                     'ruby',
  'dart-code.dart-code':                  'dart',
  'dart-code.flutter':                    'dart',
  'julialang.language-julia':             'julia',
  'ms-toolsai.jupyter':                   'python',
  'ms-vscode.makefile-tools':             'cpp',
  'GitHub.copilot':                       'copilot',
  'GitHub.copilot-chat':                  'copilot',
  'ms-vscode.vscode-extension-template':  'generic',
  'formulahendry.code-runner':            'generic',
  'eamodio.gitlens':                      'generic',
  'PKief.material-icon-theme':            'generic',
  'aaron-bond.better-comments':           'generic',
  'streetsidesoftware.code-spell-checker':'generic',
  'yzhang.markdown-all-in-one':           'markdown',
  'shd101wyy.markdown-preview-enhanced':  'markdown',
  'DavidAnson.vscode-markdownlint':       'markdown',
  'mikestead.dotenv':                     'generic',
  'tamasfe.even-better-toml':             'toml',
  'redhat.vscode-yaml':                   'yaml',
  'redhat.vscode-xml':                    'xml',
  'hediet.vscode-drawio':                 'generic',
  'bierner.markdown-mermaid':             'markdown',
  'adpyke.vscode-sql-formatter':          'sql',
  'mtxr.sqltools':                        'sql',
  'ms-azuretools.vscode-docker':          'dockerfile',
  'mhutchie.git-graph':                   'generic',
  'ms-vscode-remote.remote-ssh':          'generic',
  'ms-vscode-remote.remote-containers':   'generic',
  'ms-vscode.live-server':               'javascript',
  'ecmel.vscode-html-css':               'html',
};

const LANG_FROM_EXTENSION_NAME: Record<string, string> = {
  'java': 'java', 'python': 'python', 'javascript': 'javascript', 'typescript': 'typescript',
  'csharp': 'csharp', 'cpp': 'cpp', 'c': 'c', 'go': 'go', 'rust': 'rust', 'swift': 'swift',
  'kotlin': 'kotlin', 'scala': 'scala', 'ruby': 'ruby', 'dart': 'dart', 'julia': 'julia',
  'sql': 'sql', 'html': 'html', 'css': 'css', 'yaml': 'yaml', 'xml': 'xml', 'toml': 'toml',
  'json': 'json', 'markdown': 'markdown', 'dockerfile': 'dockerfile', 'powershell': 'powershell',
  'bash': 'bash', 'shell': 'bash', 'lua': 'lua', 'php': 'php', 'perl': 'perl', 'r': 'r',
  'haskell': 'haskell', 'ocaml': 'ocaml', 'zig': 'zig', 'nim': 'nim', 'crystal': 'crystal',
  'fortran': 'fortran', 'cobol': 'cobol', 'ada': 'ada', 'lisp': 'lisp', 'scheme': 'scheme',
  'clojure': 'clojure', 'elixir': 'elixir', 'erlang': 'erlang', 'fsharp': 'fsharp',
  'groovy': 'groovy', 'graphql': 'graphql', 'protobuf': 'protobuf', 'thrift': 'thrift',
  'makefile': 'cpp', 'cmake': 'cpp', 'gradle': 'groovy', 'maven': 'java',
};

function inferLanguageFromExtension(ext: any): string | null {
  const publisherName: string = ext.publisher?.publisherName ?? '';
  const extensionName: string = ext.extensionName ?? '';
  const id = `${publisherName}.${extensionName}`;
  const displayName: string = ext.displayName ?? extensionName;

  if (MARKETPLACE_TO_MONACO[id]) return MARKETPLACE_TO_MONACO[id];

  // Try to infer from extension name
  const nameLower = extensionName.toLowerCase();
  const displayLower = displayName.toLowerCase();

  for (const [langName, langId] of Object.entries(LANG_FROM_EXTENSION_NAME)) {
    if (nameLower.includes(langName) || nameLower === langName ||
        displayLower.includes(langName) || displayLower === langName) {
      return langId;
    }
  }

  // Try from publisher name (e.g. "redhat" → java, "ms-python" → python)
  const pubLower = publisherName.toLowerCase();
  for (const [langName, langId] of Object.entries(LANG_FROM_EXTENSION_NAME)) {
    if (pubLower.includes(langName)) return langId;
  }

  // Try from categories
  const categories: string[] = ext.categories ?? [];
  for (const cat of categories) {
    const catLower = cat.toLowerCase();
    for (const [langName, langId] of Object.entries(LANG_FROM_EXTENSION_NAME)) {
      if (catLower.includes(langName)) return langId;
    }
  }

  return null;
}

export class ExtensionStore {
  async search(text: string): Promise<MarketplaceExtension[]> {
    const api = (window as any).electronAPI;
    if (!api) return [];
    const result = await api.extensionOps.queryMarketplace(text || 'popular');
    if (!result.success || !Array.isArray(result.extensions)) return [];
    return result.extensions
      .map((ext: any) => this._normalize(ext))
      .filter((ext: MarketplaceExtension) => ext.id !== '.');
  }

  private _normalize(ext: any): MarketplaceExtension {
    const publisherName: string = ext.publisher?.publisherName ?? '';
    const extensionName: string = ext.extensionName ?? '';
    const id = `${publisherName}.${extensionName}`;
    const version: string = ext.versions?.[0]?.version ?? '0.0.0';
    const installs: number =
      ext.statistics?.find((s: any) => s.statisticName === 'install')?.value ?? 0;
    const iconFile = ext.versions?.[0]?.files?.find(
      (f: any) => f.assetType === 'Microsoft.VisualStudio.Services.Icons.Default',
    );
    return {
      id,
      name: ext.displayName ?? extensionName,
      publisher: publisherName,
      description: ext.shortDescription ?? '',
      version,
      iconUrl: iconFile?.source ?? null,
      downloads: installs,
      monacoLang: MARKETPLACE_TO_MONACO[id] ?? inferLanguageFromExtension(ext),
    };
  }
}
