const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { supabase } = require('../middleware/auth');

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Löst ein storageRef-Part auf: lädt Datei von Supabase, gibt inlineData zurück.
// userId stellt sicher dass Nutzer nur ihre eigenen Dateien abrufen können.
const resolveStorageRef = async (part, userId) => {
  if (!part.storageRef) return part;
  const { path, mimeType } = part.storageRef;
  if (!path.startsWith(`${userId}/`)) {
    throw new Error('Zugriff verweigert: Ungültiger Dateipfad.');
  }
  const { data, error } = await supabase.storage.from('document-files').download(path);
  if (error) throw new Error(`Supabase Download-Fehler: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  return { inlineData: { data: buffer.toString('base64'), mimeType } };
};

// POST /api/gemini/generate
// Frontend schickt: { model, parts, systemInstruction, config, tools }
// Wir antworten mit: { text }
router.post('/generate', async (req, res, next) => {
  try {
    const { model, parts, systemInstruction, config, tools } = req.body;
    const userId = req.user.id;

    if (!parts || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ error: 'parts[] erforderlich' });
    }

    // storageRef-Parts durch echte inlineData ersetzen (PDFs/Bilder direkt von Supabase laden)
    const resolvedParts = await Promise.all(parts.map(part => resolveStorageRef(part, userId)));

    const generationConfig = {
      temperature: config?.temperature ?? 0.7,
    };
    if (config?.responseMimeType) generationConfig.responseMimeType = config.responseMimeType;
    if (config?.responseSchema)   generationConfig.responseSchema   = config.responseSchema;
    if (config?.thinkingConfig)   generationConfig.thinkingConfig   = config.thinkingConfig;
    if (systemInstruction)        generationConfig.systemInstruction = systemInstruction;

    const request = {
      model: 'gemini-2.5-flash',
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
