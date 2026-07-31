const express = require('express');
const { JSDOM } = require('jsdom');
const { validatePublicHttpUrl } = require('../utils/urlSafety');
const router = express.Router();

class LookupError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// DOI per Content Negotiation (offener Standard, kein Zotero-Code nötig):
// doi.org liefert bei Accept: application/vnd.citationstyles.csl+json die
// strukturierten Metadaten direkt vom Verlag.
const DOI_RE = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/\S+)$/i;

function extractDoi(raw) {
  const m = raw.match(DOI_RE);
  return m ? m[1].replace(/[.,;]+$/, '') : null;
}

function mapCslType(cslType) {
  if (!cslType) return 'other';
  // Crossref liefert eigene Typ-Namen (z.B. "journal-article"), nicht immer
  // die reine CSL-Vokabel ("article-journal") — daher includes() statt startsWith().
  const t = cslType.toLowerCase();
  if (t.includes('article') || t === 'paper-conference') return 'article';
  if (t.includes('book') || t === 'monograph' || t === 'chapter') return 'book';
  return 'other';
}

function formatCslAuthors(authorList) {
  if (!Array.isArray(authorList)) return '';
  return authorList
    .map(a => [a.given, a.family].filter(Boolean).join(' ').trim())
    .filter(Boolean)
    .join(', ');
}

async function lookupDoi(doi) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(`https://doi.org/${encodeURI(doi)}`, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'application/vnd.citationstyles.csl+json' },
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new LookupError(502, 'DOI-Dienst gerade nicht erreichbar.');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new LookupError(404, 'Diese DOI wurde nicht gefunden.');
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    throw new LookupError(422, 'Für diese DOI liegen keine strukturierten Metadaten vor.');
  }
  const item = await response.json();
  const year = item.issued?.['date-parts']?.[0]?.[0];
  return {
    title: item.title || '',
    authors: formatCslAuthors(item.author) || 'Unbekannte Autoren',
    year: year ? String(year) : '',
    journal: item['container-title'] || '',
    doi,
    url: `https://doi.org/${doi}`,
    type: mapCslType(item.type),
    isWeb: false,
  };
}

// Publikationsseiten ohne DOI: Highwire-Press-`citation_*`-Meta-Tags sind der
// Standard, den u.a. Zotero selbst zum Auslesen von Seiten wie SpringerLink,
// ScienceDirect, PubMed oder ResearchGate nutzt — kein Scraping-Code aus dem
// Zotero-Projekt nötig, die Verlage betten die Tags selbst ein.
function pickMeta(doc, names) {
  for (const name of names) {
    const els = doc.querySelectorAll(`meta[name="${name}"]`);
    if (els.length) return Array.from(els).map(e => e.getAttribute('content')).filter(Boolean);
  }
  return [];
}

async function lookupUrl(raw) {
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = validatePublicHttpUrl(href);
  if (!url) throw new LookupError(400, 'Das ist keine gültige DOI oder URL.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(url.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StudeArcBot/1.0; +https://www.studearc.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new LookupError(502, 'Diese Adresse ist nicht erreichbar.');
  } finally {
    clearTimeout(timeout);
  }
  if (!validatePublicHttpUrl(response.url || url.href)) {
    throw new LookupError(400, 'Diese Adresse kann nicht geladen werden.');
  }
  if (!response.ok) throw new LookupError(422, `Seite nicht erreichbar (HTTP ${response.status}).`);

  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml/.test(contentType)) {
    throw new LookupError(422, 'Diese Adresse liefert keine lesbare Seite.');
  }

  const html = await response.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const doi = pickMeta(doc, ['citation_doi'])[0] || null;
  const title = pickMeta(doc, ['citation_title'])[0]
    || doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
    || doc.title || '';
  const authorsList = pickMeta(doc, ['citation_author']);
  const journal = pickMeta(doc, ['citation_journal_title', 'citation_conference_title'])[0]
    || doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
  const dateRaw = pickMeta(doc, ['citation_publication_date', 'citation_online_date', 'citation_date'])[0] || '';
  const yearMatch = dateRaw.match(/\d{4}/);

  if (!title) throw new LookupError(422, 'Auf dieser Seite ließen sich keine Quellenangaben finden.');

  return {
    title,
    // citation_author-Werte kommen oft schon als "Nachname, Vorname" pro
    // Person — mit ";" statt "," verbinden, das ist der Personen-Trenner,
    // den citeprocService.parseAuthorNames erkennt (sonst zerreißt der
    // Komma-Parser mehrere Namen in eine einzige falsche Person).
    authors: authorsList.join('; ') || 'Unbekannte Autoren',
    year: yearMatch ? yearMatch[0] : '',
    journal,
    doi,
    url: response.url || url.href,
    type: doi ? 'article' : 'other',
    isWeb: !doi,
  };
}

