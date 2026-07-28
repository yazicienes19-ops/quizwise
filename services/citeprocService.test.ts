import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAuthorNames, mapSourceType, buildCslItem, formatAllStyles } from './citeprocService';

describe('parseAuthorNames', () => {
  it('parst einen einzelnen Namen', () => {
    expect(parseAuthorNames('Albert Einstein')).toEqual([{ family: 'Einstein', given: 'Albert' }]);
  });

  it('parst zwei Namen getrennt durch "und"', () => {
    expect(parseAuthorNames('Albert Einstein und Marie Curie')).toEqual([
      { family: 'Einstein', given: 'Albert' },
      { family: 'Curie', given: 'Marie' },
    ]);
  });

  it('parst zwei Namen getrennt durch "&"', () => {
    expect(parseAuthorNames('Albert Einstein & Marie Curie')).toEqual([
      { family: 'Einstein', given: 'Albert' },
      { family: 'Curie', given: 'Marie' },
    ]);
  });

  it('parst drei Namen getrennt durch Kommas', () => {
    expect(parseAuthorNames('Albert Einstein, Marie Curie, Niels Bohr')).toEqual([
      { family: 'Einstein', given: 'Albert' },
      { family: 'Curie', given: 'Marie' },
      { family: 'Bohr', given: 'Niels' },
    ]);
  });

  it('fällt bei einem Einzelwort-Namen auf family ohne given zurück', () => {
    expect(parseAuthorNames('Aristoteles')).toEqual([{ family: 'Aristoteles', given: '' }]);
  });

  it('gibt ein leeres Array bei leerem String zurück', () => {
    expect(parseAuthorNames('')).toEqual([]);
    expect(parseAuthorNames('   ')).toEqual([]);
  });

  it('parst das Formular-Platzhalter-Format "Nachname, Initiale & Nachname2, Initiale2"', () => {
    expect(parseAuthorNames('Müller, A. & Schmidt, B.')).toEqual([
      { family: 'Müller', given: 'A.' },
      { family: 'Schmidt', given: 'B.' },
    ]);
  });

  it('parst einen einzelnen "Nachname, Vorname"-Namen', () => {
    expect(parseAuthorNames('Einstein, Albert')).toEqual([{ family: 'Einstein', given: 'Albert' }]);
  });
});

describe('mapSourceType', () => {
  it('mappt article auf article-journal', () => {
    expect(mapSourceType('article')).toBe('article-journal');
  });
  it('mappt book auf book', () => {
    expect(mapSourceType('book')).toBe('book');
  });
  it('mappt other+isWeb auf webpage', () => {
    expect(mapSourceType('other', true)).toBe('webpage');
  });
  it('mappt other ohne isWeb auf document', () => {
    expect(mapSourceType('other', false)).toBe('document');
  });
});

describe('buildCslItem', () => {
  it('baut ein vollständiges CSL-JSON-Item', () => {
    const item = buildCslItem({
      authors: 'Albert Einstein, Marie Curie',
      title: 'Über die Relativität',
      year: '1920',
      journal: 'Annalen der Physik',
      url: 'https://example.com/paper',
      type: 'article',
    });
    expect(item).toEqual({
      id: 'src',
      type: 'article-journal',
      title: 'Über die Relativität',
      author: [{ family: 'Einstein', given: 'Albert' }, { family: 'Curie', given: 'Marie' }],
      issued: { 'date-parts': [[1920]] },
      'container-title': 'Annalen der Physik',
      URL: 'https://example.com/paper',
    });
  });

  it('lässt optionale Felder weg wenn nicht vorhanden', () => {
    const item = buildCslItem({ authors: '', title: 'Ohne Autor', year: '', type: 'other' });
    expect(item).toEqual({ id: 'src', type: 'document', title: 'Ohne Autor' });
  });
});

describe('formatAllStyles (echter citeproc-rs-Treiber mit den gebündelten CSL-Dateien)', () => {
  beforeAll(() => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/csl/')) {
        const filePath = join(process.cwd(), 'public', url);
        const text = readFileSync(filePath, 'utf-8');
        return new Response(text, { status: 200 });
      }
      return originalFetch(input as any);
    }) as typeof fetch;
  });

  it('formatiert eine Quelle mit 3 Autoren in allen 4 Stilen mit deutscher Locale', async () => {
    const result = await formatAllStyles({
      authors: 'Albert Einstein, Marie Curie, Niels Bohr',
      title: 'Grundlagen der modernen Physik',
      year: '1935',
      journal: 'Zeitschrift für Physik',
      type: 'article',
    });

    // APA: 3 Autoren, deutsche Locale -> "&" bleibt (Symbol-Regel), "und" für Fließtext-Verweis
    expect(result.apa.entry).toContain('1935');
    expect(result.apa.entry).toContain('Einstein');
    expect(result.apa.inTextKlammer).toContain('Einstein');
    expect(result.apa.inTextNarrativ.startsWith('Einstein')).toBe(true);

    // MLA
    expect(result.mla.entry).toContain('Einstein');
    expect(result.mla.inText.length).toBeGreaterThan(0);

    // Harvard: direct enthält den Seiten-Platzhalter
    expect(result.harvard.entry).toContain('1935');
    expect(result.harvard.direct).toContain('XX');

    // Chicago: fullNote enthält mehr Details als shortNote (Kurzform bei Zweitzitierung)
    expect(result.chicago.bibliography).toContain('Einstein');
    expect(result.chicago.fullNote.length).toBeGreaterThan(result.chicago.shortNote.length);
  });

  it('verwendet deutsche Locale-Begriffe (z.B. "S." statt "p.") beim Direktzitat', async () => {
    const result = await formatAllStyles({
      authors: 'Max Mustermann',
      title: 'Ein Testtitel',
      year: '2020',
      journal: 'Testjournal',
      type: 'article',
    });
    expect(result.harvard.direct).toMatch(/S\.\s?XX/);
  });
});
