import { describe, it, expect, beforeEach } from 'vitest';
import { parseHeadingPrefix, buildTocTree, detectHeadingCandidates, buildChaptersFromPages, buildChaptersFromCandidates, detectDenseChapters, disambiguateTitles, getEmbeddedOutlineChapters } from './pdfOutlineService';
import type { PositionedTextItem, PdfHandle } from './pdfPageService';

const item = (str: string, h: number): PositionedTextItem => ({ str, x: 0, y: 0, w: str.length * h * 0.5, h });

describe('parseHeadingPrefix', () => {
  it('erkennt Top-Level-Nummerierung ("2. Titel")', () => {
    expect(parseHeadingPrefix('2. Operante Konditionierung')).toEqual({ path: [2], title: 'Operante Konditionierung' });
  });

  it('erkennt Unterebenen ("2.1 Titel" / "2.1.1 Titel")', () => {
    expect(parseHeadingPrefix('2.1 Klassische Konditionierung')).toEqual({ path: [2, 1], title: 'Klassische Konditionierung' });
    expect(parseHeadingPrefix('2.1.1 Bedeutungstransfer')).toEqual({ path: [2, 1, 1], title: 'Bedeutungstransfer' });
  });

  it('liefert null ohne erkennbare Nummerierung', () => {
    expect(parseHeadingPrefix('Organisatorisches')).toBeNull();
    expect(parseHeadingPrefix('Lernpsychologie')).toBeNull();
  });

  it('liefert null bei Nummer ohne Titel dahinter', () => {
    expect(parseHeadingPrefix('2.1')).toBeNull();
    expect(parseHeadingPrefix('2.1   ')).toBeNull();
  });

  it('ignoriert führenden/nachfolgenden Whitespace', () => {
    expect(parseHeadingPrefix('  3. Modelllernen  ')).toEqual({ path: [3], title: 'Modelllernen' });
  });
});

describe('buildTocTree', () => {
  it('baut eine dreistufige Hierarchie aus numerierten Überschriften', () => {
    const tree = buildTocTree([
      { page: 8, title: '1. Lernen und Performanz' },
      { page: 10, title: '2.1 Klassische Konditionierung' },
      { page: 16, title: '2.1.1 Bedeutungstransfer und evaluative Konditionierung' },
      { page: 20, title: '2.2 Operante Konditionierung' },
    ]);
    expect(tree).toEqual([
      { title: 'Lernen und Performanz', page: 8, children: [] },
      {
        title: 'Klassische Konditionierung', page: 10,
        children: [{ title: 'Bedeutungstransfer und evaluative Konditionierung', page: 16, children: [] }],
      },
      { title: 'Operante Konditionierung', page: 20, children: [] },
    ]);
  });

  it('hängt einen zweiten Top-Level-Eintrag NICHT unter den ersten, wenn seine Tiefe gleich oder kleiner ist', () => {
    const tree = buildTocTree([
      { page: 1, title: '1. Einführung' },
      { page: 5, title: '2. Lernen' },
    ]);
    expect(tree.map(e => e.title)).toEqual(['Einführung', 'Lernen']);
    expect(tree[0].children).toEqual([]);
  });

  it('hängt "2.1" korrekt als NEUEN Top-Level-Zweig an, wenn "2." selbst nie als eigene Überschrift auftaucht (nicht fälschlich unter "1")', () => {
    const tree = buildTocTree([
      { page: 8, title: '1. Lernen und Performanz' },
      { page: 10, title: '2.1 Klassische Konditionierung' },
      { page: 20, title: '2.2 Operante Konditionierung' },
    ]);
    expect(tree.map(e => e.title)).toEqual(['Lernen und Performanz', 'Klassische Konditionierung', 'Operante Konditionierung']);
    expect(tree[0].children).toEqual([]);
  });

  it('springt korrekt von einer tiefen Ebene zurück auf eine höhere ("2.1.1" dann "2.2")', () => {
    const tree = buildTocTree([
      { page: 10, title: '2.1 Klassische Konditionierung' },
      { page: 16, title: '2.1.1 Bedeutungstransfer' },
      { page: 20, title: '2.2 Operante Konditionierung' },
    ]);
    expect(tree).toHaveLength(2);
    expect(tree[0].title).toBe('Klassische Konditionierung');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[1].title).toBe('Operante Konditionierung');
    expect(tree[1].children).toEqual([]);
  });

  it('behandelt Einträge ohne Nummerierung als flache Top-Level-Einträge und bricht die aktuelle Verschachtelung ab', () => {
    const tree = buildTocTree([
      { page: 10, title: '2.1 Klassische Konditionierung' },
      { page: 12, title: 'Organisatorisches' },
      { page: 20, title: '2.1.1 Sollte NICHT unter 2.1 landen' },
    ]);
    expect(tree.map(e => e.title)).toEqual(['Klassische Konditionierung', 'Organisatorisches', 'Sollte NICHT unter 2.1 landen']);
    expect(tree[0].children).toEqual([]);
  });

  it('liefert eine leere Liste für eine leere Kandidatenliste', () => {
    expect(buildTocTree([])).toEqual([]);
  });
});

