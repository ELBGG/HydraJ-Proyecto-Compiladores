const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },
  fileOps: {
    open:   ()                  => ipcRenderer.invoke('file:open'),
    save:   (filePath, content) => ipcRenderer.invoke('file:save',    { path: filePath, content }),
    saveAs: (content)           => ipcRenderer.invoke('file:save-as', { content }),
  },
  folderOps: {
    open:       ()                          => ipcRenderer.invoke('folder:open'),
    readDir:    (dirPath)                   => ipcRenderer.invoke('folder:read-dir',    { path: dirPath }),
    readFile:   (filePath)                  => ipcRenderer.invoke('folder:read-file',   { path: filePath }),
    createFile: (dirPath, name, content)    => ipcRenderer.invoke('folder:create-file', { dirPath, name, content }),
    createDir:  (dirPath, name)             => ipcRenderer.invoke('folder:create-dir',  { dirPath, name }),
    rename:     (path, newName)             => ipcRenderer.invoke('folder:rename',      { path, newName }),
    delete:     (path)                      => ipcRenderer.invoke('folder:delete',      { path }),
  },
  gitOps: {
    status:  (cwd)          => ipcRenderer.invoke('git:status',  { cwd }),
    init:    (cwd)          => ipcRenderer.invoke('git:init',    { cwd }),
    stage:   (cwd, paths)   => ipcRenderer.invoke('git:stage',   { cwd, paths }),
    unstage: (cwd, paths)   => ipcRenderer.invoke('git:unstage', { cwd, paths }),
    discard: (cwd, paths)   => ipcRenderer.invoke('git:discard', { cwd, paths }),
    commit:  (cwd, message) => ipcRenderer.invoke('git:commit',  { cwd, message }),
    pull:    (cwd)          => ipcRenderer.invoke('git:pull',    { cwd }),
    push:    (cwd)          => ipcRenderer.invoke('git:push',    { cwd }),
  },
  modelOps: {
    save: (id, data) => ipcRenderer.invoke('model:save', { id, data }),
    load: (id)       => ipcRenderer.invoke('model:load', { id }),
    download: (id, url) => ipcRenderer.invoke('model:download', { id, url }),
    onProgress: (cb) => {
      const handler = (_, pct) => cb(pct);
      ipcRenderer.on('model:progress', handler);
      return () => ipcRenderer.removeListener('model:progress', handler);
    },
  },
  runOps: {
    execute:         (opts)          => ipcRenderer.invoke('run:execute', opts),
    prepareTerminal: (code, language) => ipcRenderer.invoke('run:prepare-terminal', { code, language }),
    stop:            ()              => ipcRenderer.invoke('run:stop'),
    onOutput: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('run:output', handler);
      return () => ipcRenderer.removeListener('run:output', handler);
    },
  },
  extensionOps: {
    save:                (extensions)               => ipcRenderer.invoke('extensions:save', extensions),
    load:                ()                         => ipcRenderer.invoke('extensions:load'),
    queryMarketplace:    (text)                     => ipcRenderer.invoke('marketplace:query', { text }),
  },
  dialogOps: {
    openJson: () => ipcRenderer.invoke('dialog:open-json'),
  },
  appOps: {
    about: () => ipcRenderer.invoke('app:about'),
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  },
  settingsOps: {
    save: (values) => ipcRenderer.invoke('settings:save', values),
    load: ()       => ipcRenderer.invoke('settings:load'),
  },
  mappingOps: {
    saveCache: (languageId, json) => ipcRenderer.invoke('mappings:save-cache', { languageId, json }),
    loadCache: (languageId)       => ipcRenderer.invoke('mappings:load-cache', languageId),
  },
  mappingSourceOps: {
    save: (sources) => ipcRenderer.invoke('mapping-sources:save', sources),
    load: ()        => ipcRenderer.invoke('mapping-sources:load'),
  },
  aiOps: {
    // Proxies the AI interpreter's chat-completion request through the main process —
    // see main.cjs's 'ai:stream-start' handler for why (CORS on external APIs when
    // called directly from the renderer) and for why this streams (perceived latency).
    // Event-based rather than invoke/handle since main pushes 0+ chunk events before
    // the final result; requestId keys the events back to this specific call.
    streamChatCompletion: (params, onChunk) => {
      const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return new Promise((resolve) => {
        const handler = (_evt, payload) => {
          if (payload.requestId !== requestId) return;
          if (payload.type === 'chunk') {
            onChunk(payload.delta);
          } else if (payload.type === 'done') {
            ipcRenderer.removeListener('ai:stream-event', handler);
            resolve(payload);
          }
        };
        ipcRenderer.on('ai:stream-event', handler);
        ipcRenderer.send('ai:stream-start', { requestId, ...params });
      });
    },
  },
  terminalOps: {
    create:  (id, cwd)        => ipcRenderer.invoke('terminal:create', { id, cwd }),
    write:   (id, data)       => ipcRenderer.invoke('terminal:write',  { id, data }),
    resize:  (id, cols, rows) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
    kill:    (id)             => ipcRenderer.invoke('terminal:kill',   { id }),
    onData:  (id, cb) => {
      const handler = (_evt, data) => cb(data);
      ipcRenderer.on(`terminal:data:${id}`, handler);
      return () => ipcRenderer.removeListener(`terminal:data:${id}`, handler);
    },
    onExit:  (id, cb) => {
      const handler = (_evt, code) => cb(code);
      ipcRenderer.once(`terminal:exit:${id}`, handler);
      return () => ipcRenderer.removeListener(`terminal:exit:${id}`, handler);
    },
  },
});
