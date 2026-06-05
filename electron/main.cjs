const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'HydraCode',
    backgroundColor: '#1e1e1e',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:maximize', () => {
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.on('window:close', () => win?.close());

// ── File operations ──────────────────────────────────────────────────────────
ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Source Files', extensions: ['java', 'c', 'cpp', 'h'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const filePath = result.filePaths[0];
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return { canceled: false, path: filePath, content };
});

ipcMain.handle('file:save', async (_event, { path: filePath, content }) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('file:save-as', async (_event, { content }) => {
  const result = await dialog.showSaveDialog(win, {
    filters: [
      { name: 'Source Files', extensions: ['java', 'c', 'cpp', 'h'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  try {
    await fs.promises.writeFile(result.filePath, content, 'utf-8');
    return { canceled: false, path: result.filePath, success: true };
  } catch (err) {
    return { canceled: true, error: String(err) };
  }
});

// ── Folder operations ────────────────────────────────────────────────────────
ipcMain.handle('folder:open', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('folder:read-dir', async (_event, { path: dirPath }) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const mapped = entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    return { success: true, entries: mapped };
  } catch (err) {
    return { success: false, entries: [], error: String(err) };
  }
});

ipcMain.handle('folder:read-file', async (_event, { path: filePath }) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, content: '', error: String(err) };
  }
});

// ── Vosk model cache ─────────────────────────────────────────────────────────
ipcMain.handle('model:save', async (_event, { id, data }) => {
  try {
    const modelsDir = path.join(app.getPath('userData'), 'vosk-models');
    await fs.promises.mkdir(modelsDir, { recursive: true });
    await fs.promises.writeFile(path.join(modelsDir, `${id}.zip`), Buffer.from(data));
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('model:load', async (_event, { id }) => {
  try {
    const filePath = path.join(app.getPath('userData'), 'vosk-models', `${id}.zip`);
    const buf = await fs.promises.readFile(filePath);
    return { success: true, data: new Uint8Array(buf) };
  } catch {
    return { success: false };
  }
});

ipcMain.handle('model:download', async (event, { id, url }) => {
  try {
    const modelsDir = path.join(app.getPath('userData'), 'vosk-models');
    await fs.promises.mkdir(modelsDir, { recursive: true });
    const destPath = path.join(modelsDir, `${id}.zip`);

    await new Promise((resolve, reject) => {
      function get(targetUrl) {
        const mod = targetUrl.startsWith('https') ? require('https') : require('http');
        mod.get(targetUrl, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            return get(res.headers.location);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          const total = parseInt(res.headers['content-length'] || '0', 10);
          let loaded = 0;
          const chunks = [];
          res.on('data', (chunk) => {
            chunks.push(chunk);
            loaded += chunk.length;
            if (total > 0) event.sender.send('model:progress', Math.round(loaded / total * 100));
          });
          res.on('end', () => {
            fs.promises.writeFile(destPath, Buffer.concat(chunks)).then(resolve).catch(reject);
          });
          res.on('error', reject);
        }).on('error', reject);
      }
      get(url);
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('app:about', async () => {
  await dialog.showMessageBox(win, {
    type: 'info',
    title: 'About HydraCode',
    message: 'HydraCode',
    detail: 'Version 0.1.0\nMultilanguage transpiling IDE\n\nSupported languages: Java, C, C++\nHuman languages: Español\n\nBuilt with Electron + Vite + Monaco Editor',
    buttons: ['OK'],
  });
});

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
