import { describe, it, expect } from 'vitest';
import type { Unit, PipelineSource } from './types';
import { findDuplicatePages, withoutDuplicates, jaccard } from './dedupe';
import { parseOutline, completeOutline, assignBudgets, summaryCorridor } from './outline';
import { normalizeBlocks, parseYear, writerSchema } from './blocks';
import { buildExtraBlocks, buildTimeline, mergeNearDuplicates, timelineCandidates } from './extras';
import type { StudioLlm } from './llm';
import { extractionJobs, parseUnits, WINDOW_PAGES } from './extract';
import { resultToMarkdown } from './toMarkdown';
import { studioIdempotencyKey } from './idempotency';
import { ensureSourceErrorHints } from './write';

const SLIDES: Record<string, string> = {
  'Psychologie als Wissenschaft': 'Psychologie als Wissenschaft vom Erleben und Verhalten, Wundt gründete 1879 das erste Labor in Leipzig',
  'Inattentional Blindness': 'Inattentional Blindness: Probanden zählen Pässe und übersehen einen Gorilla, 58 Prozent bemerkten ihn bei einfacher Aufgabe',
  'Change Blindness': 'Change Blindness: Veränderungen in Szenen werden nicht bemerkt, beim Türsteher-Experiment fielen 7 von 15 Personen auf den Wechsel herein',
  'Filtertheorie': 'Filtertheorie nach Broadbent 1958: frühe Selektion nach physikalischen Merkmalen, unbeachtete Information wird vollständig blockiert',
};
const slide = (topic: string) => SLIDES[topic];

describe('Duplikate', () => {
  it('zitiert die spezifischere Quelle (Einzel-PDF vor Sammeldatei)', () => {
    const single: PipelineSource = { docId: 'single', name: '2. Aufmerksamkeit_1', pageCount: 2, pages: [slide('Inattentional Blindness'), slide('Change Blindness')] };
    const bundle: PipelineSource = { docId: 'bundle', name: 'Heißner gesamt', pageCount: 4, pages: [slide('Psychologie als Wissenschaft'), slide('Inattentional Blindness'), slide('Change Blindness'), slide('Filtertheorie')] };
    const dup = findDuplicatePages([bundle, single]);
    expect([...dup.dropped.get('bundle')!]).toEqual([2, 3]);
    expect(dup.dropped.has('single')).toBe(false);
    expect(dup.keptFor.get('bundle:2')).toEqual({ sourceId: 'single', page: 1 });
    expect(withoutDuplicates(bundle, dup).pages).toEqual([bundle.pages![0], '', '', bundle.pages![3]]);
  });
  it('kurze Titelfolien nur bei exakt gleichem Text', () => {
    const a: PipelineSource = { docId: 'a', name: 'A', pageCount: 1, pages: ['Allgemeine Psychologie I'] };
    const b: PipelineSource = { docId: 'b', name: 'B', pageCount: 2, pages: ['Allgemeine Psychologie II', 'Allgemeine Psychologie I'] };
    expect([...findDuplicatePages([a, b]).dropped.get('b')!]).toEqual([2]);
  });
  it('jaccard', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });
});

const U = (id: string, sourceId: string, page: number, text = 'wort '.repeat(10), type: Unit['type'] = 'concept'): Unit => ({ id, sourceId, page, type, text });

