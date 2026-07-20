import { LanguageRegistry } from '../../../languages/index.js';
import type { IHumanLanguageMapping } from '../../../languages/tokens/types.js';
import { settingsStore } from './settingsStore.js';

function buildSystemPrompt(mapping: IHumanLanguageMapping | undefined, progLang: string): string {
  if (!mapping) {
    return [
      `Eres un asistente de programación para HydraCode, un IDE educativo.`,
      `El usuario describe en voz alta lo que quiere programar en ${progLang}. Conviértelo en código ${progLang} real y correcto.`,
      `Responde ÚNICAMENTE con el código — sin explicaciones, sin comentarios extra, sin bloques de markdown (sin \`\`\`).`,
    ].join('\n');
  }

  const vocab = (label: string, dict: Record<string, string>, limit: number) =>
    `${label}: ${Object.entries(dict).slice(0, limit).map(([es, real]) => `"${es}"=${real}`).join(', ')}`;

  return [
    `Eres un asistente de programación para HydraCode, un IDE educativo donde el código se escribe con palabras clave en ESPAÑOL que luego se transpilan automáticamente a ${progLang} real.`,
    `El usuario dicta en voz alta, en español, una descripción de lo que quiere programar. Tu tarea es convertir esa descripción en código HydraCode válido para ${progLang} — usando las palabras clave en ESPAÑOL de HydraCode que se listan abajo, NO las palabras de ${progLang} real (por ejemplo, escribe "si" en vez de "if", "mientras" en vez de "while").`,
    vocab('Palabras clave', mapping.keywords, 30),
    vocab('Tipos', mapping.types, 20),
    vocab('Literales', mapping.literals, 10),
    `Si la descripción no tiene suficiente detalle para generar código completo, usa tu mejor criterio para producir algo razonable y funcional.`,
    `Responde ÚNICAMENTE con el código generado — sin explicaciones, sin comentarios adicionales, sin bloques de markdown (sin \`\`\`).`,
  ].join('\n\n');
}

/** Strips a markdown code fence if the model included one despite being told not to
 *  (LLMs don't always follow that instruction perfectly) — defensive, not load-bearing
 *  for models that behave. */
function extractCode(content: string): string {
  const fenced = content.match(/```(?:[\w-]*)\n?([\s\S]*?)```/);
  return (fenced ? fenced[1] : content).trim();
}

/**
 * Sends a spoken-and-transcribed description through a configured OpenAI-compatible
 * chat completions endpoint (NVIDIA's free-tier NIM catalog by default, or any other
 * provider the user points it at) and returns HydraCode-flavored Spanish-keyword source
 * for the requested prog language.
 *
 * Reads its configuration (ai.baseUrl/ai.model/ai.apiKey) directly from the shared
 * settingsStore singleton on every call rather than owning any settings state itself —
 * this used to be a self-contained mini-store with its own IPC persistence, folded into
 * the general Settings system (see settingsRegistry.ts's "IA" category /
 * settingsPanel.ts) the moment a second kind of setting needed the same plumbing.
 */
export class AIInterpreter {
  hasApiKey(): boolean {
    return String(settingsStore.get('ai.apiKey')).trim().length > 0;
  }

  /** Interprets `spokenText` as a description of code to write for `progLang`/
   *  `humanLang`. Throws with a user-facing Spanish message on any failure (no key
   *  configured, network error, non-2xx response, empty/malformed response) — callers
   *  should catch and display `err.message` directly rather than a generic fallback.
   *
   *  Streams: if `onChunk` is given, it fires with the accumulated-so-far text (fences
   *  stripped) as each delta arrives, so a caller can render a live "typing" effect
   *  instead of a long silent wait — a 70B-class model's full response over a free-tier
   *  endpoint can otherwise take long enough to read as broken. The returned promise
   *  still only resolves once with the final text, same as before. */
  async interpret(
    spokenText: string,
    progLang: string,
    humanLang: string,
    onChunk?: (partial: string) => void,
  ): Promise<string> {
    if (!this.hasApiKey()) {
      throw new Error('No hay una clave de API configurada. Ábrela en Configuración → IA (puedes obtener una gratis en build.nvidia.com).');
    }
    if (!spokenText.trim()) {
      throw new Error('No hay texto para interpretar.');
    }

    const mapping = LanguageRegistry.getMapping(progLang, humanLang);
    const baseUrl = String(settingsStore.get('ai.baseUrl')).trim().replace(/\/+$/, '');
    const apiKey = String(settingsStore.get('ai.apiKey'));
    const model = String(settingsStore.get('ai.model'));

    const aiOps = window.electronAPI?.aiOps;
    if (!aiOps) {
      throw new Error('No se pudo conectar con la API de IA: esta función requiere ejecutarse dentro de la aplicación de escritorio de HydraCode.');
    }

    // Proxied through the main process rather than a direct renderer fetch() — most
    // OpenAI-compatible providers (NVIDIA's NIM catalog included) don't send CORS
    // headers permitting a browser-origin request, and this app's renderer is a normal
    // contextIsolation'd Chromium context subject to that like any other tab. Streamed
    // (stream:true) so text appears as it's generated. See main.cjs's 'ai:stream-start'
    // handler. max_tokens is capped well below the API's own ceiling — voice-command-sized
    // snippets rarely need more, and it bounds worst-case latency for a slow model/endpoint.
    let accumulated = '';
    let res: AIStreamChatCompletionResult;
    try {
      res = await aiOps.streamChatCompletion({
        url: `${baseUrl}/chat/completions`,
        apiKey,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: buildSystemPrompt(mapping, progLang || 'texto plano') },
            { role: 'user', content: spokenText },
          ],
          temperature: 0.2,
          top_p: 0.7,
          max_tokens: 512,
          stream: true,
        }),
      }, (delta) => {
        accumulated += delta;
        onChunk?.(extractCode(accumulated));
      });
    } catch (err) {
      throw new Error(`No se pudo conectar con la API de IA: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (res.networkError) {
      throw new Error(`No se pudo conectar con la API de IA: ${res.networkError}`);
    }

    if (!res.ok) {
      throw new Error(`Error de la API de IA (HTTP ${res.status}): ${(res.bodyText ?? '').slice(0, 300) || res.statusText}`);
    }

    if (typeof res.content !== 'string' || !res.content.trim()) {
      throw new Error('La IA no devolvió ningún resultado.');
    }
    return extractCode(res.content);
  }
}
