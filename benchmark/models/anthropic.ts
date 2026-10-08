// Claude über die Messages-API (direkt, gestreamt, ohne CLI-Startzeit).
import type { ModelConfig } from '../benchmark.config.ts';
import { ModelCallError, promptText, toJsonSchema, type AppRequest, type ModelAdapter, type ModelResult } from './types.ts';

import { createHash } from 'node:crypto';

const URL = 'https://api.anthropic.com/v1/messages';

/** Pro Schema: 'strict' = Structured Outputs (Grammatik-garantiert), 'tool' = erzwungener Werkzeugaufruf
 *  mit demselben Schema, wenn das API das Schema als zu komplex ablehnt. Wird im Warm-up bestimmt. */
const schemaMode = new Map<string, 'strict' | 'tool'>();
const schemaKey = (s: unknown) => createHash('sha1').update(JSON.stringify(s)).digest('hex').slice(0, 12);

const post = (key: string, body: unknown, signal?: AbortSignal) => fetch(URL, {
  method: 'POST', signal,
  headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Warm-up: jedes Schema einmal übersetzen lassen (nicht gewertet). Claude speichert die Übersetzung
 *  zwischen, gewertete Aufrufe zahlen die Übersetzungszeit dann nicht. Zu komplexe Schemas → 'tool'. */
export const prepareSchemas = async (schemas: unknown[], apiModel: string): Promise<Record<string, string>> => {
  const key = process.env.ANTHROPIC_API_KEY!;
  const result: Record<string, string> = {};
  // Parallel: ein zu komplexes Schema braucht bis zu ~6 Minuten bis zur Ablehnung.
  await Promise.all(schemas.map(async (geminiSchema) => {
    const k = schemaKey(geminiSchema);
    if (schemaMode.has(k)) return;
    const { schema } = wrapSchema(geminiSchema);
    const res = await post(key, {
      model: apiModel, max_tokens: 64, thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: 'Warm-up. Antworte so kurz wie möglich.' }],
      output_config: { format: { type: 'json_schema', schema } },
    }, AbortSignal.timeout(600_000)).catch((e) => ({ ok: false, text: async () => String(e) }) as any);
    const body = res.ok ? '' : await res.text();
    const mode = /too complex|union types|too many|timeout|aborted/i.test(body) ? 'tool' : 'strict';
    schemaMode.set(k, mode);
    result[k] = mode + (body && mode === 'strict' ? ` (Warm-up-Fehler: ${body.slice(0, 120)})` : '');
  }));
  return result;
};

/** Claude-Schema muss ein Objekt sein: Arrays werden in {items: [...]} verpackt und danach wieder ausgepackt. */
export const wrapSchema = (geminiSchema: unknown): { schema: any; wrapped: boolean } => {
  const s = toJsonSchema(geminiSchema);
  if (s.type === 'object') return { schema: s, wrapped: false };
  return { schema: { type: 'object', properties: { items: s }, required: ['items'], additionalProperties: false }, wrapped: true };
};