describe('detectHeadingCandidates', () => {
  const footerItems = () => [item('© Hochschule Fresenius', 10), item('Lernpsychologie', 10), item('12', 10)];

  it('erkennt eine großgeschriebene, textarme Folie als Titel-Kandidat', () => {
    const result = detectHeadingCandidates([
      { page: 1, items: [item('2.1 Klassische Konditionierung', 32), ...footerItems()] },
    ]);
    expect(result).toEqual([{ page: 1, title: '2.1 Klassische Konditionierung' }]);
  });

  it('erkennt eine textreiche Inhaltsfolie NICHT als Titel-Kandidat, auch mit großer Überschrift', () => {
    const longBody = Array.from({ length: 30 }, (_, i) => item(`Fließtext-Fragment Nummer ${i} mit echtem Inhalt.`, 14));
    const result = detectHeadingCandidates([
      { page: 5, items: [item('2.1 Klassische Konditionierung', 32), ...longBody] },
    ]);
    expect(result).toEqual([]);
  });

  it('fasst konsekutive Seiten mit demselben Titel zu einem Eintrag zusammen (Thema läuft über mehrere Folien)', () => {
    const result = detectHeadingCandidates([
      { page: 10, items: [item('2.1 Klassische Konditionierung', 32), ...footerItems()] },
      { page: 13, items: [item('2.1 Klassische Konditionierung', 32), ...footerItems()] },
      { page: 14, items: [item('2.1 Klassische Konditionierung', 32), ...footerItems()] },
      { page: 20, items: [item('2.2 Operante Konditionierung', 32), ...footerItems()] },
    ]);
    expect(result).toEqual([
      { page: 10, title: '2.1 Klassische Konditionierung' },
      { page: 20, title: '2.2 Operante Konditionierung' },
    ]);
  });

  it('ignoriert Seiten ohne jeden Text, statt abzustürzen', () => {
    expect(detectHeadingCandidates([{ page: 1, items: [] }])).toEqual([]);
  });

  it('erkennt keinen Kandidaten, wenn der Font kaum größer als der Rest der Seite ist (kein echter Größenkontrast)', () => {
    const result = detectHeadingCandidates([
      { page: 1, items: [item('Kurzer Titel', 15), item('Untertitel', 14)] },
    ]);
    expect(result).toEqual([]);
  });
});

describe('buildChaptersFromPages', () => {
  const footerItems = () => [item('© Hochschule Fresenius', 10), item('Lernpsychologie', 10)];

  it('baut Kapitel aus Titel-Folien + nachfolgendem Fließtext bis zur nächsten erkannten Überschrift', () => {
    const pages = [
      { page: 1, items: [item('1. Einführung', 32), ...footerItems()], text: '1. Einführung' },
      { page: 2, items: [item('Fließtext Seite 2 mit echtem Inhalt zur Einführung.', 14)], text: 'Fließtext Seite 2 mit echtem Inhalt zur Einführung.' },
      { page: 3, items: [item('2. Vertiefung', 32), ...footerItems()], text: '2. Vertiefung' },
      { page: 4, items: [item('Fließtext Seite 4 zur Vertiefung.', 14)], text: 'Fließtext Seite 4 zur Vertiefung.' },
    ];
    const chapters = buildChaptersFromPages(pages);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toMatchObject({ index: 0, title: '1. Einführung' });
    expect(chapters[0].content).toContain('Fließtext Seite 2');
    expect(chapters[0].content).not.toContain('Seite 4');
    expect(chapters[1]).toMatchObject({ index: 1, title: '2. Vertiefung' });
    expect(chapters[1].content).toContain('Fließtext Seite 4');
  });

  it('ordnet Seiten VOR der ersten erkannten Überschrift dem ersten Kapitel zu, statt sie zu verwerfen', () => {
    const pages = [
      { page: 1, items: [item('Deckblatt ohne große Überschrift', 14)], text: 'Deckblatt ohne große Überschrift' },
      { page: 2, items: [item('1. Einführung', 32), ...footerItems()], text: '1. Einführung' },
      { page: 3, items: [item('Inhalt zur Einführung.', 14)], text: 'Inhalt zur Einführung.' },
    ];
    const chapters = buildChaptersFromPages(pages);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].content).toContain('Deckblatt ohne große Überschrift');
    expect(chapters[0].content).toContain('Inhalt zur Einführung.');
  });

  it('liefert eine leere Liste, wenn auf keiner Seite eine Überschrift erkannt wird', () => {
    const pages = [
      { page: 1, items: [item('Fließtext ohne jede erkennbare Überschrift.', 14)], text: 'Fließtext ohne jede erkennbare Überschrift.' },
    ];
    expect(buildChaptersFromPages(pages)).toEqual([]);
  });
});

