// Einzige Quelle der Wahrheit für Gemini-Modell-Strings. ALLE Call-Sites im
// Backend importieren von hier statt den String erneut zu tippen — sonst
// vergisst ein künftiges Modell-Upgrade unbemerkt einzelne Stellen (genau das
// ist documents.js passiert: hing nach dem 2.5→3.5-Upgrade unbemerkt weiter
// auf 'gemini-2.5-flash-lite' fest, weil dort ein eigener Literal stand statt
// diese Konstante zu nutzen).
const MODEL_LITE = 'gemini-3.5-flash-lite';
const MODEL_HEAVY = 'gemini-3.8-flash';
// Nur für Admins im Lernstudio (Schalter "Argon", Vergleich mit 3.8 Flash).
// Laut API-Modellliste (14.10.2026): max. 32.768 Output-Tokens, Thinking an,
// thinkingBudget:0 wird akzeptiert.
const MODEL_ARGON = 'gemini-4-argon';

// Listenpreise in USD pro 1 Mio. Tokens (Paid Tier, Stand 2026-09-22 laut
// ai.google.dev/gemini-api/docs/pricing). Output schließt Thinking-Tokens ein.
// cached = Preis für Eingabe-Tokens aus Geminis (automatischem) Kontext-Cache,
// 10 % des Eingabepreises; ab der zweiten Anfrage mit demselben Dokument
// kommen meist 75–90 % der Eingabe von dort (gemessen 03.10.2026).
// 3.8 Flash verdoppelt sich zum 01.01.2027 — deshalb datumsabhängig. Beim
// Modellwechsel hier mitpflegen, sonst rechnet das Budget (aiBudget.js) mit
// falschen Preisen; unbekannte Modelle werden vorsichtshalber zum teuersten
// bekannten Preis gerechnet.
const PRICE_TABLE = {
  [MODEL_LITE]: [{ from: null, input: 0.30, cached: 0.03, output: 2.50 }],
  [MODEL_HEAVY]: [
    { from: null, input: 0.75, cached: 0.075, output: 3.75 },
    { from: '2027-01-01', input: 1.50, cached: 0.15, output: 7.50 },
  ],
  // Einführungspreis bis 30.11.2026 laut Presseberichten (13.10.2026), danach
  // Listenpreis. Cached = 5 % des Eingabepreises (95 % Rabatt). Auf der
  // offiziellen Preisseite nachprüfen, sobald sie Argon führt.
  [MODEL_ARGON]: [
    { from: null, input: 2.00, cached: 0.10, output: 10.00 },
    { from: '2026-12-01', input: 4.00, cached: 0.20, output: 20.00 },
  ],
};
// Grounding mit Google Search: 14 $ pro 1.000 Anfragen. Das Freikontingent
// (5.000/Monat) wird bewusst NICHT abgezogen — lieber zu hoch schätzen.
const SEARCH_PRICE_USD = 0.014;

const priceFor = (model, date = new Date()) => {
  const day = date.toISOString().slice(0, 10);
  const pick = (rows) => rows.filter(r => !r.from || r.from <= day).pop();
  if (PRICE_TABLE[model]) return pick(PRICE_TABLE[model]);
  const all = Object.values(PRICE_TABLE).map(pick);
  return {
    input: Math.max(...all.map(p => p.input)),
    cached: Math.max(...all.map(p => p.cached)),
    output: Math.max(...all.map(p => p.output)),
  };
};

// Kosten eines Aufrufs in USD aus Geminis usageMetadata.
const costOfUsage = (model, usage, { searches = 0, date = new Date() } = {}) => {
  const p = priceFor(model, date);
  const prompt = usage?.promptTokenCount || 0;
  // cachedContentTokenCount ist in promptTokenCount enthalten.
  const cached = Math.min(usage?.cachedContentTokenCount || 0, prompt);
  const output = (usage?.candidatesTokenCount || 0) + (usage?.thoughtsTokenCount || 0);
  return ((prompt - cached) * p.input + cached * p.cached + output * p.output) / 1e6 + searches * SEARCH_PRICE_USD;
};

module.exports = { MODEL_LITE, MODEL_HEAVY, MODEL_ARGON, priceFor, costOfUsage, SEARCH_PRICE_USD };
