// Gemini wie im Backend (backend/src/routes/gemini.js buildGeminiRequest), nur gestreamt,
// damit die Zeit bis zum ersten Token messbar ist.
import { GoogleGenAI } from '@google/genai';
import type { ModelConfig } from '../benchmark.config.ts';
import { ModelCallError, type AppRequest, type ModelAdapter, type ModelResult } from './types.ts';

let client: GoogleGenAI | null = null;
const ai = () => {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY fehlt (benchmark/.env oder Umgebung).');
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
};

const classify = (err: any): ModelCallError => {
  const msg = String(err?.message ?? err);
  if (err?.name === 'AbortError' || /aborted/i.test(msg)) return new ModelCallError('timeout', msg, true);
  if (/RESOURCE_EXHAUSTED|\b429\b|rate limit/i.test(msg)) return new ModelCallError('rate_limit', msg, true);
  if (/overloaded|UNAVAILABLE|\b50[0-4]\b|DEADLINE|INTERNAL/i.test(msg)) return new ModelCallError('api_error', msg, true);
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(msg)) return new ModelCallError('network', msg, true);
  return new ModelCallError('api_error', msg, false);
};

export const geminiAdapter: ModelAdapter = {
  async call(req: AppRequest, model: ModelConfig, { maxOutputTokens, signal }): Promise<ModelResult> {
    const notes: string[] = [];
    const config: Record<string, unknown> = {
      temperature: req.config?.temperature ?? 0.7,
      maxOutputTokens,
      abortSignal: signal,
    };
    if (req.config?.responseMimeType) config.responseMimeType = req.config.responseMimeType;
    if (req.config?.responseSchema) config.responseSchema = req.config.responseSchema;
    if (req.systemInstruction) config.systemInstruction = req.systemInstruction;
    if (req.config?.thinkingConfig) config.thinkingConfig = req.config.thinkingConfig;
    if (model.reasoningMode === 'adaptive-high') config.thinkingConfig = { thinkingBudget: -1 };
    // Wie das Backend: Lite lehnt thinkingBudget 0 ab.
    if (model.apiModel.includes('lite') && (config.thinkingConfig as any)?.thinkingBudget === 0) {
      delete config.thinkingConfig;
      notes.push('thinkingBudget 0 entfernt (Lite lehnt es ab, wie im Backend)');
    }

    const start = performance.now();
    let ttft: number | null = null;
    let text = '';
    let usage: any = {};
    let finish: string | null = null;
    try {
      const stream = await ai().models.generateContentStream({
        model: model.apiModel,
        contents: [{ role: 'user', parts: req.parts as any }],
        config: config as any,
      });
      for await (const chunk of stream) {
        const t = (chunk.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('');
        if (t && ttft === null) ttft = performance.now() - start;
        text += t;
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
        if (chunk.candidates?.[0]?.finishReason) finish = String(chunk.candidates[0].finishReason);
      }
    } catch (err) {
      throw classify(err);
    }
    const completion = performance.now() - start;
    if (!text.trim()) throw new ModelCallError('refusal_or_empty', `leere Antwort (finishReason ${finish})`, false);
    return {
      text,
      inputTokens: usage.promptTokenCount ?? 0,
      // Gemini berechnet Denk-Tokens als Ausgabe.
      outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      thinkingTokens: usage.thoughtsTokenCount ?? 0,
      ttftMs: ttft,
      completionMs: completion,
      stopReason: finish,
      providerNotes: notes,
    };
  },
};
