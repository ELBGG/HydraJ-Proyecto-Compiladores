// ── Electron API types (exposed via contextBridge in preload.cjs) ──
// These must mirror what the ipcMain handlers in electron/main.cjs actually return.

interface ElectronWindowControls {
  minimize(): void;
  maximize(): void;
  close():    void;
}

interface ElectronFileOps {
  open():                                   Promise<{ canceled: true } | { canceled: false; path: string; content: string }>;
  save(filePath: string, content: string):  Promise<{ success: boolean; error?: string }>;
  saveAs(content: string):                  Promise<{ canceled: true; error?: string } | { canceled: false; success: true; path: string }>;
}

interface ElectronDirEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

interface ElectronFolderOps {
  open():                                   Promise<{ canceled: true } | { canceled: false; path: string }>;
  readDir(dirPath: string):                 Promise<{ success: boolean; entries: ElectronDirEntry[]; error?: string }>;
  readFile(filePath: string):               Promise<{ success: boolean; content: string; error?: string }>;
  createFile(dirPath: string, name: string, content: string): Promise<{ success: boolean; path?: string; error?: string }>;
  createDir(dirPath: string, name: string): Promise<{ success: boolean; path?: string; error?: string }>;
  rename(path: string, newName: string):    Promise<{ success: boolean; path?: string; error?: string }>;
  /** Moves to the OS Recycle Bin/Trash (shell.trashItem in main.cjs), not a hard delete. */
  delete(path: string):                     Promise<{ success: boolean; error?: string }>;
}

interface ElectronModelOps {
  save(id: string, data: ArrayBuffer):             Promise<{ success: boolean; error?: string }>;
  load(id: string):                                 Promise<{ success: boolean; data?: Uint8Array; error?: string }>;
  download(id: string, url: string):                Promise<{ success: boolean; error?: string }>;
  onProgress(cb: (pct: number) => void):             () => void;
}

interface ElectronRunOps {
  execute(opts: { code: string; language: string; debug?: boolean }):  Promise<{ exitCode: number; error?: string }>;
  prepareTerminal(code: string, language: string):                     Promise<{ success: true; command: string } | { success: false; error: string }>;
  stop():                                                                Promise<{ success: boolean }>;
  onOutput(cb: (data: { text: string; type: 'stdout' | 'stderr' | 'info' }) => void): () => void;
}

interface ElectronExtensionOps {
  save(extensions: unknown[]):                       Promise<{ success: boolean; error?: string }>;
  load():                                            Promise<{ success: boolean; extensions: unknown[]; error?: string }>;
  queryMarketplace(text: string):                     Promise<{ success: boolean; extensions: unknown[]; error?: string }>;
}

interface ElectronDialogOps {
  openJson():                                        Promise<{ canceled: true } | { canceled: false; content: string; error?: undefined } | { canceled: false; content?: undefined; error: string }>;
}

interface ElectronAppOps {
  about():                                           Promise<void>;
  /** Triggers an update check against the GitHub Releases of this project. Actual
   *  found/not-found/downloaded feedback is shown via native dialogs from the main
   *  process itself (see main.cjs's setupAutoUpdater) — this promise only reports
   *  whether the check could be *started* at all (e.g. fails outside a packaged
   *  build, where there's no app-update.yml to read a provider from). */
  checkForUpdates():                                 Promise<{ success: boolean; error?: string }>;
}

/** Flat, dot-namespaced settings blob (e.g. { "editor.fontSize": 13, "ai.apiKey": "..." })
 *  — mirrors settingsRegistry.ts's SettingDefinition.id keys and VS Code's own
 *  settings.json shape. Kept as an index signature here (not a fixed interface) since
 *  the renderer-side schema (src/workbench/parts/sidebar/settingsRegistry.ts) is the
 *  actual source of truth for which keys exist; this file only needs to describe what
 *  the IPC boundary carries. */
interface HydraSettingsValues {
  [settingId: string]: string | number | boolean;
}

interface ElectronSettingsOps {
  save(values: HydraSettingsValues):                 Promise<{ success: boolean; error?: string }>;
  load():                                            Promise<{ success: boolean; values: HydraSettingsValues | null }>;
}

/** The AI interpreter's chat-completion request, proxied through the main process
 *  instead of a renderer fetch() — see main.cjs's 'ai:stream-start' handler for why
 *  (CORS on external APIs when called directly from a contextIsolation'd renderer;
 *  Node's fetch in main isn't subject to it) and for why it streams (perceived latency
 *  on a large model over a free-tier endpoint). `body` must set stream:true. */
interface AIChatCompletionRequest {
  url: string;
  apiKey: string;
  /** Pre-serialized JSON request body (aiInterpreter.ts already does JSON.stringify). */
  body: string;
}

