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

    const response = await ai.models.generateContent(request);
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    res.json({ text });

  } catch (err) {
    console.error('Gemini Fehler:', err.message);
    next(err);
  }
});

module.exports = router;
