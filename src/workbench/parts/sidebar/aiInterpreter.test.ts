import { describe, it, expect, vi, beforeAll } from 'vitest';
import { AIInterpreter } from './aiInterpreter.js';
import { settingsStore } from './settingsStore.js';
import { registerJavaLanguages } from '../../../languages/java/index.js';

beforeAll(() => {
  // aiInterpreter.ts reads settingsStore, which only touches `window` inside its own
  // load()/set() (both guarded with `api?.settingsOps`) — stubbing it to a bare object
  // is enough to exercise those paths without a real Electron preload bridge.
  vi.stubGlobal('window', {});
  registerJavaLanguages();
});

/** Every test sets exactly the ai.* keys it needs up front rather than relying on
 *  execution order — settingsStore is a module-level singleton shared across this whole
 *  file, so a prior test's apiKey must never leak into one that expects "no key". */
async function configureAi(overrides: { baseUrl?: string; model?: string; apiKey?: string }): Promise<void> {
  await settingsStore.set('ai.apiKey', overrides.apiKey ?? '');
  if (overrides.baseUrl !== undefined) await settingsStore.set('ai.baseUrl', overrides.baseUrl);
  if (overrides.model !== undefined) await settingsStore.set('ai.model', overrides.model);
}

/** The actual HTTP call is proxied through window.electronAPI.aiOps.streamChatCompletion
 *  (a main-process IPC round-trip that streams SSE deltas back, see main.cjs's
 *  'ai:stream-start' handler) rather than a direct renderer fetch() — most
 *  OpenAI-compatible providers don't send CORS headers permitting a browser-origin
 *  request, which a real user hit live with NVIDIA's API. This stub replaces `window`
 *  wholesale (matching the beforeAll pattern above), which is safe here since
 *  settingsStore only reads window.electronAPI.settingsOps, never aiOps. */
function stubAiOps(streamChatCompletion: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal('window', { electronAPI: { aiOps: { streamChatCompletion } } });
}

/** Simulates a successful stream: calls onChunk once per given piece (mirroring how
 *  main.cjs forwards each SSE delta), then resolves with the fully-accumulated content —
 *  same shape aiInterpreter.ts's interpret() expects back from a real stream. */
function streamOf(chunks: string[]): ReturnType<typeof vi.fn> {
  return vi.fn(async (_req: unknown, onChunk: (delta: string) => void) => {
    for (const c of chunks) onChunk(c);
    return { ok: true, status: 200, statusText: 'OK', content: chunks.join('') };
  });
}

