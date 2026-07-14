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
  readExampleMapping(filename: string):               Promise<{ success: true; content: string } | { success: false; error: string }>;
}

interface ElectronDialogOps {
  openJson():                                        Promise<{ canceled: true } | { canceled: false; content: string; error?: undefined } | { canceled: false; content?: undefined; error: string }>;
}

interface ElectronAppOps {
  about():                                           Promise<void>;
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
}

interface Window {
  electronAPI?: ElectronAPI;
  HydraCode?: Record<string, unknown>;
}
