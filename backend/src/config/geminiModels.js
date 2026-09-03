// Einzige Quelle der Wahrheit für Gemini-Modell-Strings. ALLE Call-Sites im
// Backend importieren von hier statt den String erneut zu tippen — sonst
// vergisst ein künftiges Modell-Upgrade unbemerkt einzelne Stellen (genau das
// ist documents.js passiert: hing nach dem 2.5→3.5-Upgrade unbemerkt weiter
// auf 'gemini-2.5-flash-lite' fest, weil dort ein eigener Literal stand statt
// diese Konstante zu nutzen).
const MODEL_LITE = 'gemini-3.5-flash-lite';
const MODEL_HEAVY = 'gemini-3.8-flash';

module.exports = { MODEL_LITE, MODEL_HEAVY };