describe('AIInterpreter', () => {
  it('has no API key configured by default', async () => {
    await configureAi({});
    expect(new AIInterpreter().hasApiKey()).toBe(false);
  });

  it('hasApiKey becomes true after the store has a non-empty ai.apiKey', async () => {
    await configureAi({ apiKey: 'test-key' });
    expect(new AIInterpreter().hasApiKey()).toBe(true);
  });

  it('rejects with a Spanish, actionable message when no key is configured', async () => {
    await configureAi({});
    const ai = new AIInterpreter();
    await expect(ai.interpret('crea una funcion', 'java', 'es')).rejects.toThrow('No hay una clave de API configurada');
  });

  it('rejects immediately for empty input, without making a network call', async () => {
    await configureAi({ apiKey: 'test-key' });
    const ai = new AIInterpreter();
    const streamChatCompletion = vi.fn();
    stubAiOps(streamChatCompletion);
    await expect(ai.interpret('   ', 'java', 'es')).rejects.toThrow('No hay texto para interpretar');
    expect(streamChatCompletion).not.toHaveBeenCalled();
  });

  it('rejects with a clear message when running outside the Electron app (no electronAPI at all)', async () => {
    await configureAi({ apiKey: 'test-key' });
    const ai = new AIInterpreter();
    vi.stubGlobal('window', {});
    await expect(ai.interpret('algo', 'java', 'es')).rejects.toThrow('aplicación de escritorio de HydraCode');
  });

  it('sends the expected request shape and parses a successful response', async () => {
    await configureAi({ baseUrl: 'https://example.com/v1/', apiKey: 'test-key', model: 'test-model' });
    const ai = new AIInterpreter();

    const streamChatCompletion = streamOf(['si (x) {\n  ', 'retornar 1;\n}']);
    stubAiOps(streamChatCompletion);

    const result = await ai.interpret('si x es verdadero retorna 1', 'java', 'es');
    expect(result).toBe('si (x) {\n  retornar 1;\n}');

    expect(streamChatCompletion).toHaveBeenCalledTimes(1);
    const req = streamChatCompletion.mock.calls[0][0];
    // A trailing slash on baseUrl must not produce a doubled "//chat/completions".
    expect(req.url).toBe('https://example.com/v1/chat/completions');
    expect(req.apiKey).toBe('test-key');
    const body = JSON.parse(req.body);
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(true);
    expect(body.messages[1]).toEqual({ role: 'user', content: 'si x es verdadero retorna 1' });
    // The system prompt must actually carry the mapping's real vocabulary, not just a
    // generic "write some Java" instruction.
    expect(body.messages[0].content).toContain('Palabras clave');
    expect(body.messages[0].content).toContain('"si"=if');
  });

  it('reports the accumulated-so-far text via onChunk as each delta streams in', async () => {
    await configureAi({ apiKey: 'test-key' });
    const ai = new AIInterpreter();
    stubAiOps(streamOf(['si (x) ', '{ retornar 1; }']));

    const seen: string[] = [];
    await ai.interpret('algo', 'java', 'es', (partial) => seen.push(partial));

    // extractCode() trims each accumulated preview, same as it does the final result.
    expect(seen).toEqual(['si (x)', 'si (x) { retornar 1; }']);
  });

  it('strips a markdown code fence if the model includes one despite instructions not to', async () => {
    await configureAi({ apiKey: 'test-key' });
    const ai = new AIInterpreter();
    stubAiOps(streamOf(['```java\nretornar 1;\n```']));
    expect(await ai.interpret('retorna 1', 'java', 'es')).toBe('retornar 1;');
  });

  it('throws a descriptive error on a non-2xx response instead of a generic failure', async () => {
    await configureAi({ apiKey: 'bad-key' });
    const ai = new AIInterpreter();
    stubAiOps(vi.fn().mockResolvedValue({
      ok: false, status: 401, statusText: 'Unauthorized', bodyText: 'Invalid API key',
    }));
    await expect(ai.interpret('algo', 'java', 'es')).rejects.toThrow('HTTP 401');
  });

  it('throws a connectivity error when the request never reached the network', async () => {
    await configureAi({ apiKey: 'test-key' });
    const ai = new AIInterpreter();
    stubAiOps(vi.fn().mockResolvedValue({
      ok: false, status: 0, statusText: 'network-error', networkError: 'getaddrinfo ENOTFOUND example.com',
    }));
    await expect(ai.interpret('algo', 'java', 'es')).rejects.toThrow('ENOTFOUND');
  });

  it('throws when the response has no usable content', async () => {
    await configureAi({ apiKey: 'test-key' });
    const ai = new AIInterpreter();
    stubAiOps(vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', content: '' }));
    await expect(ai.interpret('algo', 'java', 'es')).rejects.toThrow('no devolvió ningún resultado');
  });

  it('still produces a usable (if generic) prompt for a language with no registered mapping', async () => {
    await configureAi({ apiKey: 'test-key' });
    const ai = new AIInterpreter();
    const streamChatCompletion = streamOf(['algo']);
    stubAiOps(streamChatCompletion);
    await ai.interpret('algo', 'rust', 'es');
    const req = streamChatCompletion.mock.calls[0][0];
    const body = JSON.parse(req.body);
    expect(body.messages[0].content).toContain('rust');
  });
});