describe('Gliederung', () => {
  const units = [U('u1', 'a', 1), U('u2', 'a', 2), U('u3', 'a', 3), U('u4', 'b', 9)];
  it('verwirft unbekannte und doppelte IDs, ergänzt vergessene', () => {
    const parsed = parseOutline({ chapters: [{ title: 'Eins', sections: [{ title: 'S', unitIds: ['u1', 'u1', 'x9', 'u2'] }] }, { title: 'Leer', sections: [] }] }, units);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].sections[0].unitIds).toEqual(['u1', 'u2']);
    const done = completeOutline(parsed, units);
    // u3 liegt neben u2 (gleiche Quelle) → in denselben Abschnitt; u4 hat keinen Nachbarn → eigenes Kapitel.
    expect(done[0].sections[0].unitIds).toEqual(['u1', 'u2', 'u3']);
    expect(done[1].sections[0].unitIds).toEqual(['u4']);
  });
  it('Korridor 25 bis 40 %, mindestens 600, höchstens 6.000', () => {
    expect(summaryCorridor(10000)).toEqual({ min: 2500, max: 4000, target: 3250 });
    expect(summaryCorridor(500)).toEqual({ min: 600, max: 600, target: 600 });
    expect(summaryCorridor(40000).max).toBe(6000);
  });
  it('Budget nach Stoffmenge', () => {
    const chapters = assignBudgets([
      { title: 'A', budget: 0, sections: [{ title: 'a', unitIds: ['u1', 'u2', 'u3'] }] },
      { title: 'B', budget: 0, sections: [{ title: 'b', unitIds: ['u4'] }] },
    ], units, 800);
    expect(chapters.map(c => c.budget)).toEqual([600, 200]);
  });
});

describe('Blöcke normalisieren', () => {
  const byId = new Map([U('u1', 'a', 3), U('u2', 'a', 3), U('u3', 'b', 1)].map(u => [u.id, u]));
  it('Belege aus Einheiten-IDs, je Seite einmal, unbekannte fallen weg', () => {
    const { blocks: [b] } = normalizeBlocks([{ type: 'paragraph', origin: 'quelle', paragraph: { text: 'Text', units: ['u1', 'u2', 'u3', 'zz'] } }], byId, 'c1-');
    expect(b.cites).toEqual([{ sourceId: 'a', page: 3 }, { sourceId: 'b', page: 1 }]);
    expect(b.unitIds).toEqual(['u1', 'u2', 'u3']);
    expect(b.id).toBe('c1-1');
  });
  it('Tabellen auffüllen, ungültige Blöcke verwerfen (mit Grund), Einordnung immer KI', () => {
    const { blocks: out, dropped } = normalizeBlocks([
      { type: 'table', origin: 'quelle', table: { headers: ['Theorie', 'Ort'], rows: [{ cells: ['Filter'], units: ['u1'] }, { cells: [] }] } },
      { type: 'table', origin: 'quelle', table: { headers: ['nur eine'], rows: [{ cells: ['x'] }] } },
      { type: 'paragraph', origin: 'quelle', paragraph: { text: '  ' } },
      { type: 'callout', origin: 'quelle', callout: { variant: 'einordnung', text: 'Eigene Sicht', units: ['u1'] } },
      { type: 'figure', origin: 'quelle', figure: { figureRef: 'A9', caption: 'gibt es nicht' } },
      { type: 'study', origin: 'quelle', study: { authors: 'Simons & Levin', year: '1998', design: 'D', result: '7 von 15', conclusion: 'C', units: ['u1'] } },
    ], byId, 'c1-');
    expect(out.map(b => b.type)).toEqual(['table', 'callout', 'study']);
    expect(out[0].type === 'table' && out[0].rows).toEqual([['Filter', '']]);
    expect(out[0].type === 'table' && out[0].rowCites).toEqual([[{ sourceId: 'a', page: 3 }]]);
    expect(out[0].cites).toEqual([{ sourceId: 'a', page: 3 }]);
    expect(out[1]).toMatchObject({ origin: 'ki', cites: [] });
    expect(out[2]).toMatchObject({ year: 1998 });
    expect(dropped.map(d => d.reason)).toEqual(['weniger als 2 Spalten', 'ohne Text', 'unbekannte Abbildung']);
  });
  it('Testlauf 16.10.: Merksatz als {variant, year} ohne Text und Ziffernschleife im Jahr', () => {
    const { blocks, dropped } = normalizeBlocks([
      { type: 'callout', origin: 'quelle', callout: { variant: 'merksatz' }, year: 2025 },
      { type: 'study', origin: 'quelle', study: { authors: 'Moray', year: '1959591959', units: ['u1'] } },
      { type: 'study', origin: 'quelle', study: { authors: 'Moray', year: 1959591959 } },
      { type: 'callout', origin: 'quelle', variant: 'merksatz', text: 'altes flaches Format' },
    ], byId, 'c1-');
    expect(dropped).toEqual([
      { type: 'callout:merksatz', reason: 'ohne Text' },
      { type: 'callout', reason: 'Unterobjekt fehlt' },
    ]);
    // Studien bleiben, aber nie mit unmöglichem Jahr.
    expect(blocks.map(b => (b.type === 'study' ? b.year : 'x'))).toEqual([undefined, undefined]);
  });
  it('Jahre nur mit vier Ziffern zwischen 1850 und 2100', () => {
    expect([parseYear('1999'), parseYear(1959), parseYear('1849'), parseYear('2101'), parseYear('19595'), parseYear('ca. 1990'), parseYear('')])
      .toEqual([1999, 1959, undefined, undefined, undefined, undefined, undefined]);
  });
  it('Texte über 1.500 Zeichen gelten als Schleife und fallen weg', () => {
    const { blocks, dropped } = normalizeBlocks([{ type: 'paragraph', origin: 'quelle', paragraph: { text: 'Wort '.repeat(400) } }], byId, 'c1-');
    expect(blocks).toEqual([]);
    expect(dropped).toEqual([{ type: 'paragraph', reason: 'Text zu lang' }]);
  });
  it('Schema: je Typ ein Unterobjekt mit Pflichtfeldern und fester Reihenfolge, keine Zahlenfelder', () => {
    const schema = writerSchema(['heading', 'callout', 'study']);
    const item = (schema.properties.blocks as { items: unknown }).items as { properties: Record<string, { required: string[]; propertyOrdering: string[]; properties: Record<string, { type: string }> }>; propertyOrdering: string[] };
    expect(item.propertyOrdering).toEqual(['type', 'origin', 'heading', 'callout', 'study']);
    expect(item.properties.callout.required).toEqual(['variant', 'text', 'units']);
    expect(item.properties.study.required).toEqual(expect.arrayContaining(['authors', 'design', 'result']));
    expect(item.properties.study.propertyOrdering.slice(0, 2)).toEqual(['authors', 'year']);
    expect(JSON.stringify(schema)).not.toMatch(/INTEGER|NUMBER/);
  });
});

