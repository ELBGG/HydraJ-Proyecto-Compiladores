import { Emitter } from '../../../base/common/event.js';

export type STTStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'starting' | 'recording' | 'error';

export class STTEngine {
  private _status: STTStatus = 'idle';
  private _model: any = null;
  private _recognizer: any = null;
  private _audioCtx: AudioContext | null = null;
  private _stream: MediaStream | null = null;
  private _processor: ScriptProcessorNode | null = null;

  private readonly _onStatus   = new Emitter<STTStatus>();
  private readonly _onProgress = new Emitter<number>();
  private readonly _onResult   = new Emitter<{ partial: string; final: string }>();

  readonly onStatus   = this._onStatus.event;
  readonly onProgress = this._onProgress.event;
  readonly onResult   = this._onResult.event;

  get status(): STTStatus { return this._status; }

  // ── Init ──────────────────────────────────────────────────────────────────

  async init(modelId: string, modelUrl: string): Promise<void> {
    if (this._status === 'loading' || this._status === 'ready' || this._status === 'recording') return;
    this._setStatus('idle');

    try {
      let buffer = await this._loadCached(modelId);

      if (!buffer) {
        this._setStatus('downloading');
        await this._downloadAndCache(modelId, modelUrl);
        buffer = await this._loadCached(modelId);
        if (!buffer) throw new Error('El modelo se descargó pero no se pudo leer de caché');
      }

      this._setStatus('loading');
      // vosk-browser ships a UMD bundle (dist/vosk.js), not a real ES module — it has no
      // `export` statements at all, only a `(function(global, factory) {...})(this,
      // function(exports) { ...; exports.createModel = createModel; })` wrapper that
      // falls through to `global.Vosk = {}` when it doesn't detect CommonJS/AMD (true
      // here: contextIsolation removes Node's `module`/`exports` from this renderer).
      // vite.config.ts's optimizeDeps.exclude keeps Vite dev from pre-bundling it, so
      // dev mode serves this raw file — import()ing it just *runs* the UMD wrapper as a
      // plain script with an empty ESM namespace; the real API only exists afterward as
      // the `window.Vosk` global the fallback branch sets. The production build DOES go
      // through Rollup's CJS interop, which instead synthesizes a `.default`-shaped
      // export. Three different shapes depending on how/where this runs — check all of
      // them rather than assuming one.
      const VoskModule = await import('vosk-browser');
      const createModel =
        (VoskModule as any).createModel
        ?? (VoskModule as any).default?.createModel
        ?? (globalThis as any).Vosk?.createModel;
      if (typeof createModel !== 'function') {
        // Diagnostic detail (module namespace keys + whether the UMD global fallback
        // landed) in case none of the three known shapes matched — cheaper to log this
        // now than to add another logging round-trip if this ever needs debugging again.
        console.error('[STT] vosk-browser shape check failed. Module keys:', Object.keys(VoskModule as object), 'globalThis.Vosk:', (globalThis as any).Vosk);
        throw new Error('No se pudo cargar vosk-browser: createModel no está disponible en el módulo importado.');
      }
      const blob = new Blob([buffer], { type: 'application/zip' });
      const blobUrl = URL.createObjectURL(blob);

      this._model = await createModel(blobUrl);
      URL.revokeObjectURL(blobUrl);

      this._setStatus('ready');
    } catch (err) {
      console.error('[STT] Init error:', err);
      this._setStatus('error');
    }
  }

  private async _downloadAndCache(id: string, url: string): Promise<void> {
    const api = window.electronAPI;
    if (api?.modelOps?.download) {
      const unsub = api.modelOps.onProgress?.((pct: number) => this._onProgress.fire(pct));
      try {
        const res = await api.modelOps.download(id, url);
        if (!res.success) throw new Error(res.error ?? 'Descarga fallida');
      } finally {
        unsub?.();
      }
      return;
    }
    // Fallback para contexto no-Electron (navegador web)
    const buffer = await this._downloadFetch(url);
    await this._saveCache(id, buffer);
  }

  // ── Recording ─────────────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    if (this._status !== 'ready' || !this._model) return;

    // Mark re-entrancy synchronously, before the first await, so a rapid double-click (or
    // the delay of the OS mic-permission prompt) can't slip a second concurrent call past
    // the guard above — mirrors RunEngine.run() setting _isRunning = true before its first
    // await. The status change also disables the record button reactively (see STTPanel).
    this._setStatus('starting');

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this._audioCtx = new AudioContext({ sampleRate: 16000 });

      const rec = new this._model.KaldiRecognizer(16000);
      rec.setWords(true);
      this._recognizer = rec;

      rec.on('result', (msg: any) => {
        const text: string = msg.result?.text ?? '';
        if (text) this._onResult.fire({ partial: '', final: text });
      });
      rec.on('partialresult', (msg: any) => {
        const partial: string = msg.result?.partial ?? '';
        if (partial) this._onResult.fire({ partial, final: '' });
      });

      const source = this._audioCtx.createMediaStreamSource(this._stream);
      // ScriptProcessorNode is deprecated but still widely supported in Electron
      this._processor = this._audioCtx.createScriptProcessor(4096, 1, 1);
      this._processor.onaudioprocess = (e) => {
        if (this._recognizer) {
          rec.acceptWaveform(e.inputBuffer);
        }
      };
      source.connect(this._processor);
      this._processor.connect(this._audioCtx.destination);

      this._setStatus('recording');
    } catch (err: any) {
      console.error('[STT] Recording error:', err);
      // Release any mic stream / AudioContext already acquired before the failure (e.g.
      // getUserMedia succeeded but recognizer construction then threw). Otherwise a later
      // retry reassigns these fields and the previous live stream/context — still holding
      // the microphone / audio-hardware resources open — is orphaned forever.
      try { this._stream?.getTracks().forEach(t => t.stop()); } catch { /* cleanup best-effort */ }
      this._stream = null;
      try { void this._audioCtx?.close(); } catch { /* cleanup best-effort */ }
      this._audioCtx = null;
      const isPermission = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      this._onStatus.fire(isPermission ? 'error' : 'error');
      this._setStatus('error');
    }
  }

  stopRecording(): void {
    this._processor?.disconnect();
    this._processor = null;
    this._audioCtx?.close();
    this._audioCtx = null;
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream = null;
    this._recognizer = null;
    if (this._status === 'recording') this._setStatus('ready');
  }

  dispose(): void {
    this.stopRecording();
    this._model?.terminate?.();
    this._model = null;
    this._setStatus('idle');
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _setStatus(s: STTStatus): void {
    this._status = s;
    this._onStatus.fire(s);
  }

  private async _loadCached(id: string): Promise<ArrayBuffer | null> {
    const api = window.electronAPI;
    if (!api?.modelOps) return null;
    try {
      const res = await api.modelOps.load(id);
      if (res.success && res.data) {
        const u8 = res.data as Uint8Array;
        return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
      }
    } catch { /* no cache */ }
    return null;
  }

  private async _saveCache(id: string, buffer: ArrayBuffer): Promise<void> {
    const api = window.electronAPI;
    if (!api?.modelOps) return;
    try { await api.modelOps.save(id, buffer); } catch { /* ignore */ }
  }

  private async _downloadFetch(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar modelo`);

    const total = parseInt(res.headers.get('content-length') ?? '0');
    let loaded = 0;
    const chunks: Uint8Array[] = [];
    const reader = res.body!.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (total > 0) this._onProgress.fire(Math.round((loaded / total) * 100));
    }

    const out = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out.buffer;
  }
}