// GET /api/search/lookup?q=<DOI-oder-URL>
router.get('/lookup', async (req, res, next) => {
  try {
    const raw = (req.query.q || '').toString().trim();
    if (!raw) return res.status(400).json({ error: 'DOI oder URL erforderlich' });
    const doi = extractDoi(raw);
    const result = doi ? await lookupDoi(doi) : await lookupUrl(raw);
    res.json({ result });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Anfrage hat zu lange gedauert. Bitte erneut versuchen.' });
    }
    if (err instanceof LookupError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return null;
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) words[pos] = word;
  }
  return words.filter(Boolean).join(' ') || null;
}

// GET /api/search/scholar?query=...
router.get('/scholar', async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'query erforderlich' });

    const fields = 'title,authorships,publication_year,abstract_inverted_index,primary_location,doi,cited_by_count';
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=10&select=${fields}&mailto=support@studearc.com`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw new Error(`OpenAlex Fehler: ${response.status}`);

    const data = await response.json();

    const results = (data.results || [])
      .filter(p => p.title && p.publication_year)
      .map(paper => {
        const authorNames = (paper.authorships || [])
          .slice(0, 6)
          .map(a => a.author?.display_name)
          .filter(Boolean);
        const authorsStr = authorNames.join(', ') || 'Unbekannte Autoren';

        const doiRaw = paper.doi ? paper.doi.replace('https://doi.org/', '') : null;
        const doiUrl = doiRaw ? `https://doi.org/${doiRaw}` : null;

        const journal = paper.primary_location?.source?.display_name || 'Akademische Publikation';
        const year = String(paper.publication_year || 'n.d.');
        const abstract = reconstructAbstract(paper.abstract_inverted_index);

        // APA-7
        const apaAuthors = authorNames.map(name => {
          const parts = name.trim().split(' ');
          const last = parts[parts.length - 1];
          const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
          return initials ? `${last}, ${initials}` : last;
        }).join(', ');
        let apa = apaAuthors ? `${apaAuthors} (${year}). ${paper.title}.` : `(${year}). ${paper.title}.`;
        if (journal) apa += ` ${journal}.`;
        if (doiUrl) apa += ` ${doiUrl}`;

        return {
          title: paper.title,
          authors: authorsStr,
          year,
          journal,
          url: doiUrl || `https://openalex.org/${paper.id?.split('/').pop()}`,
          apaCitation: apa,
          snippet: abstract || 'Kein Abstract verfügbar.',
          abstract,
          doi: doiRaw,
          doi_url: doiUrl,
          citationCount: paper.cited_by_count ?? null,
        };
      });

    res.json({ results });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Suchanfrage hat zu lange gedauert. Bitte erneut versuchen.' });
    }
    next(err);
  }
});

// GET /api/search/web?query=...
router.get('/web', async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'query erforderlich' });

    const url = `https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=10&srprop=snippet&origin=*`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw new Error(`Wikipedia Fehler: ${response.status}`);

    const data = await response.json();

    const results = (data.query?.search || []).map(item => {
      const cleanSnippet = item.snippet.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      const wikiTitle = encodeURIComponent(item.title.replace(/ /g, '_'));
      return {
        title: item.title,
        authors: 'Wikipedia',
        year: new Date().getFullYear().toString(),
        url: `https://de.wikipedia.org/wiki/${wikiTitle}`,
        apaCitation: '',
        snippet: cleanSnippet,
        journal: 'Wikipedia – Die freie Enzyklopädie',
        isWeb: true,
      };
    });

    res.json({ results });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Suchanfrage hat zu lange gedauert. Bitte erneut versuchen.' });
    }
    next(err);
  }
});

module.exports = router;