describe('Abschnitte vom Code', () => {
  const units: Unit[] = [
    { ...U('u1', 'a', 5), type: 'study', text: 'Gorilla', study: { authors: 'Simons & Chabris', year: 1999, result: '58 % vs. 27 %' } },
    { ...U('u2', 'a', 7), type: 'study', text: 'Filter', study: { authors: 'Broadbent', year: 1958 } },
    { ...U('u3', 'b', 2), type: 'study', text: 'Attenuation', study: { authors: 'Treisman', year: 1964 } },
    { ...U('u4', 'b', 3), type: 'study', text: 'Gorilla nochmal', study: { authors: 'Simons & Chabris', year: 1999 } },
    { ...U('u5', 'a', 9), type: 'task', text: 'Recherchiere die Flanker-Aufgabe.' },
    { ...U('u6', 'a', 1), type: 'exam_info', text: 'Klausur 120 Minuten.' },
  ];
  it('Zeitleiste: je Autor und Jahr ein Kandidat, auch mehrere in einer Einheit, ohne Rechenbeispiele', () => {
    const cands = timelineCandidates([
      ...units,
      { ...U('u7', 'a', 12), type: 'study', text: 'Probleme der Filtertheorie: Eindringen von Input (z.B. Moray, 1959) und Verarbeitung (Li et al., 2011).', study: { authors: 'Moray; Li et al.', year: 2011 } },
      { ...U('u8', 'a', 13), type: 'example', illustrative: true, text: 'Rechenbeispiel nach Muster (Beispiel, 2023): M = 40.' },
    ]);
    expect(cands.map(c => `${c.who} ${c.year}`)).toEqual(['Simons & Chabris 1999', 'Broadbent 1958', 'Treisman 1964', 'Li et al. 2011', 'Moray 1959']);
  });
  it('Zeitleiste: Modell wählt und formuliert, der Code sortiert, prüft und lässt Leeres weg', async () => {
    const llm: StudioLlm = async () => ({ topic: 'Aufmerksamkeit', items: [
      { id: 't1', what: 'Gorilla im Video wird oft übersehen.' },
      { id: 't3', what: 'Treisman: abgeschwächte Weiterleitung statt Blockade' },
      { id: 't2', what: 'Broadbent, 1958: Filter nach physikalischen Merkmalen.' },
      { id: 't9', what: 'gibt es nicht' },
      { id: 't1', what: 'doppelt doppelt doppelt' },
    ] });
    const tl = await buildTimeline(units, llm);
    expect(tl.map(i => `${i.year} ${i.who}: ${i.what}`)).toEqual([
      '1958 Broadbent: Filter nach physikalischen Merkmalen.',
      '1964 Treisman: abgeschwächte Weiterleitung statt Blockade.',
      '1999 Simons & Chabris: Gorilla im Video wird oft übersehen.',
    ]);
    expect(await buildTimeline(units, async () => { throw new Error('x'); })).toEqual([]);
  });
  it('Aufgaben ohne Duplikate, Übungsfragen und Klausurinfos als eigene Abschnitte', () => {
    const more: Unit[] = [
      ...units,
      { ...U('u10', 'a', 48), type: 'task', text: 'Recherchiere die Flanker-Aufgabe.' },
      { ...U('u11', 'a', 46), type: 'practice_question', text: 'Was sind die Ziele der Psychologie?', answer: 'Beschreiben, erklären, vorhersagen, verändern.' },
    ];
    const blocks = buildExtraBlocks(more, [{ year: 1958, who: 'Broadbent', what: 'Filter.', cites: [] }, { year: 1964, who: 'Treisman', what: 'Dämpfung.', cites: [] }, { year: 1999, who: 'Simons', what: 'Gorilla.', cites: [] }]);
    expect(blocks.filter(b => b.type === 'heading').map(b => b.type === 'heading' && b.text)).toEqual(['Zeitleiste', 'Aufgaben aus der Vorlesung', 'Übungsfragen aus der Vorlesung', 'Klausurinfos']);
    const tasks = blocks.find(b => b.type === 'tasks');
    expect(tasks?.type === 'tasks' && tasks.items).toEqual([{ text: 'Recherchiere die Flanker-Aufgabe.', cites: [{ sourceId: 'a', page: 9 }, { sourceId: 'a', page: 48 }] }]);
    expect(blocks.find(b => b.type === 'check')).toMatchObject({ question: 'Was sind die Ziele der Psychologie?' });
    expect(mergeNearDuplicates([{ ...U('x', 'a', 1), text: 'Bitte erstellen Sie einen Kreislauf mit der Hilfe eines Themas.' }, { ...U('y', 'a', 2), text: 'Bitte erstellen Sie einen Kreislauf mit der Hilfe eines Themas!' }])).toHaveLength(1);
  });
  it('Folienfehler ohne Hinweis bekommt einen Hinweis', () => {
    const err: Unit = { ...U('u9', 'a', 24), type: 'source_error', text: 'Auf Folie 24 steht beim Handy-Beispiel die Musik-Hypothese.' };
    const out = ensureSourceErrorHints([], [err], 'c1-');
    expect(out[0]).toMatchObject({ type: 'callout', variant: 'hinweis', cites: [{ sourceId: 'a', page: 24 }] });
    expect(ensureSourceErrorHints(out, [err], 'c1-')).toHaveLength(1);
  });
});

