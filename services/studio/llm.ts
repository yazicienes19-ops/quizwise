/**
 * Schnittstelle der Pipeline zum Modell. In der App über das Backend
 * (geminiService.callStudioStep), in Tests und im Eval austauschbar.
 */
export interface StudioLlmRequest {
  step: 'extract' | 'outline' | 'write' | 'check';
  prompt: string;
  schema: unknown;
  /** false = Flash-Lite, true = 3.8 Flash (Pro). */
  heavy: boolean;
  /** Admin-Schalter: Schreiben mit Gemini 4 Argon. */
  argon?: boolean;
  thinkingBudget?: number;
  temperature?: number;
}

/** Liefert das geparste JSON der Antwort. */
export type StudioLlm = (req: StudioLlmRequest) => Promise<unknown>;

/** Zwischenspeicher der Extraktion (Supabase studio_extractions + lokal). */
export interface ExtractionCache {
  get: (hash: string) => Promise<unknown[] | null>;
  set: (hash: string, docId: string, pageCount: number, units: unknown[]) => Promise<void>;
}

/** Höchstens n Aufgaben gleichzeitig, Reihenfolge der Ergebnisse bleibt. */
export const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};

export const sha256 = async (text: string): Promise<string> => {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
};
