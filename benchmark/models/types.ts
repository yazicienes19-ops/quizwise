import type { ModelConfig } from '../benchmark.config.ts';

/** Genau das, was services/geminiService.ts an /api/gemini/generate schickt. */
export interface AppRequest {
  parts: { text?: string; inlineData?: unknown; storageRef?: unknown }[];
  systemInstruction?: string;
  complexity?: 'light' | 'heavy';
  examWorkflow?: boolean;
  grading?: boolean;
  config?: {
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: unknown;
    thinkingConfig?: { thinkingBudget: number };
  };
  tools?: unknown[];
}

export type FailureKind = 'timeout' | 'rate_limit' | 'api_error' | 'network' | 'refusal_or_empty';

export interface ModelResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  /** Zeitpunkte relativ zu requestStart (ms). */
  ttftMs: number | null;
  completionMs: number;
  stopReason: string | null;
  /** Abweichungen vom App-Request, die der Anbieter erzwingt (für den Report). */
  providerNotes: string[];
}

export class ModelCallError extends Error {
  kind: FailureKind;
  retryable: boolean;
  constructor(kind: FailureKind, message: string, retryable: boolean) {
    super(message);
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface ModelAdapter {
  call(req: AppRequest, model: ModelConfig, opts: { maxOutputTokens: number; signal: AbortSignal }): Promise<ModelResult>;
}

/** Geminis Schema (OpenAPI-Teilmenge, Typen groß) → JSON Schema für Claudes Structured Outputs.
 *  Optionale Felder bleiben optional (nicht in required) statt nullable: das API erlaubt nur
 *  wenige Union-Typen pro Schema (Probelauf 07.10.2026: "too many parameters with union types"). */
export const toJsonSchema = (s: any): any => {
  if (!s || typeof s !== 'object') return s;
  const out: any = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]));
    out.additionalProperties = false;
    if (s.required?.length) out.required = s.required;
  }
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.enum) out.enum = s.enum;
  if (s.description) out.description = s.description;
  if (s.nullable) return { anyOf: [out, { type: 'null' }] };
  return out;
};

/** Text aller Parts (der Benchmark nutzt nur Text-Quellen, damit alle Modelle dasselbe sehen). */
export const promptText = (req: AppRequest): string => {
  if (req.parts.some(p => !p.text)) throw new Error('Benchmark unterstützt nur Text-Parts (keine Dateien/Bilder).');
  return req.parts.map(p => p.text).join('\n\n');
};
