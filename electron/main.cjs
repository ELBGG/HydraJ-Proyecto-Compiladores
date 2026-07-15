const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'HydraCode',
    backgroundColor: '#12161f',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Surfaces the exact reason (crashed/oom/killed/launch-failed/...) if the renderer
  // process ever dies unexpectedly, instead of the window just silently closing with
  // no trace of why in this log.
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[HydraCode] Renderer process gone:', details);
  });

  // Forwards renderer console.* calls (including uncaught JS errors, which the
  // renderer logs to its own console) into this process's stdout — otherwise they're
  // only visible in DevTools, invisible to this log file.
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelName = ['LOG', 'WARN', 'ERROR'][level] ?? 'INFO';
    console.log(`[renderer:${levelName}] ${message} (${sourceId}:${line})`);
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
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
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { canceled: false, path: filePath, content };
  } catch (err) {
    return { canceled: true, error: String(err) };
  }
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

ipcMain.handle('folder:create-file', async (_event, { dirPath, name, content }) => {
  const filePath = safeChildPath(dirPath, name);
  if (!filePath) return { success: false, error: 'Nombre de archivo inválido.' };
  try {
    // flag 'wx': create-only, fails with EEXIST instead of silently overwriting — the
    // safe way to do this (an exists-check followed by a separate write has a race
    // between the two calls; this is atomic).
    await fs.promises.writeFile(filePath, content ?? '', { encoding: 'utf-8', flag: 'wx' });
    return { success: true, path: filePath };
  } catch (err) {
    if (err.code === 'EEXIST') return { success: false, error: 'Ya existe un archivo con ese nombre.' };
    return { success: false, error: String(err) };
  }
});

// ── Path safety ───────────────────────────────────────────────────────────────
// Resolves `name` against `baseDir`, stripping any directory-traversal
// components, and rejects the result unless it stays contained within
// `baseDir`. Returns the safe absolute path, or null if `name` is
// invalid/would escape the base directory.
function safeChildPath(baseDir, name) {
  try {
    const resolvedBase = path.resolve(baseDir);
    const safeName = path.basename(String(name));
    if (!safeName || safeName === '.' || safeName === '..') return null;
    const resolvedPath = path.resolve(resolvedBase, safeName);
    if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + path.sep)) {
      return null;
    }
    return resolvedPath;
  } catch {
    return null;
  }
}

