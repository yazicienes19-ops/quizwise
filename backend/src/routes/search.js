const express = require('express');
const router = express.Router();

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
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=10&select=${fields}&mailto=demo@quizwise.app`;

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
