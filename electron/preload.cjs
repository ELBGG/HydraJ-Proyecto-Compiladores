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
  appOps: {
    about: () => ipcRenderer.invoke('app:about'),
  },
});