describe('detectDenseChapters', () => {
  // item() (oben im File) setzt x/y immer auf 0 — für Kapitel-Erkennung
  // braucht es aber echte Zeilen mit steigendem y, sonst verschmilzt
  // groupIntoLines() alle Fragmente einer Seite zu einer einzigen "Zeile".
  // Jeder Aufruf hier ist eine eigene Zeile bei fortlaufendem y.
  let nextY = 0;
  const lineItem = (str: string, h: number): PositionedTextItem => {
    nextY += 20;
    return { str, x: 0, y: nextY, w: str.length * h * 0.5, h };
  };
  // Mehrere Body-Zeilen, damit der Fließtext-Modus (h=11) im Dokument
  // dominiert, wie im echten Fresenius-Skript (viele Body-Zeilen, wenige
  // Überschriften) — modeHeight() bräuchte sonst zu wenig Datenpunkte.
  const body = (n = 4) => Array.from({ length: n }, (_, i) => lineItem(`Fließtext-Zeile ${i} in Körpergröße.`, 11));

  beforeEach(() => { nextY = 0; });

  it('erkennt eine nummerierte Überschrift, ignoriert aber einen gleich großen Aufzählungspunkt ohne Punkt in der Zahl', () => {
    const pages = [
      {
        page: 1,
        items: [
          lineItem('1.1 Psychologie als Wissenschaft', 14),
          ...body(),
          lineItem('1. Universalismus: ein Aufzählungspunkt in derselben Größe wie die Überschrift', 14),
          lineItem('Weiterer Fließtext danach.', 11),
          ...body(),
        ],
      },
    ];
    const chapters = detectDenseChapters(pages);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe('1.1 Psychologie als Wissenschaft');
    expect(chapters[0].content).toContain('1. Universalismus');
    expect(chapters[0].content).toContain('Weiterer Fließtext danach.');
  });

  it('ignoriert einen Aufzählungspunkt in Körpergröße, der zufällig das Überschriften-Muster trifft', () => {
    const pages = [
      {
        page: 1,
        items: [
          lineItem('Kapitel 1: Einführung', 16),
          lineItem('1. Ein Punkt in normaler Fließtextgröße, kein Kapitel.', 11),
          lineItem('2. Noch ein Punkt in Fließtextgröße.', 11),
          ...body(),
        ],
      },
    ];
    const chapters = detectDenseChapters(pages);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe('Kapitel 1: Einführung');
  });

  it('erkennt eine deutlich größere Titelzeile auch OHNE Nummerierung/Schlüsselwort (fett gedruckte Überschrift)', () => {
    const pages = [
      {
        page: 1,
        items: [
          lineItem('Kapitel 1: Einführung', 16),
          ...body(),
          lineItem('Fließtext zu Kapitel 1.', 11),
          lineItem('Künstliche Intelligenz (KI)', 16),
          lineItem('Fließtext zur KI.', 11),
          ...body(),
        ],
      },
    ];
    const chapters = detectDenseChapters(pages);
    expect(chapters.map(c => c.title)).toEqual(['Kapitel 1: Einführung', 'Künstliche Intelligenz (KI)']);
    expect(chapters[1].content).toContain('Fließtext zur KI.');
  });

  it('wertet einen nur leicht größeren, unstrukturierten Fettdruck NICHT als eigene Überschrift (Schwelle 1.25× Körpergröße)', () => {
    const pages = [
      {
        page: 1,
        items: [
          lineItem('Kapitel 1: Einführung', 16),
          ...body(),
          lineItem('Ein nur leicht hervorgehobener Begriff im Fließtext', 12),
          lineItem('Normaler Fließtext danach.', 11),
          ...body(),
        ],
      },
    ];
    const chapters = detectDenseChapters(pages);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].content).toContain('Ein nur leicht hervorgehobener Begriff');
  });

  it('ordnet Zeilen VOR der ersten erkannten Überschrift dem ersten Kapitel zu, statt sie zu verwerfen', () => {
    const pages = [
      {
        page: 1,
        items: [
          lineItem('Deckblatt-Text ohne eigene große Überschrift.', 11),
          ...body(),
          lineItem('Kapitel 1: Einführung', 16),
          lineItem('Inhalt von Kapitel 1.', 11),
          ...body(),
        ],
      },
    ];
    const chapters = detectDenseChapters(pages);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].content).toContain('Deckblatt-Text');
    expect(chapters[0].content).toContain('Inhalt von Kapitel 1.');
  });

  it('liefert eine leere Liste ohne jede Eingabe', () => {
    expect(detectDenseChapters([])).toEqual([]);
  });
});

