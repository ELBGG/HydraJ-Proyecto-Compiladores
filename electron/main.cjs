const { app, BrowserWindow, Menu, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, execFile } = require('child_process');

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
    icon: path.join(__dirname, '../build/icon.png'),
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

  // Chromium's own hang detector — catches "still alive but not responding to input"
  // (e.g. a stuck Web Worker feeding heavy synchronous work back into the main thread),
  // a state render-process-gone above does NOT cover since the process never dies.
  // Diagnostically decisive on its own: if this does NOT fire during a reported freeze,
  // that proves the main thread itself is fine and the stall is isolated elsewhere
  // (e.g. inside a Worker), not a general main-thread block.
  win.webContents.on('unresponsive', () => {
    console.error('[HydraCode] Renderer became unresponsive (window may appear frozen).');
  });
  win.webContents.on('responsive', () => {
    console.log('[HydraCode] Renderer recovered from being unresponsive.');
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

ipcMain.handle('folder:create-dir', async (_event, { dirPath, name }) => {
  const newPath = safeChildPath(dirPath, name);
  if (!newPath) return { success: false, error: 'Nombre de carpeta inválido.' };
  try {
    await fs.promises.mkdir(newPath);
    return { success: true, path: newPath };
  } catch (err) {
    if (err.code === 'EEXIST') return { success: false, error: 'Ya existe una carpeta con ese nombre.' };
    return { success: false, error: String(err) };
  }
});

// Renaming stays within the SAME directory the item already lives in (matching what the
// Explorer's rename UI actually offers — an in-place rename, not a move) — safeChildPath
// against that directory rejects a `newName` that tries to escape it via traversal.
ipcMain.handle('folder:rename', async (_event, { path: oldPath, newName }) => {
  const newPath = safeChildPath(path.dirname(oldPath), newName);
  if (!newPath) return { success: false, error: 'Nombre inválido.' };
  try {
    await fs.promises.rename(oldPath, newPath);
    return { success: true, path: newPath };
  } catch (err) {
    if (err.code === 'EEXIST' || err.code === 'ENOTEMPTY') return { success: false, error: 'Ya existe algo con ese nombre.' };
    return { success: false, error: String(err) };
  }
});

// Moves to the OS Recycle Bin/Trash (shell.trashItem) instead of a hard fs.rm — a
// context-menu "Delete" click should be recoverable, the same way VS Code's own
// Explorer delete is (Shift+Delete is the separate, permanent variant VS Code offers;
// this app doesn't need that second tier for a first pass).
ipcMain.handle('folder:delete', async (_event, { path: targetPath }) => {
  try {
    await shell.trashItem(targetPath);
    return { success: true };
  } catch (err) {
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

// ── Source Control (git) ──────────────────────────────────────────────────────
// Shells out to the user's own `git` (same trust model as run:execute shelling out to
// javac/python/etc. — this app doesn't bundle or vendor git). All commands run with
// `cwd` set to the open workspace folder.
function runGit(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const message = err.code === 'ENOENT'
          ? 'git no está instalado o no se encuentra en el PATH.'
          : (stderr || err.message || '').trim();
        resolve({ success: false, error: message, stdout, stderr });
      } else {
        resolve({ success: true, stdout, stderr });
      }
    });
  });
}

/** Parses `git status --porcelain=v1` (2-char status code + path per line) into staged
 *  vs. unstaged file lists — the same information VS Code's own Source Control view
 *  splits into its "Staged Changes" / "Changes" sections. A rename line's path field is
 *  "old -> new"; only the new path is kept (renders as a plain modified-looking entry
 *  rather than a dedicated rename UI — a reasonable first-pass simplification). */
function parsePorcelainStatus(raw) {
  const staged = [];
  const unstaged = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const x = line[0];
    const y = line[1];
    let filePath = line.slice(3);
    if (filePath.includes(' -> ')) filePath = filePath.split(' -> ')[1];
    if (x === '?' && y === '?') { unstaged.push({ path: filePath, status: '?' }); continue; }
    if (x !== ' ') staged.push({ path: filePath, status: x });
    if (y !== ' ') unstaged.push({ path: filePath, status: y });
  }
  return { staged, unstaged };
}

