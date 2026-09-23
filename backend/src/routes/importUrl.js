const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { checkUsageLimit } = require('../middleware/limits');
const { validatePublicHttpUrl } = require('../utils/urlSafety');
const { MODEL_LITE } = require('../config/geminiModels');
const { getBudgetStatus, recordUsage, budgetExhaustedError } = require('../budget/aiBudget');
const { normalizeLanguage, languageLine } = require('../utils/outputLanguage');

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FETCH_TIMEOUT_MS = 20_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 400_000;

function parseYouTubeId(url) {
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null;
  if (host !== 'youtube.com') return null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const m = url.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/);
  return m ? m[2] : null;
}

async function fetchWithTimeout(target, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(target, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

// ── YouTube: Video → strukturierte Lernnotizen ───────────────────────────────
// Gemini kann öffentliche YouTube-Videos direkt per URL verarbeiten — kein
// Transkript-Scraping nötig (das von Cloud-IPs aus regelmäßig blockiert wird).

// language: 'de' (Default) | 'en' | 'tr' — steuert nur die Ausgabesprache des Skripts.
const youtubePrompt = (language = 'de') => {
  const langLine = languageLine(language);
  return `Du erhältst ein Lehrvideo. Erstelle daraus ein vollständiges, lernfertiges Skript ${langLine}.

Regeln:
- Gib AUSSCHLIESSLICH Inhalte wieder, die im Video vorkommen — kein externes Wissen ergänzen.
- Gliedere nach den inhaltlichen Abschnitten des Videos mit Markdown-Überschriften (## Abschnittstitel).
- Schreibe in vollständigen Sätzen; alle Definitionen, Beispiele, Zahlen und Merksätze aus dem Video übernehmen.
- Keine Meta-Kommentare ("In diesem Video...", "Der Sprecher sagt...") — formuliere den Stoff direkt als Lerntext.
- Beginne direkt mit der ersten Überschrift.`;
};

router.post('/youtube', checkUsageLimit, async (req, res) => {
  const url = validatePublicHttpUrl(req.body?.url);
  const language = normalizeLanguage(req.body?.language);
  const videoId = url && parseYouTubeId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Das ist kein gültiger YouTube-Link.' });
  }
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Monatsbudget: Videos sind die teuersten Einzelaufrufe (bis ~2 h Material).
  try {
    const budget = await getBudgetStatus(req.user.id, req.usage?.plan || 'free');
    if (budget.level === 'hard') return res.status(403).json({ error: budgetExhaustedError(budget.scope).message });
  } catch (err) {
    console.error('KI-Budget-Check (YouTube) fehlgeschlagen:', err.message);
    return res.status(500).json({ error: 'Serverfehler beim Limit-Check.' });
  }

  // Titel + Kanal über oEmbed (öffentlich, kein API-Key) — scheitert das,
  // ist das Video privat/gelöscht und Gemini würde ebenfalls scheitern.
  let title = 'YouTube-Video';
  let author = '';
  try {
    const oembed = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`
    );
    if (!oembed.ok) {
      return res.status(400).json({ error: 'Video nicht gefunden — ist es öffentlich?' });
    }
    const info = await oembed.json();
    title = info.title || title;
    author = info.author_name || '';
  } catch (err) {
    console.error('YouTube-oEmbed-Fehler:', err.message);
  }

  try {
    const response = await ai.models.generateContent({
      // War lange fest auf 'gemini-3.1-flash-lite' gepinnt, weil 2.5-flash-lite
      // beim Video-Verstehen damals durchgehend 503 (overloaded) lieferte.
      // Live gegen ein echtes YouTube-Video getestet (2026-08-29): MODEL_LITE
      // (jetzt 3.5) liefert stabil ein korrektes Ergebnis — daher hier auf die
      // zentrale Konstante umgestellt statt weiter einen eigenen Literal zu
      // pflegen. Falls künftig wieder 503-Häufungen speziell bei diesem Call
      // auftauchen, zuerst hier nachsehen, bevor an anderer Stelle gesucht wird.
      model: MODEL_LITE,
      contents: [{
        role: 'user',
        parts: [
          { fileData: { fileUri: canonicalUrl } },
          { text: youtubePrompt(language) },
        ],
      }],
      config: {
        temperature: 0.2,
        // LOW reicht für Sprache/Folien und erlaubt deutlich längere Videos
        mediaResolution: 'MEDIA_RESOLUTION_LOW',
      },
    });
    recordUsage(req.user.id, MODEL_LITE, response.usageMetadata);
    const text = response.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (text.trim().length < 100) {
      return res.status(422).json({ error: 'Aus diesem Video ließ sich kein Lerntext erstellen. Hat es eine Tonspur?' });
    }
    return res.json({ kind: 'youtube', url: canonicalUrl, title, author, text: text.slice(0, MAX_TEXT_CHARS) });
  } catch (err) {
    console.error('YouTube-Import-Fehler:', err.message);
    if (/UNAVAILABLE|"code":\s*503|overloaded/i.test(err.message)) {
      return res.status(503).json({ error: 'Die Verarbeitung ist gerade überlastet — bitte in ein paar Minuten erneut versuchen.' });
    }
    return res.status(502).json({ error: 'Video konnte nicht verarbeitet werden. Ist es öffentlich und nicht länger als ~2 Stunden?' });
  }
});

// ── Webseite: Artikel-Extraktion ──────────────────────────────────────────────

router.post('/web', async (req, res) => {
  const url = validatePublicHttpUrl(req.body?.url);
  if (!url) {
    return res.status(400).json({ error: 'Das ist keine gültige Web-Adresse (http/https).' });
  }

  try {
    const response = await fetchWithTimeout(url.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StudeArcBot/1.0; +https://www.studearc.com)',
        'Accept': 'text/html,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'de,en;q=0.8',
      },
    });
    // Redirects könnten auf interne Ziele umleiten — Endziel erneut prüfen
    if (!validatePublicHttpUrl(response.url || url.href)) {
      return res.status(400).json({ error: 'Diese Adresse kann nicht geladen werden.' });
    }
    if (!response.ok) {
      return res.status(422).json({ error: `Seite nicht erreichbar (HTTP ${response.status}).` });
    }
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|application\/xhtml/.test(contentType)) {
      return res.status(422).json({ error: 'Diese Adresse liefert keinen lesbaren Text. PDFs bitte als Datei hochladen.' });
    }

    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.length > MAX_HTML_BYTES) {
      return res.status(422).json({ error: 'Diese Seite ist zu groß zum Importieren.' });
    }
    const body = raw.toString('utf-8');

    if (contentType.includes('text/plain')) {
      return res.json({ kind: 'web', url: response.url || url.href, title: url.hostname, text: body.slice(0, MAX_TEXT_CHARS) });
    }

    const dom = new JSDOM(body, { url: response.url || url.href });
    const article = new Readability(dom.window.document).parse();
    const text = (article?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 200) {
      return res.status(422).json({ error: 'Auf dieser Seite ließ sich kein Artikeltext finden. Kopiere den Text notfalls über „Text einfügen".' });
    }
    return res.json({
      kind: 'web',
      url: response.url || url.href,
      title: article.title || dom.window.document.title || url.hostname,
      siteName: article.siteName || url.hostname,
      text: text.slice(0, MAX_TEXT_CHARS),
    });
  } catch (err) {
    console.error('Web-Import-Fehler:', err.message);
    const msg = err.name === 'AbortError'
      ? 'Die Seite hat zu lange nicht geantwortet.'
      : 'Seite konnte nicht geladen werden.';
    return res.status(502).json({ error: msg });
  }
});

module.exports = router;
