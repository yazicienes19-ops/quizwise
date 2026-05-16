const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// POST /api/gemini/generate
// Frontend schickt: { model, parts, systemInstruction, config, tools }
// Wir antworten mit: { text }
router.post('/generate', async (req, res, next) => {
  try {
    const { model, parts, systemInstruction, config, tools } = req.body;

    if (!parts || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ error: 'parts[] erforderlich' });
    }

    const generationConfig = {
      temperature: config?.temperature ?? 0.7,
    };
    if (config?.responseMimeType) generationConfig.responseMimeType = config.responseMimeType;
    if (config?.responseSchema)   generationConfig.responseSchema   = config.responseSchema;
    if (systemInstruction)        generationConfig.systemInstruction = systemInstruction;

    const request = {
      model: model || 'gemini-2.0-flash',
      contents: [{ role: 'user', parts }],
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