interface AIStreamChatCompletionResult {
  ok: boolean;
  status: number;
  statusText: string;
  /** Full accumulated text (every onChunk delta concatenated) — only set when ok. */
  content?: string;
  /** Raw error response body — only set when !ok and a real HTTP response came back. */
  bodyText?: string;
  /** Set instead when the request never reached the network (DNS failure, connection
   *  refused, etc.) — ok is false and status is 0 in this case. */
  networkError?: string;
}

interface ElectronAIOps {
  /** Resolves once the stream ends, but `onChunk` fires synchronously for every delta
   *  as it arrives — callers should render each delta immediately rather than wait for
   *  the returned promise if they want a live "typing" effect. */
  streamChatCompletion(req: AIChatCompletionRequest, onChunk: (delta: string) => void): Promise<AIStreamChatCompletionResult>;
}

/** Local disk cache for a mapping fetched from a GitHub repo — mirrors ElectronModelOps'
 *  shape (raw content in, raw content out; the renderer owns parsing/validation via
 *  parseMappingFile()). Keyed by languageId, one JSON file each under
 *  userData/mappings/ — see githubMappingService.ts for why this exists (offline
 *  resilience: the last successfully-fetched mapping keeps working with no network). */
interface ElectronMappingOps {
  saveCache(languageId: string, json: string): Promise<{ success: boolean; error?: string }>;
  loadCache(languageId: string):                Promise<{ success: boolean; json: string | null }>;
}

/** {languageId, repoUrl} pairs — kept as a loose index signature the same way
 *  HydraSettingsValues is, since mappingSourceStore.ts (the actual source of truth for
 *  the shape) is renderer-side, not this IPC-boundary type file. */
interface HydraMappingSource {
  languageId: string;
  humanLangId: string;
  repoUrl: string;
}

interface ElectronMappingSourceOps {
  save(sources: HydraMappingSource[]): Promise<{ success: boolean; error?: string }>;
  load():                              Promise<{ success: boolean; sources: HydraMappingSource[] | null }>;
}

interface HydraGitFileEntry {
  path: string;
  /** Raw porcelain status letter: M/A/D/R/C/U, or '?' for untracked. */
  status: string;
}

interface HydraGitStatusResult {
  success: boolean;
  isRepo: boolean;
  error?: string;
  branch?: string;
  /** Absolute path to the repo's top-level directory (git rev-parse --show-toplevel) —
   *  every path in staged/unstaged is relative to this, not necessarily to the workspace
   *  folder that was opened (which may be a subdirectory of the repo). */
  root?: string;
  staged?: HydraGitFileEntry[];
  unstaged?: HydraGitFileEntry[];
}

interface HydraGitResult {
  success: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
}

interface ElectronGitOps {
  status(cwd: string):                              Promise<HydraGitStatusResult>;
  init(cwd: string):                                Promise<HydraGitResult>;
  stage(cwd: string, paths: string[] | 'all'):      Promise<HydraGitResult>;
  unstage(cwd: string, paths: string[] | 'all'):    Promise<HydraGitResult>;
  discard(cwd: string, paths: string[] | 'all'):    Promise<HydraGitResult>;
  commit(cwd: string, message: string):             Promise<HydraGitResult>;
  pull(cwd: string):                                Promise<HydraGitResult>;
  push(cwd: string):                                Promise<HydraGitResult>;
}

interface ElectronTerminalOps {
  create(id: string, cwd?: string):                  Promise<{ success: boolean; error?: string }>;
  write(id: string, data: string):                   Promise<{ success: boolean }>;
  resize(id: string, cols: number, rows: number):    Promise<{ success: boolean }>;
  kill(id: string):                                  Promise<{ success: boolean }>;
  onData(id: string, cb: (data: string) => void):     () => void;
  onExit(id: string, cb: (code: number) => void):     () => void;
}

interface ElectronAPI {
  platform:      string;
  isElectron:    boolean;
  windowControls: ElectronWindowControls;
  fileOps:       ElectronFileOps;
  folderOps:     ElectronFolderOps;
  modelOps:      ElectronModelOps;
  runOps:        ElectronRunOps;
  extensionOps:  ElectronExtensionOps;
  dialogOps:     ElectronDialogOps;
  appOps:        ElectronAppOps;
  terminalOps:   ElectronTerminalOps;
  settingsOps:   ElectronSettingsOps;
  aiOps:         ElectronAIOps;
  mappingOps:    ElectronMappingOps;
  mappingSourceOps: ElectronMappingSourceOps;
  gitOps:        ElectronGitOps;
}

interface Window {
  electronAPI?: ElectronAPI;
  HydraCode?: Record<string, unknown>;
}