export const anthropicAdapter: ModelAdapter = {
  async call(req: AppRequest, model: ModelConfig, { maxOutputTokens, signal }): Promise<ModelResult> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY fehlt (benchmark/.env oder Umgebung).');
    if (model.apiModel !== 'claude-haiku-5-5') throw new Error(`${model.apiModel}: Der Anthropic-Schlüssel ist nur für Haiku 5.5 freigegeben.`);
    const notes: string[] = [];
    const thinking = model.reasoningMode === 'adaptive-low' || model.reasoningMode === 'adaptive-high';
    const body: Record<string, any> = {
      model: model.apiModel,
      max_tokens: maxOutputTokens,
      stream: true,
      messages: [{ role: 'user', content: promptText(req) }],
      thinking: thinking ? { type: 'adaptive' } : { type: 'disabled' },
    };
    if (req.systemInstruction) body.system = req.systemInstruction;
    const outputConfig: Record<string, any> = {};
    if (thinking) outputConfig.effort = model.reasoningMode === 'adaptive-high' ? 'high' : 'low';
    // Haiku 5.5 lehnt `temperature` ab ("deprecated for this model", getestet 07.10.2026):
    // die App-Temperatur lässt sich nicht übertragen.
    notes.push(`Temperatur ${req.config?.temperature ?? 0.7} nicht übertragbar (vom Modell nicht unterstützt)`);
    let wrapped = false;
    let viaTool = false;
    if (req.config?.responseSchema) {
      const w = wrapSchema(req.config.responseSchema);
      wrapped = w.wrapped;
      if (schemaMode.get(schemaKey(req.config.responseSchema)) === 'tool') {
        viaTool = true;
        body.tools = [{ name: 'antwort', description: 'Gib die Antwort in diesem Format zurück.', input_schema: w.schema }];
        // Erzwungener Werkzeugaufruf ist mit Denken nicht erlaubt: dann 'any' (irgendein Werkzeug, es gibt nur eins).
        body.tool_choice = thinking ? { type: 'any' } : { type: 'tool', name: 'antwort' };
        notes.push('Schema zu komplex für Structured Outputs: Werkzeugaufruf ohne Format-Garantie');
      } else {
        outputConfig.format = { type: 'json_schema', schema: w.schema };
      }
      if (wrapped) notes.push('Array-Schema in {items} verpackt');
    }
    if (Object.keys(outputConfig).length) body.output_config = outputConfig;

    const start = performance.now();
    let res: Response;
    try {
      res = await post(key, body, signal);
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new ModelCallError('timeout', 'Timeout', true);
      throw new ModelCallError('network', String(err?.message ?? err), true);
    }
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new ModelCallError('rate_limit', t.slice(0, 300), true);
      throw new ModelCallError('api_error', `${res.status} ${t.slice(0, 300)}`, res.status >= 500 || res.status === 529);
    }

    let ttft: number | null = null;
    let text = '';
    let inputTokens = 0, outputTokens = 0, thinkingTokens = 0;
    let stop: string | null = null;
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
        buf += decoder.decode(chunk, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = block.split('\n').find(l => l.startsWith('data: '))?.slice(6);
          if (!data) continue;
          const ev = JSON.parse(data);
          if (ev.type === 'message_start') {
            const u = ev.message?.usage ?? {};
            inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
          } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && !viaTool) {
            if (ttft === null) ttft = performance.now() - start;
            text += ev.delta.text;
          } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta' && viaTool) {
            if (ttft === null) ttft = performance.now() - start;
            text += ev.delta.partial_json;
          } else if (ev.type === 'message_delta') {
            stop = ev.delta?.stop_reason ?? stop;
            if (ev.usage?.output_tokens !== undefined) outputTokens = ev.usage.output_tokens;
            thinkingTokens = ev.usage?.output_tokens_details?.thinking_tokens ?? thinkingTokens;
          } else if (ev.type === 'error') {
            const kind = ev.error?.type === 'overloaded_error' ? 'api_error' : 'api_error';
            throw new ModelCallError(kind, JSON.stringify(ev.error).slice(0, 300), ev.error?.type === 'overloaded_error');
          }
        }
      }
    } catch (err: any) {
      if (err instanceof ModelCallError) throw err;
      if (err?.name === 'AbortError') throw new ModelCallError('timeout', 'Timeout', true);
      throw new ModelCallError('network', String(err?.message ?? err), true);
    }
    const completion = performance.now() - start;
    if (stop === 'refusal' || !text.trim()) throw new ModelCallError('refusal_or_empty', `leere Antwort (stop_reason ${stop})`, false);
    if (wrapped) {
      try { text = JSON.stringify(JSON.parse(text).items); } catch { /* bleibt roh, zählt als Schemafehler */ }
    }
    return { text, inputTokens, outputTokens, thinkingTokens, ttftMs: ttft, completionMs: completion, stopReason: stop, providerNotes: notes };
  },
};
