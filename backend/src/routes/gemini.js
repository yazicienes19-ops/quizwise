const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { MODEL_LITE, MODEL_HEAVY } = require('../config/geminiModels');
const { getBudgetStatus, recordUsage, budgetExhaustedError } = require('../budget/aiBudget');

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Aggregiertes Limit über ALLE storageRef-Parts einer Anfrage (analog zum
// 18-MB-Cap in documents.js) — ohne das ließen sich bis zu 20 Parts aus
// Supabase Storage ungeprüft laden, base64-kodieren und im RAM halten, bevor
// überhaupt ein Gemini-Call versucht wird (Speicher-/Kosten-Risiko).
const MAX_TOTAL_STORAGE_BYTES = 18 * 1024 * 1024;

// Sequenziell statt Promise.all: bricht ab, sobald die Summe das Limit
// überschreitet, statt erst alle Downloads komplett abzuschließen.
const resolveStorageRefs = async (parts, userId, sb) => {
  let totalBytes = 0;
  const resolved = [];
  for (const part of parts) {
    if (!part.storageRef) { resolved.push(part); continue; }
    const { path, mimeType } = part.storageRef;
    if (!path.startsWith(`${userId}/`)) {
      throw new Error('Zugriff verweigert: Ungültiger Dateipfad.');
    }
    const { data, error } = await sb.storage.from('document-files').download(path);
    if (error) throw new Error(`Supabase Download-Fehler: ${error.message}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    totalBytes += buffer.length;
    if (totalBytes > MAX_TOTAL_STORAGE_BYTES) {
      const err = new Error(`Angehängte Dateien zu groß (max. ${Math.round(MAX_TOTAL_STORAGE_BYTES / 1024 / 1024)} MB insgesamt).`);
      err.statusCode = 400;
      err.expose = true;
      throw err;
    }
    resolved.push({ inlineData: { data: buffer.toString('base64'), mimeType } });
  }
  return resolved;
};

// Wählt das passende Gemini-Modell basierend auf User-Plan und Aufgaben-Komplexität.
// free  → immer flash-lite (3.5: schlägt 2.5-Lite an Qualität bei ~350 tok/s —
//         schnellste 3.5-Klasse, Preis bleibt Lite-Klasse)
// pro   → light: flash-lite (3.5) / heavy: gemini-3.8-flash (Frontier-Qualität
//         für die Premium-Aufgaben: Tutor-Chat, Feynman-Bewertung, Klausur,
//         Karten/Wissensnetz-Generierung). Bewusst zweistufig statt Vollsprung
//         auf 3.8 Flash überall: bei den token-hungrigen Chat-Historien im
//         Free-Plan wäre selbst der günstigere 3.8-Preis pro Nutzer:in nicht
//         tragbar — Free-Standard bleibt in der Lite-Preisklasse, nur
//         Pro+heavy zahlt Frontier. (Zuvor gemini-3.5-flash, kurz gemini-3.6-flash
//         — 2026-09-04 auf 3.8 gewechselt: gleicher Preis wie 3.6, neueres
//         Modell, akzeptiert anders als 3.6 thinkingBudget:0 ohne Fehler.)
// HINWEIS: Modell-Strings bewusst an EINER Stelle pflegbar/exportiert für Tests.
const selectModel = (plan, complexity) => {
  if (plan === 'pro' && complexity === 'heavy') return MODEL_HEAVY;
  return MODEL_LITE;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Vorübergehende Gemini-Fehler (Überlastung / kurzzeitiges Rate-Limit) sind in der
// Regel nach kurzem Warten weg. Statt sie direkt an den Nutzer durchzureichen,
// versuchen wir es mit exponentiellem Backoff erneut. SAFETY/ungültige Anfragen
// werden NICHT wiederholt (das ändert sich nicht).
const isTransient = (err) =>
  /overloaded|UNAVAILABLE|\b503\b|RESOURCE_EXHAUSTED|rate limit|\b429\b|DEADLINE|ETIMEDOUT|ECONNRESET|fetch failed/i
    .test(String(err?.message || ''));

const backoffDelay = (attempt) => 800 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400);

const generateWithRetry = async (request, maxAttempts = 3) => {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isTransient(err)) throw err;
      // 0.8s, 1.6s, … + Jitter, damit nicht alle Clients gleichzeitig retrien
      const delay = backoffDelay(attempt);
      console.warn(`Gemini transient (Versuch ${attempt}/${maxAttempts}), retry in ${delay}ms:`, err.message);
      await sleep(delay);
    }
  }
  throw lastErr;
};

// Wiederholt nur, solange noch nichts an den Client ging: der erste Chunk wird
// innerhalb des Retry-Fensters abgeholt (Fehler kommen oft erst beim ersten Lesen).
const streamWithRetry = async (request, maxAttempts = 3) => {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const stream = await ai.models.generateContentStream(request);
      const iterator = stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      return { first, iterator };
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isTransient(err)) throw err;
      const delay = backoffDelay(attempt);
      console.warn(`Gemini-Stream transient (Versuch ${attempt}/${maxAttempts}), retry in ${delay}ms:`, err.message);
      await sleep(delay);
    }
  }
  throw lastErr;
};

const chunkText = (chunk) =>
  (chunk?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');

// Gemeinsame Validierung + Request-Aufbau für /generate und /stream.
// Liefert { status, error } bei ungültiger Eingabe, sonst { request }.
const buildGeminiRequest = async (req) => {
  const { parts, systemInstruction, config, tools, complexity } = req.body;
  const sb = req.supabase;
  const userId = req.user.id;

  if (!parts || !Array.isArray(parts) || parts.length === 0) {
    return { status: 400, error: 'parts[] erforderlich' };
  }
  if (parts.length > 20) {
    return { status: 400, error: 'Maximal 20 Parts erlaubt.' };
  }
  for (const part of parts) {
    if (typeof part !== 'object' || part === null) {
      return { status: 400, error: 'Jeder Part muss ein Objekt sein.' };
    }
    if (!part.text && !part.inlineData && !part.storageRef) {
      return { status: 400, error: 'Jeder Part braucht text, inlineData oder storageRef.' };
    }
  }

  const { data: profile } = await sb
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single();
  const userPlan = profile?.plan || 'free';

  // Monatsbudget (budget/aiBudget.js): ab 80 % nur noch MODEL_LITE, ab 100 % gesperrt.
  const budget = await getBudgetStatus(userId, userPlan);
  if (budget.level === 'hard') throw budgetExhaustedError(budget.scope);
  const selectedModel = budget.level === 'soft' ? MODEL_LITE : selectModel(userPlan, complexity || 'light');

  const resolvedParts = await resolveStorageRefs(parts, userId, sb);

  const generationConfig = {
    temperature: config?.temperature ?? 0.7,
  };
  if (config?.responseMimeType) generationConfig.responseMimeType = config.responseMimeType;
  if (config?.responseSchema)   generationConfig.responseSchema   = config.responseSchema;
  if (config?.thinkingConfig)   generationConfig.thinkingConfig   = config.thinkingConfig;
  if (systemInstruction)        generationConfig.systemInstruction = systemInstruction;

  // gemini-3.5-flash-lite lehnt thinkingBudget:0 mit 400 INVALID_ARGUMENT ab
  // (anders als 2.5-Modelle und MODEL_HEAVY, wo das Thinking vollständig
  // deaktivierte — per echtem Testcall verifiziert, auch für das aktuelle
  // gemini-3.8-flash). Der Client fordert thinkingBudget:0 überall zur
  // Geschwindigkeit an, ohne zu wissen, welches Modell serverseitig
  // tatsächlich gewählt wird (Free-Plan landet z.B. auch bei complexity:
  // "heavy" auf MODEL_LITE). Weglassen statt z.B. auf -1 (dynamisches
  // Thinking) zu ändern, weil das unvorhersehbar Kosten/Latenz erhöhen
  // würde — die Anfrage läuft dann einfach ohne expliziten Thinking-
  // Parameter (Modell-Default).
  if (selectedModel === MODEL_LITE && generationConfig.thinkingConfig?.thinkingBudget === 0) {
    delete generationConfig.thinkingConfig;
  }

  const request = {
    model: selectedModel,
    contents: [{ role: 'user', parts: resolvedParts }],
    config: generationConfig,
  };
  if (tools && tools.length > 0) request.tools = tools;
  const searches = (tools || []).some(t => t && (t.googleSearch || t.googleSearchRetrieval)) ? 1 : 0;
  return { request, budget, searches };
};

const budgetNotice = (built) => (built.budget.level === 'soft' ? { budget: 'soft' } : {});

// Bekannte KI-Fehlerklassen mit sicheren, schlüsselwort-tragenden Meldungen
// durchreichen (Frontend übersetzt anhand der Keywords). KEIN 429 verwenden —
// das interpretiert das Frontend als Tageslimit. Alles andere bleibt intern (500).
const mapGeminiError = (err) => {
  const m = String(err?.message || '');
  if (/quota|RESOURCE_EXHAUSTED|rate limit|overloaded|UNAVAILABLE|\b503\b/i.test(m)) {
    err.statusCode = 503; err.expose = true;
    err.message = 'Die KI ist gerade ausgelastet (quota). Bitte in einer Minute erneut versuchen.';
  } else if (/SAFETY|blocked|PROHIBITED/i.test(m)) {
    err.statusCode = 400; err.expose = true;
    err.message = 'SAFETY: Die KI konnte diesen Inhalt nicht verarbeiten. Versuche einen anderen Abschnitt.';
  } else if (/timeout|DEADLINE|ETIMEDOUT/i.test(m)) {
    err.statusCode = 504; err.expose = true;
    err.message = 'timeout: Die KI-Anfrage hat zu lange gedauert. Bitte erneut versuchen.';
  }
  return err;
};

// POST /api/gemini/generate
// Frontend schickt: { parts, systemInstruction, config, tools, complexity }
// Wir antworten mit: { text }
router.post('/generate', async (req, res, next) => {
  try {
    const built = await buildGeminiRequest(req);
    if (built.error) return res.status(built.status).json({ error: built.error });

    const response = await generateWithRetry(built.request);
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    recordUsage(req.user.id, built.request.model, response.usageMetadata, { searches: built.searches });

    res.json({ text, ...budgetNotice(built) });

  } catch (err) {
    console.error('Gemini Fehler:', err.message);
    next(mapGeminiError(err));
  }
});

// POST /api/gemini/stream
// Gleiche Eingabe wie /generate. Antwort: NDJSON, je Zeile {"t": "..."} mit dem
// nächsten Textstück, am Ende {"done": true} oder {"error": "..."}. Fehler vor
// dem ersten Byte laufen wie bei /generate über den normalen Error-Handler.
router.post('/stream', async (req, res, next) => {
  let started = false;
  let built = null;
  let usage = null;
  try {
    built = await buildGeminiRequest(req);
    if (built.error) return res.status(built.status).json({ error: built.error });

    const { first, iterator } = await streamWithRetry(built.request);

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    started = true;

    // usageMetadata steht in den Chunks (vollständig im letzten), daher den
    // zuletzt gesehenen Stand verbuchen (bei Abbruch mitten im Stream im catch).
    let step = first;
    while (!step.done) {
      if (step.value?.usageMetadata) usage = step.value.usageMetadata;
      const t = chunkText(step.value);
      if (t) res.write(JSON.stringify({ t }) + '\n');
      step = await iterator.next();
    }
    recordUsage(req.user.id, built.request.model, usage, { searches: built.searches });
    res.end(JSON.stringify({ done: true, ...budgetNotice(built) }) + '\n');

  } catch (err) {
    console.error('Gemini-Stream Fehler:', err.message);
    const mapped = mapGeminiError(err);
    if (!started) return next(mapped);
    recordUsage(req.user.id, built.request.model, usage, { searches: built.searches });
    res.end(JSON.stringify({ error: mapped.expose ? mapped.message : 'Serverfehler bei der KI-Antwort.' }) + '\n');
  }
});

module.exports = router;
// Reine Logik exportiert für Unit-Tests (kein Express/Gemini nötig).
module.exports.selectModel = selectModel;
module.exports.isTransient = isTransient;
module.exports.MAX_TOTAL_STORAGE_BYTES = MAX_TOTAL_STORAGE_BYTES;
module.exports.chunkText = chunkText;
