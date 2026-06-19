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
    open:     ()         => ipcRenderer.invoke('folder:open'),
    readDir:  (dirPath)  => ipcRenderer.invoke('folder:read-dir',  { path: dirPath }),
    readFile: (filePath) => ipcRenderer.invoke('folder:read-file', { path: filePath }),
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
    execute:  (opts)  => ipcRenderer.invoke('run:execute', opts),
    stop:     ()      => ipcRenderer.invoke('run:stop'),
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
    readExampleMapping:  (filename)                 => ipcRenderer.invoke('extensions:read-example-mapping', { filename }),
  },
  dialogOps: {
    openJson: () => ipcRenderer.invoke('dialog:open-json'),
  },
  appOps: {
    about: () => ipcRenderer.invoke('app:about'),
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