describe('Extraktion', () => {
  const src: PipelineSource = { docId: 'd', name: 'D', pageCount: 20, pages: Array.from({ length: 20 }, (_, i) => (i === 3 ? '' : `Seite ${i + 1} Inhalt`)) };
  it('feste Fenster zu 15 Seiten, leere Seiten fehlen im Text', () => {
    const jobs = extractionJobs(src);
    expect(jobs.map(j => j.pages)).toEqual([[1, WINDOW_PAGES], [16, 20]]);
    expect(jobs[0].text).toContain('[Seite 3]');
    expect(jobs[0].text).not.toContain('[Seite 4]');
  });
  it('Einheiten außerhalb des Fensters und unbekannte Typen fallen weg', () => {
    const job = extractionJobs(src)[1];
    const units = parseUnits({ units: [
      { page: 16, type: 'definition', text: 'ok' }, { page: 3, type: 'definition', text: 'falsches Fenster' },
      { page: 17, type: 'quatsch', text: 'x' }, { page: 18, type: 'study', text: 'S', authors: 'Li et al.', year: 2011 },
    ] }, job);
    expect(units.map(u => u.page)).toEqual([16, 18]);
    expect(units[1].study).toEqual({ authors: 'Li et al.', year: 2011 });
  });
  it('Quellen ohne Seiten bekommen page 0', () => {
    const jobs = extractionJobs({ docId: 't', name: 'T', pageCount: 0, pages: null, plain: 'Text' });
    expect(parseUnits({ units: [{ page: 5, type: 'concept', text: 'x' }] }, jobs[0])[0].page).toBe(0);
  });
});