/** Resolves the actual repo root for a workspace folder that may itself be a
 *  subdirectory of the repo (git happily finds the root by searching upward) — every
 *  other git:* handler below runs its command with cwd=root rather than the raw
 *  workspace path, so pathspecs (which git:status reports relative to root) always
 *  resolve to the same files regardless of which subfolder the user opened. Returns
 *  null and leaves the original rev-parse error (e.g. "git not installed" vs. "not a
 *  repo") for the caller to surface instead of collapsing both into one message. */
async function resolveRepoRoot(cwd) {
  const result = await runGit(['rev-parse', '--show-toplevel'], cwd);
  if (!result.success) return { root: null, error: result.error };
  return { root: result.stdout.trim(), error: null };
}

ipcMain.handle('git:status', async (_event, { cwd }) => {
  const { root, error } = await resolveRepoRoot(cwd);
  if (!root) return { success: false, isRepo: false, error: error || 'Esta carpeta no es un repositorio git.' };

  const branchResult = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  const branch = branchResult.success ? branchResult.stdout.trim() : '';

  const statusResult = await runGit(['status', '--porcelain=v1'], root);
  if (!statusResult.success) return { success: false, isRepo: true, error: statusResult.error };

  const { staged, unstaged } = parsePorcelainStatus(statusResult.stdout);
  return { success: true, isRepo: true, branch, root, staged, unstaged };
});

ipcMain.handle('git:init', async (_event, { cwd }) => runGit(['init'], cwd));

ipcMain.handle('git:stage', async (_event, { cwd, paths }) => {
  const { root, error } = await resolveRepoRoot(cwd);
  if (!root) return { success: false, error: error || 'Esta carpeta no es un repositorio git.' };
  const args = paths === 'all' ? ['add', '-A'] : ['add', '--', ...paths];
  return runGit(args, root);
});

ipcMain.handle('git:unstage', async (_event, { cwd, paths }) => {
  const { root, error } = await resolveRepoRoot(cwd);
  if (!root) return { success: false, error: error || 'Esta carpeta no es un repositorio git.' };
  const args = paths === 'all' ? ['reset', 'HEAD', '--'] : ['reset', 'HEAD', '--', ...paths];
  return runGit(args, root);
});

ipcMain.handle('git:discard', async (_event, { cwd, paths }) => {
  // checkout -- restores tracked files from HEAD; untracked files need a separate clean
  // call. Deliberately does NOT touch staged changes (unstage first if that's wanted) —
  // matches VS Code's own "Discard Changes" scope (unstaged working-tree edits only).
  const { root, error } = await resolveRepoRoot(cwd);
  if (!root) return { success: false, error: error || 'Esta carpeta no es un repositorio git.' };
  const tracked = await runGit(paths === 'all' ? ['checkout', '--', '.'] : ['checkout', '--', ...paths], root);
  if (paths === 'all') {
    await runGit(['clean', '-fd'], root);
  }
  return tracked;
});

ipcMain.handle('git:commit', async (_event, { cwd, message }) => {
  if (!message || !message.trim()) return { success: false, error: 'El mensaje de commit no puede estar vacío.' };
  const { root, error } = await resolveRepoRoot(cwd);
  if (!root) return { success: false, error: error || 'Esta carpeta no es un repositorio git.' };
  return runGit(['commit', '-m', message], root);
});

ipcMain.handle('git:pull', async (_event, { cwd }) => {
  const { root, error } = await resolveRepoRoot(cwd);
  if (!root) return { success: false, error: error || 'Esta carpeta no es un repositorio git.' };
  return runGit(['pull'], root);
});

ipcMain.handle('git:push', async (_event, { cwd }) => {
  const { root, error } = await resolveRepoRoot(cwd);
  if (!root) return { success: false, error: error || 'Esta carpeta no es un repositorio git.' };
  const branchResult = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  const branch = branchResult.success ? branchResult.stdout.trim() : null;
  const result = await runGit(['push'], root);
  if (!result.success && branch && /no upstream branch|has no upstream/i.test(result.error || '')) {
    // First push on a new branch — publish it the same way VS Code's "Publish Branch"
    // button does, rather than surfacing a raw git error the user has to decode.
    return runGit(['push', '--set-upstream', 'origin', branch], root);
  }
  return result;
});

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

