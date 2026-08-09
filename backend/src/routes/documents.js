const express = require('express');
const { GoogleGenAI, createPartFromUri } = require('@google/genai');

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// App-IDs sind 9-Zeichen-base36 (Math.random), Alt-Daten können UUIDs sein —
// beides zulassen, nur das Zeichenformat absichern
const ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

// Gleiches Limit wie der Upload selbst (useDocuments.ts MAX_FILE_SIZE) — die
// Files API von Gemini würde deutlich mehr erlauben (bis 2 GB), aber ein
// Dokument, das der Upload schon ablehnen würde, muss die Analyse nicht
// erlauben. Über die Files API hochladen statt inline base64 zu senden, weil
// Geminis Inline-Grenze (~20 MB) sonst reguläre Vorlesungs-PDFs blockiert,
// die der Upload längst zugelassen hat (User-Fund: 45-MB-PDF blieb dauerhaft
// auf digest_status "error" hängen, nie sichtbar für den Nutzer).
const MAX_ANALYZE_BYTES = 50 * 1024 * 1024;

// Hochgeladene Dateien sind zunächst PROCESSING (v.a. bei Video/Audio) — bei
// PDFs/Bildern i.d.R. fast sofort ACTIVE, aber defensiv kurz pollen statt
// blind anzunehmen. 30x alle 2s = max. 60s, dann Abbruch statt Endlos-Warten.
const waitForFileActive = async (fileName) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const file = await ai.files.get({ name: fileName });
    if (file.state === 'ACTIVE') return file;
    if (file.state === 'FAILED') {
      throw new Error(`Gemini-Dateiverarbeitung fehlgeschlagen: ${file.error?.message || 'unbekannter Fehler'}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Gemini-Dateiverarbeitung hat zu lange gedauert.');
};

// language: 'de' (Default) | 'tr' — steuert nur die Ausgabesprache des Digests.
const digestPrompt = (language = 'de') => {
  const langLine = language === 'tr' ? 'auf Türkisch' : 'auf Deutsch';
  return `Analysiere dieses Dokument und erstelle einen vollständigen Lerndigest ${langLine}.

Erfasse ALLE Lerninhalte lückenlos:
- Definitionen und Fachbegriffe mit Erklärungen
- Theorien, Modelle, Konzepte und Frameworks
- Wichtige Fakten, Zahlen, Zusammenhänge und Kausalitäten
- Beispiele und Anwendungsfälle
- Hauptthemen und deren Unterthemen

Strukturiere den Digest in klar benannte Abschnitte nach Themen.
Dieser Digest ersetzt das Originaldokument für alle zukünftigen KI-Aufrufe (Quiz, Karteikarten, Erklärer) — sei vollständig.`;
};

// POST /api/documents/:id/analyze
// Antwortet sofort, analysiert im Hintergrund
router.post('/:id/analyze', async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Ungültige Dokument-ID.' });
  const language = req.body?.language === 'tr' ? 'tr' : 'de';

  const sb = req.supabase;
  const userId = req.user.id;

  const { data: doc, error: docErr } = await sb
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
      await sb.from('documents').update({ digest_status: 'pending' }).eq('id', id);

      let part;
      let uploadedFileName; // nur gesetzt, wenn über die Files API hochgeladen (zum Aufräumen danach)
      if (doc.storage_path) {
        const { data: fileData, error: fileErr } = await sb.storage
          .from('document-files')
          .download(doc.storage_path);
        if (fileErr) throw fileErr;
        const buffer = Buffer.from(await fileData.arrayBuffer());
        if (buffer.length > MAX_ANALYZE_BYTES) {
          throw new Error(`Datei zu groß für die Analyse (${(buffer.length / 1024 / 1024).toFixed(0)} MB, max. ${MAX_ANALYZE_BYTES / 1024 / 1024} MB).`);
        }
        const mimeType = doc.file_type === 'pdf' ? 'application/pdf'
          : doc.mime_type || 'image/jpeg';

        // Über die Files API statt inline base64 — Geminis Inline-Grenze liegt
        // bei ~20 MB, das würde reguläre Vorlesungs-PDFs bis zum Upload-Limit
        // (50 MB) sonst wieder blockieren.
        const uploadedFile = await ai.files.upload({ file: new Blob([buffer], { type: mimeType }), config: { mimeType } });
        const activeFile = await waitForFileActive(uploadedFile.name);
        uploadedFileName = activeFile.name;
        part = createPartFromUri(activeFile.uri, mimeType);
      } else if (doc.content_text) {
        part = { text: doc.content_text };
      } else {
        throw new Error('Kein Dateiinhalt verfügbar.');
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: 'user', parts: [part, { text: digestPrompt(language) }] }],
        config: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
      });

      const digestText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      await sb.from('documents').update({ digest_text: digestText, digest_status: 'ready' }).eq('id', id);

      // Aufräumen, nicht kritisch für den Digest selbst — Gemini löscht
      // hochgeladene Dateien ohnehin nach 48h automatisch, das hier ist nur,
      // um nicht unnötig Speicher/Kontingent zu belegen.
      if (uploadedFileName) {
        ai.files.delete({ name: uploadedFileName }).catch(() => {});
      }
    } catch (err) {
      console.error('Digest-Fehler:', err.message);
      // sb-Query-Builder ist nur "thenable" (implementiert .then() für await),
      // aber KEIN echtes Promise — .catch() direkt anhängen wirft TypeError
      // und crasht diesen fire-and-forget Hintergrund-Task komplett.
      try {
        await sb.from('documents').update({ digest_status: 'error' }).eq('id', id);
      } catch (updateErr) {
        console.error('Digest-Fehlerstatus konnte nicht gespeichert werden:', updateErr.message);
      }
    }
  })();
});

module.exports = router;