// ── Vosk model cache ─────────────────────────────────────────────────────────
ipcMain.handle('model:save', async (_event, { id, data }) => {
  try {
    const modelsDir = path.join(app.getPath('userData'), 'vosk-models');
    await fs.promises.mkdir(modelsDir, { recursive: true });
    const filePath = safeChildPath(modelsDir, `${id}.zip`);
    if (!filePath) return { success: false, error: 'Invalid model id' };
    await fs.promises.writeFile(filePath, Buffer.from(data));
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('model:load', async (_event, { id }) => {
  try {
    const modelsDir = path.join(app.getPath('userData'), 'vosk-models');
    const filePath = safeChildPath(modelsDir, `${id}.zip`);
    if (!filePath) return { success: false };
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

// ── Code execution ───────────────────────────────────────────────────────────
let _runningProcess = null;
let _wslChecked = false;
let _wslAvailable = false;

async function checkWsl() {
  if (_wslChecked) return _wslAvailable;
  _wslChecked = true;
  try {
    execSync('wsl.exe --version', { timeout: 5000, stdio: 'ignore' });
    _wslAvailable = true;
  } catch {
    _wslAvailable = false;
  }
  return _wslAvailable;
}

ipcMain.handle('run:execute', async (event, { code, language, debug }) => {
  const { spawn } = require('child_process');
  const os = require('os');

  if (_runningProcess) {
    try { _runningProcess.kill(); } catch {}
    _runningProcess = null;
  }

  const runDir = path.join(os.tmpdir(), 'hydracode-run');
  try { await fs.promises.mkdir(runDir, { recursive: true }); } catch {}

  const send = (text, type) => {
    try { event.sender.send('run:output', { text, type }); } catch {}
  };

  const attachOutput = (proc) => {
    proc.stdout.on('data', d => send(d.toString(), 'stdout'));
    proc.stderr.on('data', d => send(d.toString(), 'stderr'));
  };

  // Tracks `proc` as the single module-level "running process" so run:stop
  // can kill it and so it's bounded by a timeout, regardless of whether
  // `proc` is a compiler (javac/gcc/g++) or the actual execution step.
  const execWithTimeout = (proc, timeoutMs = 30000, onError) => new Promise((resolve) => {
    _runningProcess = proc;
    const timer = setTimeout(() => {
      if (_runningProcess === proc) {
        try { proc.kill(); } catch {}
        _runningProcess = null;
        send('\n[Tiempo de ejecución excedido (30s)]\n', 'info');
        resolve(1);
      }
    }, timeoutMs);
    proc.on('close', code => { clearTimeout(timer); if (_runningProcess === proc) _runningProcess = null; resolve(code); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      if (onError) onError(err); else send(`\nError al iniciar proceso: ${err.message}\n`, 'stderr');
      if (_runningProcess === proc) _runningProcess = null;
      resolve(1);
    });
  });

  try {
    // ── Java ──
    if (language === 'java') {
      const classMatch = code.match(/(?:public\s+)?class\s+(\w+)/);
      const className = classMatch ? classMatch[1] : 'Main';
      const filePath = path.join(runDir, `${className}.java`);
      await fs.promises.writeFile(filePath, code, 'utf-8');

      const javacArgs = ['-d', runDir];
      if (debug) javacArgs.unshift('-g');
      javacArgs.push(filePath);

      send(`Compilando ${className}.java...\n`, 'info');
      const compileProc = spawn('javac', javacArgs, { cwd: runDir });
      attachOutput(compileProc);
      const compiled = await execWithTimeout(compileProc, 30000, () => {
        send(`\nError: javac no encontrado. Asegúrate de tener JDK instalado.\n`, 'stderr');
      });

      if (compiled !== 0) return { exitCode: compiled };

      send(`Ejecutando ${className}...\n\n`, 'info');
      const javaArgs = ['-cp', runDir];
      if (debug) javaArgs.unshift('-Xdebug', '-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=5005');
      javaArgs.push(className);
      return { exitCode: await execWithTimeout(spawn('java', javaArgs, { cwd: runDir })) };
    }

    // ── Python ──
    if (language === 'python') {
      const filePath = path.join(runDir, 'main.py');
      await fs.promises.writeFile(filePath, code, 'utf-8');

      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      const pyArgs = [filePath];
      if (debug) pyArgs.unshift('-m', 'trace', '--trace');
      return { exitCode: await execWithTimeout(spawn(pyCmd, pyArgs, { cwd: runDir })) };
    }

    // ── C (via WSL) ──
    if (language === 'c' || language === 'cpp') {
      const hasWsl = await checkWsl();
      if (!hasWsl) {
        send('WSL no está instalado. Instala WSL desde https://learn.microsoft.com/windows/wsl/install\n', 'stderr');
        return { exitCode: 1 };
      }

      const ext = language === 'c' ? 'c' : 'cpp';
      const compiler = language === 'c' ? 'gcc' : 'g++';
      const filePath = path.join(runDir, `main.${ext}`);
      await fs.promises.writeFile(filePath, code, 'utf-8');

      send(`Compilando con ${compiler} (WSL)...\n`, 'info');
      const compileProc = spawn('wsl.exe', [compiler, ...(debug ? ['-g'] : []), '-o', 'main', `main.${ext}`], { cwd: runDir, windowsHide: true, shell: false });
      attachOutput(compileProc);
      const compiled = await execWithTimeout(compileProc, 30000, () => {
        send('\nError al ejecutar WSL. Verifica que WSL esté correctamente instalado y tenga gcc/g++.\n', 'stderr');
      });

      if (compiled !== 0) return { exitCode: compiled };

      send('Ejecutando...\n\n', 'info');
      return { exitCode: await execWithTimeout(spawn('wsl.exe', ['./main'], { cwd: runDir, windowsHide: true })) };
    }

    // ── JavaScript ──
    if (language === 'javascript') {
      const filePath = path.join(runDir, 'main.js');
      await fs.promises.writeFile(filePath, code, 'utf-8');

      send('Ejecutando con Node.js...\n\n', 'info');
      const proc = spawn('node', [filePath], { cwd: runDir });
      attachOutput(proc);
      return { exitCode: await execWithTimeout(proc, 30000, () => {
        send('\nError: Node.js no encontrado.\n', 'stderr');
      }) };
    }

    // ── TypeScript (Node 22.6+ runs .ts directly via native type-stripping — no tsc needed) ──
    if (language === 'typescript') {
      const filePath = path.join(runDir, 'main.ts');
      await fs.promises.writeFile(filePath, code, 'utf-8');

      send('Ejecutando con Node.js (soporte nativo de TypeScript)...\n\n', 'info');
      const proc = spawn('node', [filePath], { cwd: runDir });
      attachOutput(proc);
      return { exitCode: await execWithTimeout(proc, 30000, () => {
        send('\nError: Node.js no encontrado, o tu versión no soporta TypeScript nativo (requiere Node 22.6+).\n', 'stderr');
      }) };
    }

    // ── Go ──
    if (language === 'go') {
      const filePath = path.join(runDir, 'main.go');
      await fs.promises.writeFile(filePath, code, 'utf-8');

      send('Compilando y ejecutando con go run...\n\n', 'info');
      const proc = spawn('go', ['run', filePath], { cwd: runDir });
      attachOutput(proc);
      return { exitCode: await execWithTimeout(proc, 30000, () => {
        send('\nError: Go no encontrado. Instálalo desde https://go.dev/dl/\n', 'stderr');
      }) };
    }

    // ── Rust ──
    if (language === 'rust') {
      const filePath = path.join(runDir, 'main.rs');
      const outPath = path.join(runDir, 'main_rust.exe');
      await fs.promises.writeFile(filePath, code, 'utf-8');

      send('Compilando con rustc...\n', 'info');
      const compileProc = spawn('rustc', [filePath, '-o', outPath], { cwd: runDir });
      attachOutput(compileProc);
      const compiled = await execWithTimeout(compileProc, 30000, () => {
        send('\nError: rustc no encontrado. Instala Rust desde https://www.rust-lang.org/tools/install\n', 'stderr');
      });
      if (compiled !== 0) return { exitCode: compiled };

      send('Ejecutando...\n\n', 'info');
      const runProc = spawn(outPath, [], { cwd: runDir });
      attachOutput(runProc);
      return { exitCode: await execWithTimeout(runProc) };
    }

    // ── Ruby ──
    if (language === 'ruby') {
      const filePath = path.join(runDir, 'main.rb');
      await fs.promises.writeFile(filePath, code, 'utf-8');

      send('Ejecutando con Ruby...\n\n', 'info');
      const proc = spawn('ruby', [filePath], { cwd: runDir });
      attachOutput(proc);
      return { exitCode: await execWithTimeout(proc, 30000, () => {
        send('\nError: Ruby no encontrado. Instálalo desde https://www.ruby-lang.org/\n', 'stderr');
      }) };
    }

    // ── PHP ──
    if (language === 'php') {
      const filePath = path.join(runDir, 'main.php');
      await fs.promises.writeFile(filePath, code, 'utf-8');

      send('Ejecutando con PHP...\n\n', 'info');
      const proc = spawn('php', [filePath], { cwd: runDir });
      attachOutput(proc);
      return { exitCode: await execWithTimeout(proc, 30000, () => {
        send('\nError: PHP no encontrado. Instálalo desde https://www.php.net/\n', 'stderr');
      }) };
    }

    // ── Unsupported language ──
    send(`Lenguaje "${language}" no soportado para ejecución todavía.\n`, 'stderr');
    return { exitCode: 1 };
  } catch (err) {
    send(`\nError interno: ${String(err)}\n`, 'stderr');
    return { exitCode: 1, error: String(err) };
  }
});

// Writes the C/C++ source and returns the shell command to compile+run it, so the
// renderer can type it into the real interactive terminal (real PTY, real stdin) instead
// of the isolated, non-interactive run:execute pipe — programs that call scanf/cin can't
// be given input at all through that path, only through a genuine terminal.
ipcMain.handle('run:prepare-terminal', async (_event, { code, language }) => {
  if (language !== 'c' && language !== 'cpp') {
    return { success: false, error: `Lenguaje "${language}" no soportado para ejecución en terminal.` };
  }
  const hasWsl = await checkWsl();
  if (!hasWsl) {
    return { success: false, error: 'WSL no está instalado. Instala WSL desde https://learn.microsoft.com/windows/wsl/install' };
  }

  const os = require('os');
  const runDir = path.join(os.tmpdir(), 'hydracode-run');
  try { await fs.promises.mkdir(runDir, { recursive: true }); } catch {}

  const ext = language === 'c' ? 'c' : 'cpp';
  const compiler = language === 'c' ? 'gcc' : 'g++';
  const filePath = path.join(runDir, `main.${ext}`);
  try {
    await fs.promises.writeFile(filePath, code, 'utf-8');
  } catch (err) {
    return { success: false, error: String(err) };
  }

  // 'cd' switches the terminal's own shell into runDir first; wsl.exe then picks that up
  // as its working directory automatically (the same behavior run:execute's C/C++ path
  // already relies on via spawn's `cwd` option), so `./main` resolves correctly.
  const command = `cd '${runDir}'; wsl.exe bash -c "${compiler} main.${ext} -o main && ./main"`;
  return { success: true, command };
});

ipcMain.handle('run:stop', async () => {
  if (_runningProcess) {
    try { _runningProcess.kill(); _runningProcess = null; } catch {}
    return { success: true };
  }
  return { success: false };
});

// ── Interactive terminal ─────────────────────────────────────────────────────
// Backed by node-pty (a real OS pseudo-terminal via ConPTY on Windows), not a
// plain child_process over anonymous pipes — this gives the shell a real TTY,
// so line editing, tab-completion, colors, Ctrl+C signal handling, and
// character-at-a-time interactive programs (vim, password prompts, REPLs)
// all work exactly as they would in a native terminal. No local echo/line
// buffering is needed on the renderer side: the PTY itself echoes input.
const pty = require('node-pty');
const _terminals = new Map();

ipcMain.handle('terminal:create', (event, { id, cwd }) => {
  try {
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    const args  = process.platform === 'win32' ? ['-NoProfile', '-NoLogo'] : ['-i'];

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.env.USERPROFILE || process.env.HOME || '.',
      env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' },
    });

    _terminals.set(id, ptyProcess);

    ptyProcess.onData((data) => {
      try { event.sender.send(`terminal:data:${id}`, data); } catch {}
    });
    ptyProcess.onExit(({ exitCode }) => {
      _terminals.delete(id);
      try { event.sender.send(`terminal:exit:${id}`, exitCode ?? 0); } catch {}
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('terminal:write', (_event, { id, data }) => {
  const term = _terminals.get(id);
  if (!term) return { success: false };
  try { term.write(data); return { success: true }; } catch { return { success: false }; }
});

ipcMain.handle('terminal:resize', (_event, { id, cols, rows }) => {
  const term = _terminals.get(id);
  if (!term || !cols || !rows) return { success: false };
  try { term.resize(cols, rows); return { success: true }; } catch { return { success: false }; }
});

ipcMain.handle('terminal:kill', (_event, { id }) => {
  const term = _terminals.get(id);
  if (!term) return { success: false };
  try { term.kill(); _terminals.delete(id); return { success: true }; } catch { return { success: false }; }
});

// ── Example mappings ──────────────────────────────────────────────────────────
ipcMain.handle('extensions:read-example-mapping', async (_event, { filename }) => {
  try {
    const mappingsDir = path.join(__dirname, '..', 'examples', 'mappings');
    const filePath = safeChildPath(mappingsDir, filename);
    if (!filePath) return { success: false, error: 'Invalid filename' };
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// ── Extension marketplace ────────────────────────────────────────────────────
ipcMain.handle('marketplace:query', async (_event, { text }) => {
  try {
    const https = require('https');
    const body = JSON.stringify({
      filters: [{
        criteria: [
          { filterType: 8,  value: 'Microsoft.VisualStudio.Code' },
          { filterType: 10, value: text || 'popular' },
        ],
        pageSize: 20,
        pageNumber: 1,
      }],
      flags: 0x200,
    });

    const data = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'marketplace.visualstudio.com',
        path: '/_apis/public/gallery/extensionquery',
        method: 'POST',
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json;api-version=7.2-preview.1',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'HydraCode/1.0',
        },
      }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(e); }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => {
        // No response within the timeout window (e.g. dead proxy/firewall
        // black-hole) — the socket alone won't error out on its own, so
        // destroy the request explicitly and settle the promise.
        req.destroy();
        reject(new Error('Marketplace request timed out'));
      });
      req.write(body);
      req.end();
    });

    const extensions = data?.results?.[0]?.extensions ?? [];
    return { success: true, extensions };
  } catch (err) {
    return { success: false, error: String(err), extensions: [] };
  }
});

ipcMain.handle('extensions:save', async (_event, extensions) => {
  try {
    const filePath = path.join(app.getPath('userData'), 'hydracode-extensions.json');
    await fs.promises.writeFile(filePath, JSON.stringify(extensions, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('extensions:load', async () => {
  try {
    const filePath = path.join(app.getPath('userData'), 'hydracode-extensions.json');
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, extensions: JSON.parse(content) };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // No extensions file yet — normal on first run.
      return { success: true, extensions: [] };
    }
    // File exists but is unreadable/corrupt (bad JSON, permissions, etc.) —
    // surface the error instead of silently wiping the installed list.
    return { success: false, extensions: [], error: String(err) };
  }
});

ipcMain.handle('dialog:open-json', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  try {
    const content = await fs.promises.readFile(result.filePaths[0], 'utf-8');
    return { canceled: false, content };
  } catch (err) {
    return { canceled: false, error: String(err) };
  }
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
