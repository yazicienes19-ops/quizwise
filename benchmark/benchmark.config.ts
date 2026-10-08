// Zentrale Benchmark-Konfiguration. Modell-IDs und Preise stehen NUR hier.
// Preise: USD pro 1 Mio. Tokens (Listenpreis ohne Cache, ohne Batch). Stand 07.10.2026:
// Gemini laut backend/src/config/geminiModels.js, Claude laut platform.claude.com/docs/en/about-claude/pricing.

export type Provider = 'gemini' | 'anthropic';
export type ReasoningMode = 'app-default' | 'off' | 'adaptive-low' | 'adaptive-high';

export interface PriceTier {
  /** Gilt ab dieser Prompt-Größe (Eingabe-Tokens, exklusiv), sonst die Stufe darunter. */
  aboveInputTokens?: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

export interface ModelConfig {
  id: string;
  label: string;
  provider: Provider;
  apiModel: string;
  reasoningMode: ReasoningMode;
  /** Aufsteigend nach aboveInputTokens; die erste Stufe ohne Schwelle ist die Basis. */
  prices: PriceTier[];
  enabled: boolean;
}

export const MODELS: ModelConfig[] = [
  {
    id: 'gemini-lite', label: 'Gemini 3.5 Flash-Lite', provider: 'gemini', apiModel: 'gemini-3.5-flash-lite',
    // Wie das Backend: Lite lehnt thinkingBudget 0 ab, der Parameter fällt dann weg (Modell-Standard).
    reasoningMode: 'app-default', enabled: true,
    prices: [{ inputPricePerMillion: 0.30, outputPricePerMillion: 2.50 }],
  },
  {
    id: 'gemini-flash', label: 'Gemini 3.8 Flash', provider: 'gemini', apiModel: 'gemini-3.8-flash',
    reasoningMode: 'app-default', enabled: true,
    // Einführungspreis bis 31.12.2026, danach 1,50 / 7,50.
    prices: [{ inputPricePerMillion: 0.75, outputPricePerMillion: 3.75 }],
  },
  {
    id: 'claude-haiku-no-thinking', label: 'Claude Haiku 5.5 (ohne Denken)', provider: 'anthropic', apiModel: 'claude-haiku-5-5',
    reasoningMode: 'off', enabled: true,
    prices: [
      { inputPricePerMillion: 0.10, outputPricePerMillion: 0.50 },
      { aboveInputTokens: 100_000, inputPricePerMillion: 0.50, outputPricePerMillion: 2.50 },
    ],
  },
  {
    id: 'claude-haiku-thinking', label: 'Claude Haiku 5.5 (Denken, effort low)', provider: 'anthropic', apiModel: 'claude-haiku-5-5',
    reasoningMode: 'adaptive-low', enabled: true,
    prices: [
      { inputPricePerMillion: 0.10, outputPricePerMillion: 0.50 },
      { aboveInputTokens: 100_000, inputPricePerMillion: 0.50, outputPricePerMillion: 2.50 },
    ],
  },
];

/** Prüfer für inhaltliche Kriterien (Checkliste gegen die Quelle). Sehen nie, welches Modell geantwortet hat.
 *  Nutzervorgabe (07.10.2026): nur Gemini 3.5 Lite, Gemini 3.8 Flash und Haiku 5.5 dürfen genutzt werden.
 *  Deshalb prüfen zwei der Kandidaten-Modelle (mit Nachdenken) jede Antwort; der Bericht misst, ob ein Prüfer
 *  die eigene Modellfamilie bevorzugt. Lite prüft nicht (schwächstes Modell). */
export const JUDGES: ModelConfig[] = [
  {
    id: 'judge-haiku', label: 'Claude Haiku 5.5 (Prüfer, Denken)', provider: 'anthropic', apiModel: 'claude-haiku-5-5',
    reasoningMode: 'adaptive-high', enabled: true,
    prices: [
      { inputPricePerMillion: 0.10, outputPricePerMillion: 0.50 },
      { aboveInputTokens: 100_000, inputPricePerMillion: 0.50, outputPricePerMillion: 2.50 },
    ],
  },
  {
    id: 'judge-flash', label: 'Gemini 3.8 Flash (Prüfer, Denken)', provider: 'gemini', apiModel: 'gemini-3.8-flash',
    reasoningMode: 'adaptive-high', enabled: true,
    prices: [{ inputPricePerMillion: 0.75, outputPricePerMillion: 3.75 }],
  },
];

/** Nur diese API-Modelle sind erlaubt (Nutzervorgabe). Jeder andere Modellname bricht ab. */
export const ALLOWED_API_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'claude-haiku-5-5'];

export const RUN = {
  /** Wiederholungen je Testfall und Modell. */
  repeat: 3,
  /** Welche Wiederholungen die Prüfer bewerten (Kosten). Konsistenz kommt aus den det/gold-Checks aller Runden. */
  judgeRepeats: [1],
  /** Warm-up-Anfragen je Modell vor dem Lauf, nicht in den Ergebnissen. */
  warmup: 2,
  /** Gleichzeitige Anfragen je Anbieter (für alle Modelle gleich). */
  concurrencyPerProvider: 4,
  /** Gesamtzeit pro Versuch, danach Abbruch als Timeout. */
  timeoutMs: 180_000,
  /** Wiederholungen NUR bei technischen Fehlern (Überlast, 5xx, Netz). Für alle Modelle gleich. */
  retries: 2,
  /** Wie das Backend (gemini.js): 16k normal, 32k für Klausur-Aufrufe (examWorkflow). */
  maxOutputTokens: 16_384,
  maxOutputTokensExam: 32_768,
};

/** Production Gates: Produktentscheidungen, keine Naturgesetze. */
export const GATES = {
  minQuality: 85,
  maxCriticalErrorRate: 0.05,
  maxSchemaFailureRate: 0.01,
  maxTechnicalFailureRate: 0.02,
};

/** Gewichte des StudeArc-Produkt-Scores (Summe 1). */
export const PRODUCT_WEIGHTS = { quality: 0.5, reliability: 0.2, latency: 0.15, cost: 0.15 };

export const DATASET_VERSION = process.env.BENCHMARK_DATASET ?? 'v1-probe';

export const priceFor = (m: ModelConfig, inputTokens: number): PriceTier =>
  [...m.prices].reverse().find(p => p.aboveInputTokens === undefined || inputTokens > p.aboveInputTokens) ?? m.prices[0];
