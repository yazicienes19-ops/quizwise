const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { supabase } = require('../middleware/auth');

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const DIGEST_PROMPT = `Analysiere dieses Dokument und erstelle einen vollständigen Lerndigest auf Deutsch.

Erfasse ALLE Lerninhalte lückenlos:
- Definitionen und Fachbegriffe mit Erklärungen
- Theorien, Modelle, Konzepte und Frameworks
- Wichtige Fakten, Zahlen, Zusammenhänge und Kausalitäten
- Beispiele und Anwendungsfälle
- Hauptthemen und deren Unterthemen

Strukturiere den Digest in klar benannte Abschnitte nach Themen.
Dieser Digest ersetzt das Originaldokument für alle zukünftigen KI-Aufrufe (Quiz, Karteikarten, Erklärer) — sei vollständig.`;

// POST /api/documents/:id/analyze
// Antwortet sofort, analysiert im Hintergrund
router.post('/:id/analyze', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (docErr || !doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  if (doc.digest_status === 'ready') return res.json({ status: 'already_done' });

  res.json({ status: 'analyzing' });

  // Hintergrund-Analyse
  (async () => {
    try {
      await supabase.from('documents').update({ digest_status: 'pending' }).eq('id', id);

      let part;
      if (doc.storage_path) {
        const { data: fileData, error: fileErr } = await supabase.storage
          .from('document-files')
          .download(doc.storage_path);
        if (fileErr) throw fileErr;
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const mimeType = doc.file_type === 'pdf' ? 'application/pdf'
          : doc.mime_type || 'image/jpeg';
        part = { inlineData: { data: buffer.toString('base64'), mimeType } };
      } else if (doc.content_text) {
        part = { text: doc.content_text };
      } else {
        throw new Error('Kein Dateiinhalt verfügbar.');
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [part, { text: DIGEST_PROMPT }] }],
        config: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
      });

      const digestText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      await supabase.from('documents').update({ digest_text: digestText, digest_status: 'ready' }).eq('id', id);
    } catch (err) {
      console.error('Digest-Fehler:', err.message);
      await supabase.from('documents').update({ digest_status: 'error' }).eq('id', id).catch(() => {});
    }
  })();
});

module.exports = router;