describe('disambiguateTitles', () => {
  it('lässt eindeutige Titel unverändert', () => {
    const chapters = [
      { index: 0, title: 'Kapitel 1', content: 'A', charCount: 1 },
      { index: 1, title: 'Kapitel 2', content: 'B', charCount: 1 },
    ];
    expect(disambiguateTitles(chapters)).toEqual(chapters);
  });

  it('nummeriert wiederholte Titel durch, damit Coverage-Tracking sie als getrennte Themen behandelt', () => {
    const chapters = [
      { index: 0, title: 'Zusammenfassung', content: 'A', charCount: 1 },
      { index: 1, title: 'Kapitel 2', content: 'B', charCount: 1 },
      { index: 2, title: 'Zusammenfassung', content: 'C', charCount: 1 },
      { index: 3, title: 'Zusammenfassung', content: 'D', charCount: 1 },
    ];
    const result = disambiguateTitles(chapters);
    expect(result.map(c => c.title)).toEqual(['Zusammenfassung', 'Kapitel 2', 'Zusammenfassung (2)', 'Zusammenfassung (3)']);
    // Inhalt und Index bleiben unangetastet, nur der Titel wird eindeutig gemacht.
    expect(result[2].content).toBe('C');
    expect(result[2].index).toBe(2);
  });
});

describe('buildChaptersFromCandidates', () => {
  const pages = [
    { page: 1, items: [], text: 'Text auf Seite 1.' },
    { page: 2, items: [], text: 'Text auf Seite 2.' },
    { page: 3, items: [], text: 'Text auf Seite 3.' },
  ];

  it('schneidet Kapitel-Inhalt anhand der Kandidaten-Seiten zu', () => {
    const chapters = buildChaptersFromCandidates([{ page: 1, title: 'Erstes Kapitel' }, { page: 3, title: 'Zweites Kapitel' }], pages);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].content).toBe('Text auf Seite 1.\n\nText auf Seite 2.');
    expect(chapters[1].content).toBe('Text auf Seite 3.');
  });

  it('ordnet Seiten VOR dem ersten Kandidaten dem ersten Kapitel zu', () => {
    const chapters = buildChaptersFromCandidates([{ page: 2, title: 'Kapitel' }], pages);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].content).toContain('Text auf Seite 1.');
    expect(chapters[0].content).toContain('Text auf Seite 3.');
  });

  it('liefert eine leere Liste ohne Kandidaten', () => {
    expect(buildChaptersFromCandidates([], pages)).toEqual([]);
  });
});

