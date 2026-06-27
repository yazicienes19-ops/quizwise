const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const resolveStorageRef = async (part, userId, sb) => {
  if (!part.storageRef) return part;
  const { path, mimeType } = part.storageRef;
  if (!path.startsWith(`${userId}/`)) {
    throw new Error('Zugriff verweigert: Ungültiger Dateipfad.');
  }
  const { data, error } = await sb.storage.from('document-files').download(path);
  if (error) throw new Error(`Supabase Download-Fehler: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  return { inlineData: { data: buffer.toString('base64'), mimeType } };
};

// Wählt das passende Gemini-Modell basierend auf User-Plan und Aufgaben-Komplexität.
// free  → immer flash-lite
// pro   → flash-lite bei leichten, flash bei schweren Aufgaben
const selectModel = (plan, complexity) => {
  if (plan === 'pro' && complexity === 'heavy') return 'gemini-3.1-flash-lite';
  return 'gemini-2.5-flash-lite';
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Vorübergehende Gemini-Fehler (Überlastung / kurzzeitiges Rate-Limit) sind in der
// Regel nach kurzem Warten weg. Statt sie direkt an den Nutzer durchzureichen,
// versuchen wir es mit exponentiellem Backoff erneut. SAFETY/ungültige Anfragen
// werden NICHT wiederholt (das ändert sich nicht).
const isTransient = (err) =>
  /overloaded|UNAVAILABLE|\b503\b|RESOURCE_EXHAUSTED|rate limit|\b429\b|DEADLINE|ETIMEDOUT|ECONNRESET|fetch failed/i
    .test(String(err?.message || ''));

const generateWithRetry = async (request, maxAttempts = 3) => {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isTransient(err)) throw err;
      // 0.8s, 1.6s, … + Jitter, damit nicht alle Clients gleichzeitig retrien
      const delay = 800 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400);
      console.warn(`Gemini transient (Versuch ${attempt}/${maxAttempts}), retry in ${delay}ms:`, err.message);
      await sleep(delay);
    }
  }
  throw lastErr;
};

// POST /api/gemini/generate
// Frontend schickt: { parts, systemInstruction, config, tools, complexity }
// Wir antworten mit: { text }
router.post('/generate', async (req, res, next) => {
  try {
    const { parts, systemInstruction, config, tools, complexity } = req.body;
    const sb = req.supabase;
    const userId = req.user.id;

    if (!parts || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ error: 'parts[] erforderlich' });
    }

    if (parts.length > 20) {
      return res.status(400).json({ error: 'Maximal 20 Parts erlaubt.' });
    }

    for (const part of parts) {
      if (typeof part !== 'object' || part === null) {
        return res.status(400).json({ error: 'Jeder Part muss ein Objekt sein.' });
      }
      if (!part.text && !part.inlineData && !part.storageRef) {
        return res.status(400).json({ error: 'Jeder Part braucht text, inlineData oder storageRef.' });
      }
    }

    const { data: profile } = await sb
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .single();
    const userPlan = profile?.plan || 'free';
    const selectedModel = selectModel(userPlan, complexity || 'light');

    const resolvedParts = await Promise.all(parts.map(part => resolveStorageRef(part, userId, sb)));

    const generationConfig = {
      temperature: config?.temperature ?? 0.7,
    };
    if (config?.responseMimeType) generationConfig.responseMimeType = config.responseMimeType;
    if (config?.responseSchema)   generationConfig.responseSchema   = config.responseSchema;
    if (config?.thinkingConfig)   generationConfig.thinkingConfig   = config.thinkingConfig;
    if (systemInstruction)        generationConfig.systemInstruction = systemInstruction;

    const request = {
      model: selectedModel,
      contents: [{ role: 'user', parts: resolvedParts }],
      config: generationConfig,
    };

    if (tools && tools.length > 0) request.tools = tools;

    const response = await generateWithRetry(request);
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    res.json({ text });

  } catch (err) {
    console.error('Gemini Fehler:', err.message);
    // Bekannte KI-Fehlerklassen mit sicheren, schlüsselwort-tragenden Meldungen
    // durchreichen (Frontend übersetzt anhand der Keywords). KEIN 429 verwenden —
    // das interpretiert das Frontend als Tageslimit. Alles andere bleibt intern (500).
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
    next(err);
  }
});

module.exports = router;