describe('Markdown-Fassung und Schlüssel', () => {
  it('Blöcke als Markdown mit Fußnoten im alten Format', () => {
    const md = resultToMarkdown({
      formatVersion: 2, format: 'zusammenfassung', omittedSources: [], warnings: ['Bitte prüfen'], stats: { sourceWords: 1, outputWords: 1 },
      blocks: [
        { id: 'h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Aufmerksamkeit' },
        { id: 'b', origin: 'quelle', cites: [], type: 'bullets', items: [{ text: 'Filter', cites: [{ sourceId: 'a', page: 4 }] }] },
        { id: 't', origin: 'quelle', cites: [], type: 'table', headers: ['A', 'B'], rows: [['1', '2']] },
      ],
    }, id => (id === 'a' ? 1 : undefined));
    expect(md).toContain('### Aufmerksamkeit');
    expect(md).toContain('- Filter [1, S. 4]');
    expect(md).toContain('| A | B |');
    expect(md).toContain('- Bitte prüfen');
  });
  it('Fußnoten gruppiert, Tabellen mit Belegen je Zeile, Bildunterschrift nicht doppelt', () => {
    const md = resultToMarkdown({
      formatVersion: 2, format: 'zusammenfassung', omittedSources: [], warnings: [], stats: { sourceWords: 1, outputWords: 1 },
      blocks: [
        { id: 'p', origin: 'quelle', cites: [{ sourceId: 'a', page: 16 }, { sourceId: 'a', page: 14 }, { sourceId: 'a', page: 46 }], type: 'paragraph', text: 'Ursprung' },
        { id: 't', origin: 'quelle', cites: [], type: 'table', headers: ['Autor', 'Definition'], rows: [['Myers', 'D1'], ['Zimbardo', 'D2']], rowCites: [[{ sourceId: 'a', page: 16 }], [{ sourceId: 'a', page: 17 }]] },
        { id: 'f', origin: 'quelle', cites: [{ sourceId: 'a', page: 17 }], type: 'figure', sourceId: 'a', page: 17, imageRef: 'A1', title: 'Interaktion von Person, Umwelt und Anderen', caption: 'Interaktion von Person, Umwelt und Anderen' },
      ],
    }, id => (id === 'a' ? 1 : undefined));
    expect(md).toContain('Ursprung [1, S. 14, 16, 46]');
    expect(md).toContain('| Myers | D1 [1, S. 16] |');
    expect(md).toContain('*Abbildung: Interaktion von Person, Umwelt und Anderen* [1, S. 17]');
  });
  it('Idempotenz-Schlüssel unabhängig von der Reihenfolge, abhängig von Optionen', async () => {
    const base = { collectionId: 'c', format: 'summary', focus: ' Gedächtnis ', figures: false, argon: false };
    const k1 = await studioIdempotencyKey({ ...base, sources: [{ docId: 'a' }, { docId: 'b', ranges: [[3, 5]] }] });
    const k2 = await studioIdempotencyKey({ ...base, focus: 'gedächtnis', sources: [{ docId: 'b', ranges: [[3, 5]] }, { docId: 'a' }] });
    const k3 = await studioIdempotencyKey({ ...base, argon: true, sources: [{ docId: 'a' }, { docId: 'b', ranges: [[3, 5]] }] });
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});