describe('getEmbeddedOutlineChapters', () => {
  const pages = [
    { page: 1, items: [], text: 'Deckblatt.' },
    { page: 2, items: [], text: 'Inhalt Kapitel 1.' },
    { page: 3, items: [], text: 'Inhalt Kapitel 2.' },
  ];

  // dest[0] wird hier als einfaches {pageIndex}-Objekt statt eines echten
  // pdf.js-Ref modelliert — getPageIndex() liest das gezielt aus. pageIndex
  // ist 0-basiert (wie bei pdf.js), resolveOutlineDestPage rechnet +1 auf die
  // 1-basierte Seitenzahl — ref(0) = Seite 1, ref(1) = Seite 2, usw.
  const ref = (pageIndex: number) => ({ pageIndex });
  const makePdf = (opts: {
    numPages?: number;
    outline: any[] | null;
    getOutlineThrows?: boolean;
    destinations?: Record<string, any>;
  }): PdfHandle => ({
    doc: {
      getOutline: async () => {
        if (opts.getOutlineThrows) throw new Error('kaputte Gliederung');
        return opts.outline;
      },
      getDestination: async (name: string) => opts.destinations?.[name] ?? null,
      getPageIndex: async (r: any) => r.pageIndex,
    } as any,
    numPages: opts.numPages ?? 3,
    pageTextCache: new Map(),
  });

  it('baut Kapitel aus einer gültigen Gliederung mit expliziten Sprungzielen', async () => {
    const pdf = makePdf({
      outline: [
        { title: 'Kapitel 1', dest: [ref(0)], items: [] },
        { title: 'Kapitel 2', dest: [ref(2)], items: [] },
      ],
    });
    const chapters = await getEmbeddedOutlineChapters(pdf, pages);
    expect(chapters).not.toBeNull();
    expect(chapters!.map(c => c.title)).toEqual(['Kapitel 1', 'Kapitel 2']);
    expect(chapters![0].content).toBe('Deckblatt.\n\nInhalt Kapitel 1.');
    expect(chapters![1].content).toBe('Inhalt Kapitel 2.');
  });

  it('flacht verschachtelte Einträge (children) ab', async () => {
    const pdf = makePdf({
      outline: [
        {
          title: 'Kapitel 1', dest: [ref(0)],
          items: [{ title: 'Unterabschnitt 1.1', dest: [ref(1)], items: [] }],
        },
      ],
    });
    const chapters = await getEmbeddedOutlineChapters(pdf, pages);
    expect(chapters!.map(c => c.title)).toEqual(['Kapitel 1', 'Unterabschnitt 1.1']);
  });

  it('löst benannte Sprungziele (String statt Array) über getDestination auf', async () => {
    const pdf = makePdf({
      outline: [{ title: 'Kapitel 1', dest: 'named-dest-1', items: [] }],
      destinations: { 'named-dest-1': [ref(0)] },
    });
    const chapters = await getEmbeddedOutlineChapters(pdf, pages);
    expect(chapters!.map(c => c.title)).toEqual(['Kapitel 1']);
  });

  it('liefert null ohne jede eingebettete Gliederung', async () => {
    expect(await getEmbeddedOutlineChapters(makePdf({ outline: null }), pages)).toBeNull();
    expect(await getEmbeddedOutlineChapters(makePdf({ outline: [] }), pages)).toBeNull();
  });

  it('verwirft eine Gliederung, deren Einträge überwiegend generische Foliennummern sind ("Folie N")', async () => {
    const pdf = makePdf({
      outline: [
        { title: 'Folie 1', dest: [ref(0)], items: [] },
        { title: 'Folie 2', dest: [ref(1)], items: [] },
        { title: 'Folie 3', dest: [ref(2)], items: [] },
      ],
    });
    expect(await getEmbeddedOutlineChapters(pdf, pages)).toBeNull();
  });

  it('behält eine Gliederung, in der nur eine Minderheit wie Foliennummern aussieht', async () => {
    const pdf = makePdf({
      outline: [
        { title: 'Einführung', dest: [ref(0)], items: [] },
        { title: 'Vertiefung', dest: [ref(1)], items: [] },
        { title: 'Folie 3', dest: [ref(2)], items: [] },
      ],
    });
    const chapters = await getEmbeddedOutlineChapters(pdf, pages);
    expect(chapters).not.toBeNull();
    expect(chapters!.length).toBe(3);
  });

  it('liefert null, wenn getOutline() wirft, statt die Erkennung abstürzen zu lassen', async () => {
    const pdf = makePdf({ outline: null, getOutlineThrows: true });
    expect(await getEmbeddedOutlineChapters(pdf, pages)).toBeNull();
  });

  it('überspringt Einträge mit nicht auflösbarem Sprungziel, statt abzubrechen', async () => {
    const pdf = makePdf({
      outline: [
        { title: 'Kapitel ohne Ziel', dest: null, items: [] },
        { title: 'Kapitel 1', dest: [ref(0)], items: [] },
      ],
    });
    const chapters = await getEmbeddedOutlineChapters(pdf, pages);
    expect(chapters!.map(c => c.title)).toEqual(['Kapitel 1']);
  });
});