// ── User settings ─────────────────────────────────────────────────────────────
// One flat JSON object (dot-namespaced keys, e.g. "editor.fontSize") at userData/
// settings.json — mirrors VS Code's own settings.json shape. Stored locally per-machine,
// never bundled/shared: this is also where the AI interpreter's API key lives, and each
// user brings their own (NVIDIA's free tier or any other OpenAI-compatible provider).
// Previously this was a dedicated ai-settings.json — generalized into one store the
// moment a second kind of setting needed persisting, before any real users existed to
// migrate, so there was no reason to keep the two around side by side.
ipcMain.handle('settings:save', async (_event, values) => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    await fs.promises.writeFile(settingsPath, JSON.stringify(values), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('settings:load', async () => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    const raw = await fs.promises.readFile(settingsPath, 'utf-8');
    return { success: true, values: JSON.parse(raw) };
  } catch {
    return { success: false, values: null };
  }
});

// ── Write serialization + atomic writes ──────────────────────────────────────
// Two independent renderer calls can target the exact same file — e.g. startup's
// loadAndRegisterAllMappings() caching "python" at the same moment a user installs a
// different repo that also declares languageId "python" via the GitHub-mapping panel.
// Plain concurrent fs.promises.writeFile calls have no ordering guarantee (whichever
// I/O happens to finish last wins, not whichever call was dispatched last) — queueWrite
// chains every write for the same path onto the previous one. writeFileAtomic writes to
// a temp file and renames over the real path so a crash/kill/full-disk mid-write can
// never leave a truncated-but-still-readable file behind (found by this session's
// adversarial review of the mapping-loading feature).
const _writeQueues = new Map();

function queueWrite(filePath, fn) {
  const prev = _writeQueues.get(filePath) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  _writeQueues.set(filePath, next.catch(() => {}));
  return next;
}

async function writeFileAtomic(filePath, content) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmpPath, content, 'utf-8');
  await fs.promises.rename(tmpPath, filePath);
}

// ── Language mapping cache ───────────────────────────────────────────────────
// Mirrors the Vosk model cache's shape (see modelOps below): mappings fetched from a
// GitHub repo (see githubMappingService.ts) are cached here as raw JSON text so the app
// still has a last-known-good mapping to register on a launch with no network access,
// rather than a language silently having zero vocabulary. languageId comes from
// user-editable state (whatever a user types when adding a mapping source from the UI),
// so it's allowlisted before ever touching a filesystem path — never trust it as-is.
function sanitizeMappingLanguageId(languageId) {
  return String(languageId).replace(/[^a-zA-Z0-9_-]/g, '');
}

