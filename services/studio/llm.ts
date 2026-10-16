/**
 * Schnittstelle der Pipeline zum Modell. In der App über das Backend
 * (geminiService.streamStudioStep über guardedLlm), in Tests und im Eval austauschbar.
 */
export interface StudioLlmRequest {
  step: 'extract' | 'scan' | 'outline' | 'write' | 'check' | 'timeline';
  prompt: string;
  schema: unknown;
  /** false = Flash-Lite, true = 3.8 Flash (Pro). */
  heavy: boolean;
  /** Admin-Schalter: Schreiben mit Gemini 4 Argon. */
  argon?: boolean;
  thinkingBudget?: number;
  temperature?: number;
  /** Obergrenze der Antwort (Tokens). Beim Schreiben an das Wortbudget gekoppelt, damit ein Fehllauf früh endet. */
  maxOutputTokens?: number;
}

/**
 * Temperatur je Schritt. undefined = Standard des Modells (bei Gemini 3.x
 * 1.0; Google rät dort, ihn zu lassen, weil niedrigere Werte
 * Wiederholungsschleifen begünstigen). Phase 1 lief mit 0,1 bis 0,3; der
 * Vergleich im Eval (Phase 1.1) entscheidet, siehe Commit-Text.
 */
export const STUDIO_TEMPERATURE: Record<StudioLlmRequest['step'], number | undefined> = {
  extract: 0.1, scan: 0, outline: 0.2, write: 0.3, check: 0, timeline: 0.2,
};

/** Liefert das geparste JSON der Antwort. */
export type StudioLlm = (req: StudioLlmRequest) => Promise<unknown>;

/**
 * Rohe Verbindung zum Modell mit Zwischenständen: onText bekommt jeweils den
 * bisherigen Gesamttext, signal bricht die Antwort ab (auch beim Anbieter,
 * damit keine weiteren Tokens anfallen). finish: Grund des Endes, falls bekannt.
 */
export type StudioTransport = (
  req: StudioLlmRequest,
  onText: (fullSoFar: string) => void,
  signal: AbortSignal,
) => Promise<{ text: string; finish?: string }>;

export type LlmEventKind = 'loop' | 'bad_json' | 'max_tokens' | 'error';
export interface LlmEvent { step: StudioLlmRequest['step']; kind: LlmEventKind; detail: string; attempt: number }

/** Alle Versuche eines Aufrufs gescheitert. events: was jeweils passiert ist. */
export class StudioLlmError extends Error {
  constructor(public readonly events: LlmEvent[]) {
    super(`Modellantwort unbrauchbar: ${events.map(e => `${e.kind} (${e.detail})`).join('; ')}`);
  }
}

/** Grenzen, ab denen eine Antwort als Schleife gilt (Kostenbremse). */
export const RUNAWAY = { maxDigits: 20, maxYearChars: 4, maxFieldChars: 1500 } as const;

const TAIL = 6000;
const DIGIT_RUN = new RegExp(`\\d{${RUNAWAY.maxDigits + 1},}`);
const YEAR_RUN = new RegExp(`"year"\\s*:\\s*(?:"[^"]{${RUNAWAY.maxYearChars + 1},}|\\d{${RUNAWAY.maxYearChars + 1},})`);
const LONG_FIELD = new RegExp(`"(?:[^"\\\\]|\\\\.){${RUNAWAY.maxFieldChars + 1},}`);

/**
 * Prüft eine (auch unvollständige) JSON-Antwort auf typische Schleifen:
 * Jahr länger als 4 Zeichen, Ziffernfolge über 20 Zeichen, Textfeld über
 * 1.500 Zeichen. Liefert den Grund oder null. Geprüft wird nur das Ende,
 * damit der Aufwand je Zwischenstand klein bleibt.
 */
export const detectRunaway = (partial: string): string | null => {
  const tail = partial.length > TAIL ? partial.slice(-TAIL) : partial;
  if (YEAR_RUN.test(tail)) return 'Jahr länger als 4 Zeichen';
  if (DIGIT_RUN.test(tail)) return `Ziffernfolge über ${RUNAWAY.maxDigits} Zeichen`;
  if (LONG_FIELD.test(tail)) return `Textfeld über ${RUNAWAY.maxFieldChars} Zeichen`;
  return null;
};

/**
 * StudioLlm mit Kostenbremse: streamt die Antwort, bricht bei einer Schleife
 * sofort ab und versucht es direkt neu; ebenso bei ungültigem JSON oder am
 * Token-Limit abgeschnittener Antwort. Nach `attempts` Fehlversuchen
 * StudioLlmError, den die Pipeline je Kapitel auffängt.
 */
export const guardedLlm = (
  transport: StudioTransport,
  opts: { attempts?: number; onEvent?: (e: LlmEvent) => void } = {},
): StudioLlm => async req => {
  const attempts = opts.attempts ?? 2;
  const events: LlmEvent[] = [];
  const note = (kind: LlmEventKind, detail: string, attempt: number) => {
    const e = { step: req.step, kind, detail, attempt };
    events.push(e);
    opts.onEvent?.(e);
  };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    let loop: string | null = null;
    let res: { text: string; finish?: string };
    try {
      res = await transport(req, full => {
        if (loop) return;
        loop = detectRunaway(full);
        if (loop) controller.abort();
      }, controller.signal);
    } catch (err) {
      if (loop) { note('loop', loop, attempt); continue; }
      // Netz-/Serverfehler: nicht hier wiederholen (das macht das Backend), sondern weiterreichen.
      throw err;
    }
    if (loop) { note('loop', loop, attempt); continue; }
    if (res.finish === 'MAX_TOKENS') { note('max_tokens', `${res.text.length} Zeichen`, attempt); continue; }
    try {
      return JSON.parse(res.text || '{}');
    } catch {
      note('bad_json', `${res.text.length} Zeichen`, attempt);
    }
  }
  throw new StudioLlmError(events);
};

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