ipcMain.handle('mappings:save-cache', async (_event, { languageId, json }) => {
  try {
    const safeId = sanitizeMappingLanguageId(languageId);
    if (!safeId) return { success: false, error: 'languageId inválido' };
    const dir = path.join(app.getPath('userData'), 'mappings');
    await fs.promises.mkdir(dir, { recursive: true });
    const cachePath = path.join(dir, `${safeId}.json`);
    await queueWrite(cachePath, () => writeFileAtomic(cachePath, json));
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('mappings:load-cache', async (_event, languageId) => {
  const safeId = sanitizeMappingLanguageId(languageId);
  if (!safeId) return { success: false, json: null };

  // Validates JSON.parse, not just the read itself — a corrupt-but-readable cache file
  // (e.g. left behind by a crash mid-write before writeFileAtomic existed, or a disk
  // that filled up) must fall through to the seed the same way a missing file does,
  // instead of permanently shadowing a perfectly good seed with unusable data.
  const tryRead = async (filePath) => {
    const json = await fs.promises.readFile(filePath, 'utf-8');
    JSON.parse(json);
    return json;
  };

  const cachePath = path.join(app.getPath('userData'), 'mappings', `${safeId}.json`);
  try {
    return { success: true, json: await tryRead(cachePath) };
  } catch {
    // No real cache yet, or it exists but is corrupt/truncated — fall back to the seed
    // shipped with the app itself, generated from the mappings that used to be this
    // app's only source of truth (see mappingSourceStore.ts). Keeps java/c/cpp/python
    // fully working offline from the very first launch, before their GitHub repos even
    // exist yet in some cases, without reintroducing a hardcoded/statically-imported
    // mapping anywhere in the renderer.
    try {
      const seedPath = path.join(__dirname, 'mapping-seeds', `${safeId}.json`);
      return { success: true, json: await tryRead(seedPath) };
    } catch {
      return { success: false, json: null };
    }
  }
});

// The list of {languageId, repoUrl} mapping sources the app registers on startup (see
// mappingSourceStore.ts) — separate from settings.json since it's a list, not a flat
// scalar blob, but otherwise the exact same save/load shape.
ipcMain.handle('mapping-sources:save', async (_event, sources) => {
  try {
    const sourcesPath = path.join(app.getPath('userData'), 'mapping-sources.json');
    await queueWrite(sourcesPath, () => writeFileAtomic(sourcesPath, JSON.stringify(sources)));
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('mapping-sources:load', async () => {
  try {
    const sourcesPath = path.join(app.getPath('userData'), 'mapping-sources.json');
    const raw = await fs.promises.readFile(sourcesPath, 'utf-8');
    return { success: true, sources: JSON.parse(raw) };
  } catch {
    return { success: false, sources: null };
  }
});

// ── AI interpreter network proxy ─────────────────────────────────────────────
// The renderer used to call the configured OpenAI-compatible endpoint directly with
// fetch() — that's a normal, security-conscious Chromium context (contextIsolation +
// webSecurity, both on), so it's subject to CORS like any browser tab. Providers meant
// for server-side consumption (NVIDIA's NIM catalog included) don't send an
// Access-Control-Allow-Origin header, so the preflight gets blocked and the request
// never even reaches the network tab — confirmed live: "blocked by CORS policy: ...
// No 'Access-Control-Allow-Origin' header is present". Node's fetch in the MAIN
// process isn't a browser fetch at all — CORS is a browser-enforced concept with
// nothing to enforce it here — so proxying the one HTTP call through IPC sidesteps
// the problem entirely without touching webSecurity (which would weaken every other
// request the app makes, not just this one).
// Event-based (not invoke/handle) because this streams: the request body sets
// stream:true and the provider responds with an SSE body ("data: {...}\n\n" frames) —
// each parsed delta is forwarded to the renderer immediately as an 'ai:stream-event'
// 'chunk' so the user sees text appear as the model generates it, instead of silently
// waiting for the full completion (a 70B-class model's full response over a free-tier
// endpoint can take long enough that a non-streaming wait reads as "broken"). The
// renderer keys events by requestId since a user could in principle trigger overlapping
// interpret() calls.
ipcMain.on('ai:stream-start', async (event, { requestId, url, apiKey, body }) => {
  const send = (payload) => { try { event.sender.send('ai:stream-event', { requestId, ...payload }); } catch { /* window may already be gone */ } };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      send({ type: 'done', ok: false, status: res.status, statusText: res.statusText, bodyText });
      return;
    }
    if (!res.body) {
      send({ type: 'done', ok: false, status: res.status, statusText: res.statusText, bodyText: 'La respuesta no incluyó un cuerpo.' });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            content += delta;
            send({ type: 'chunk', delta });
          }
        } catch { /* ignore a malformed/partial SSE frame */ }
      }
    }
    send({ type: 'done', ok: true, status: res.status, statusText: res.statusText, content });
  } catch (err) {
    send({ type: 'done', ok: false, status: 0, statusText: 'network-error', networkError: String(err && err.message ? err.message : err) });
  }
});

ipcMain.handle('app:about', async () => {
  await dialog.showMessageBox(win, {
    type: 'info',
    title: 'About HydraCode',
    message: 'HydraCode',
    detail: `Version ${app.getVersion()}\nMultilanguage transpiling IDE\n\nSupported languages: Java, C, C++, Python, Go\nHuman languages: any mapping with a blockTemplate — see the Mappings panel\n\nBuilt with Electron + Vite + Monaco Editor`,
    buttons: ['OK'],
    icon: nativeImage.createFromPath(path.join(__dirname, '../build/icon.png')),
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

// Plain \w is ASCII-only ([A-Za-z0-9_]) — a class named in any non-Latin script (e.g.
// こんにちは, from testing the Japanese mapping) wouldn't be captured, silently falling
// back to "Main" for the FILENAME while the source's own `class こんにちは` declaration
// is unchanged — javac requires a public class's name to match its filename exactly, so
// that mismatch is a guaranteed compile error. \p{L}/\p{N} (Unicode letter/number, any
// script) fixes it, same reasoning as TranspilerEngine.ts's keyword-boundary fix.
const JAVA_CLASS_NAME_RE = /(?:public\s+)?class\s+([\p{L}\p{N}_$]+)/u;

ipcMain.handle('run:execute', async (event, { code, language, debug }) => {
  const { spawn } = require('child_process');
  const os = require('os');

  // Configuración → Ejecución → "Tiempo límite de ejecución" (run.timeoutMs) — read fresh
  // on every run rather than cached, so a change in Settings takes effect on the next
  // run without restarting the app. Falls back to 30s if unset/unreadable.
  let configuredTimeoutMs = 30000;
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    const raw = await fs.promises.readFile(settingsPath, 'utf-8');
    const values = JSON.parse(raw);
    if (typeof values['run.timeoutMs'] === 'number' && values['run.timeoutMs'] > 0) {
      configuredTimeoutMs = values['run.timeoutMs'];
    }
  } catch { /* settings.json missing or unreadable — keep the 30s default */ }

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
  const execWithTimeout = (proc, timeoutMs = configuredTimeoutMs, onError) => new Promise((resolve) => {
    _runningProcess = proc;
    const timer = setTimeout(() => {
      if (_runningProcess === proc) {
        try { proc.kill(); } catch {}
        _runningProcess = null;
        send(`\n[Tiempo de ejecución excedido (${Math.round(timeoutMs / 1000)}s)]\n`, 'info');
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
      const classMatch = code.match(JAVA_CLASS_NAME_RE);
      const className = classMatch ? classMatch[1] : 'Main';
      const filePath = path.join(runDir, `${className}.java`);
      await fs.promises.writeFile(filePath, code, 'utf-8');

      const javacArgs = ['-d', runDir];
      if (debug) javacArgs.unshift('-g');
      javacArgs.push(filePath);

      send(`Compilando ${className}.java...\n`, 'info');
      const compileProc = spawn('javac', javacArgs, { cwd: runDir });
      attachOutput(compileProc);
      const compiled = await execWithTimeout(compileProc, configuredTimeoutMs, () => {
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
      const compiled = await execWithTimeout(compileProc, configuredTimeoutMs, () => {
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
      return { exitCode: await execWithTimeout(proc, configuredTimeoutMs, () => {
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
      return { exitCode: await execWithTimeout(proc, configuredTimeoutMs, () => {
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
      return { exitCode: await execWithTimeout(proc, configuredTimeoutMs, () => {
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
      const compiled = await execWithTimeout(compileProc, configuredTimeoutMs, () => {
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
      return { exitCode: await execWithTimeout(proc, configuredTimeoutMs, () => {
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
      return { exitCode: await execWithTimeout(proc, configuredTimeoutMs, () => {
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

// Writes the source and returns the shell command to compile+run it, so the renderer
// can type it into the real interactive terminal (real PTY, real stdin) instead of the
// isolated, non-interactive run:execute pipe — a program that reads stdin (scanf/cin,
// Python's input(), Java's Scanner/System.in) can't be given input at all through that
// path, only through a genuine terminal. The terminal itself is powershell.exe on
// Windows (see terminal:create) — Windows PowerShell 5.1 has no &&/|| chain operators,
// so "compile, then run only if that succeeded" uses "; if ($?) { ... }" instead,
// except for C/C++ where the whole chain is handed to a bash -c string under WSL (bash
// DOES support &&, and that string is opaque to the outer PowerShell either way).
ipcMain.handle('run:prepare-terminal', async (_event, { code, language }) => {
  const os = require('os');
  const runDir = path.join(os.tmpdir(), 'hydracode-run');
  try { await fs.promises.mkdir(runDir, { recursive: true }); } catch {}

  if (language === 'java') {
    const classMatch = code.match(JAVA_CLASS_NAME_RE);
    const className = classMatch ? classMatch[1] : 'Main';
    const filePath = path.join(runDir, `${className}.java`);
    try {
      await fs.promises.writeFile(filePath, code, 'utf-8');
    } catch (err) {
      return { success: false, error: String(err) };
    }
    const command = `cd '${runDir}'; javac '${className}.java'; if ($?) { java -cp '${runDir}' ${className} }`;
    return { success: true, command };
  }

  if (language === 'python') {
    const filePath = path.join(runDir, 'main.py');
    try {
      await fs.promises.writeFile(filePath, code, 'utf-8');
    } catch (err) {
      return { success: false, error: String(err) };
    }
    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    const command = `cd '${runDir}'; ${pyCmd} 'main.py'`;
    return { success: true, command };
  }

  if (language !== 'c' && language !== 'cpp') {
    return { success: false, error: `Lenguaje "${language}" no soportado para ejecución en terminal.` };
  }
  const hasWsl = await checkWsl();
  if (!hasWsl) {
    return { success: false, error: 'WSL no está instalado. Instala WSL desde https://learn.microsoft.com/windows/wsl/install' };
  }

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

// ── Auto-update (GitHub Releases) ────────────────────────────────────────────
// electron-updater reads its provider config from `app-update.yml`, a file
// electron-builder auto-generates INSIDE the packaged app from this project's own
// package.json "build.publish" config — nothing to configure here beyond that file
// existing (it only does, inside a real packaged build). Until at least one GitHub
// Release has been published with the installer plus the "latest.yml"/blockmap
// electron-builder also produces alongside it, checkForUpdates() below simply
// resolves to "no update available" (or a 404-flavored error) — same as any other
// up-to-date check, not a broken state.
let _manualUpdateCheckInFlight = false;

function setupAutoUpdater() {
  // Registered unconditionally (dev included) so the renderer's "Check for
  // Updates..." menu item always gets a real response instead of an IPC error on an
  // unregistered channel when running un-packaged.
  ipcMain.handle('app:check-for-updates', async () => {
    if (!app.isPackaged) {
      return { success: false, error: 'Buscar actualizaciones solo está disponible en la app instalada, no en modo desarrollo.' };
    }
    _manualUpdateCheckInFlight = true;
    try {
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (err) {
      // autoUpdater's own 'error' listener below already showed this to the user
      // via a dialog (since _manualUpdateCheckInFlight is true) — this return value
      // just lets the renderer-side promise settle, nothing further to show.
      return { success: false, error: String(err) };
    }
  });

  if (!app.isPackaged) return; // no app-update.yml outside a real packaged build

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[HydraCode] Update available:', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    if (_manualUpdateCheckInFlight) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'HydraCode',
        message: 'Ya tenés la última versión instalada.',
        buttons: ['OK'],
      });
    }
    _manualUpdateCheckInFlight = false;
  });

  autoUpdater.on('error', (err) => {
    console.error('[HydraCode] Auto-update error:', err);
    // A silent background check failing (e.g. no network, or no releases published
    // yet) shouldn't interrupt the user — only surface it when they explicitly
    // asked via the menu item.
    if (_manualUpdateCheckInFlight) {
      dialog.showMessageBox(win, {
        type: 'error',
        title: 'HydraCode',
        message: 'No se pudo buscar actualizaciones.',
        detail: String(err?.message ?? err),
        buttons: ['OK'],
      });
    }
    _manualUpdateCheckInFlight = false;
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const result = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'HydraCode',
      message: `Se descargó la actualización a la versión ${info.version}.`,
      detail: 'Reiniciá la aplicación para instalarla.',
      buttons: ['Reiniciar ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  // Silent background check shortly after launch — delayed so it never competes
  // with the window's own initial load, and never shows a dialog on its own
  // (only a manually-triggered check does, via the listeners above); genuinely
  // finding an update still triggers the auto-download → 'update-downloaded'
  // restart prompt regardless of who initiated the check.
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 5000);
}

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  setupAutoUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
