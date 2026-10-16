import { describe, it, expect } from 'vitest';
import type { Block, PipelineSource, Unit } from './types';
import { StudioLlmError, type StudioLlm, type StudioLlmRequest } from './llm';
import { runSummaryPipeline } from './pipeline';
import { chapterTokenCap } from './write';
import { checkCoverage, checkEmptyHeadings, checkSectionCoverage, checkStudies, checkTruncated } from './validate';
import { firstSentence } from './extras';
import { partsFromOutline } from '../pdfOutlineService';
import { citeTokens } from './toMarkdown';
import { isIncompleteResult } from './incomplete';

/**
 * Phase 1.1 (Testlauf 16.10.2026): kein Kapitel geht mehr still verloren.
 * Synthetische Daten, keine echten Folien (Repo ist öffentlich), kein Netz.
 */

const PAGES = [
  'Aufmerksamkeit Definition selektive und geteilte Aufmerksamkeit Cocktail Party Phänomen nach Cherry im Jahr 1953 beschrieben',
  'Inattentional Blindness Gorilla Experiment Simons und Chabris 1999 mit 58 % bei einfacher und 27 % bei schwerer Aufgabe',
  'Change Blindness Türsteher Experiment Simons und Levin 1998 nur 7 von 15 Personen bemerkten den Wechsel des Gesprächspartners',
  'Vorstellungsrunde Termine Raumplan und Sprechstunde der Dozentin im Wintersemester für alle Gruppen dieser Veranstaltung',
];

const merged = (): PipelineSource => ({
  docId: 'gesamt', name: 'Allgemeine Psychologie 1 (gesamt)', pageCount: 4, pages: [...PAGES],
  parts: [{ title: '2. Aufmerksamkeit_1', from: 1, to: 3 }, { title: 'Organisatorisches', from: 4, to: 4 }],
});

const fakeExtract = (prompt: string) => ({
  units: [...prompt.matchAll(/\[Seite (\d+)\]\n([^\n]+)/g)].map(m => {
    const page = Number(m[1]);
    if (page === 4) return { page, type: 'organizational', text: 'Termine.' };
    if (page === 2) return { page, type: 'study', text: m[2], authors: 'Simons & Chabris', year: '1999', design: 'Video', result: '58 % vs. 27 %' };
    if (page === 3) return { page, type: 'study', text: m[2], authors: 'Simons & Levin', year: '1998', design: 'Türsteher', result: '7 von 15' };
    return { page, type: 'definition', text: m[2] };
  }),
});

const ids = (prompt: string) => [...prompt.matchAll(/^- (u\d+) /gm)].map(m => m[1]);

const goodBlocks = (prompt: string) => [
  { type: 'heading', origin: 'quelle', heading: { text: 'Abschnitt' } },
  { type: 'bullets', origin: 'quelle', bullets: { items: ids(prompt).map(id => ({ text: `Befund zu ${id}`, units: [id] })) } },
  { type: 'callout', origin: 'quelle', callout: { variant: 'merksatz', text: 'Merk dir das.', units: ids(prompt).slice(0, 1) } },
];

/** Gliederung: ein Kapitel mit zwei Abschnitten. */
const outline = (prompt: string) => {
  const all = [...prompt.matchAll(/^(u\d+) \|/gm)].map(m => m[1]);
  return { chapters: [{ title: 'Aufmerksamkeit', sections: [{ title: 'Grundlagen', unitIds: all.slice(0, 1) }, { title: 'Blindheit', unitIds: all.slice(1) }] }] };
};

const makeLlm = (write: (req: StudioLlmRequest, n: number) => unknown) => {
  const calls: StudioLlmRequest[] = [];
  let writes = 0;
  const llm: StudioLlm = async req => {
    calls.push(req);
    if (req.step === 'extract') return fakeExtract(req.prompt);
    if (req.step === 'outline') return outline(req.prompt);
    if (req.step === 'check' || req.step === 'scan') return { issues: [], errors: [] };
    if (req.step === 'timeline') return { topic: 'x', items: [] };
    return write(req, ++writes);
  };
  return { llm, calls };
};

const isSection = (req: StudioLlmRequest) => req.prompt.includes('Du schreibst nur EINEN Abschnitt');

describe('Kapitel gehen nie still verloren', () => {
  it('leeres Kapitel (nur Überschrift) wird Abschnitt für Abschnitt neu geschrieben', async () => {
    const { llm, calls } = makeLlm(req => (isSection(req)
      ? { blocks: goodBlocks(req.prompt) }
      : { blocks: [{ type: 'heading', origin: 'quelle', heading: { text: 'Grundlagen' } }] }));
    const r = await runSummaryPipeline({ sources: [merged()], llm });
    expect(calls.filter(c => c.step === 'write' && isSection(c))).toHaveLength(2);
    expect(r.diagnostics?.[0]).toMatchObject({ split: true, coverage: 1 });
    expect(r.incompleteChapters).toEqual([]);
    expect(checkEmptyHeadings(r.blocks)).toEqual([]);
  });

  it('Studie ohne Aufbau und Ergebnis und Abdeckung unter 70 % lösen den Rückfall aus', async () => {
    const { llm, calls } = makeLlm(req => (isSection(req)
      ? { blocks: goodBlocks(req.prompt) }
      : { blocks: [
        { type: 'heading', origin: 'quelle', heading: { text: 'Grundlagen' } },
        { type: 'bullets', origin: 'quelle', bullets: { items: [{ text: 'Nur ein Punkt.', units: ids(req.prompt).slice(0, 1) }] } },
        { type: 'study', origin: 'quelle', study: { authors: 'Moray', year: '1959', units: [] } },
      ] }));
    const r = await runSummaryPipeline({ sources: [merged()], llm });
    expect(calls.some(c => c.step === 'write' && isSection(c))).toBe(true);
    expect(r.diagnostics?.[0].split).toBe(true);
    expect(checkStudies(r.blocks)).toEqual([]);
  });

  it('scheitert jeder Versuch (Schleife), läuft der Rest weiter und das Kapitel steht als unvollständig da', async () => {
    const { llm } = makeLlm(() => { throw new StudioLlmError([{ step: 'write', kind: 'loop', detail: 'Jahr länger als 4 Zeichen', attempt: 1 }]); });
    const r = await runSummaryPipeline({ sources: [merged()], llm });
    expect(r.incompleteChapters).toEqual(['Aufmerksamkeit']);
    expect(r.warnings).toContain('Kapitel „Aufmerksamkeit“ ist unvollständig. Bitte neu erstellen.');
    expect(r.diagnostics?.[0].aborts.some(a => a.startsWith('loop'))).toBe(true);
    // Keine nackte Kapitelüberschrift, aber Klausurinfos/Extras bleiben möglich.
    expect(r.blocks.some(b => b.type === 'heading' && b.text === 'Aufmerksamkeit')).toBe(false);
    expect(isIncompleteResult(r)).toBe(true);
  });

  it('Antwortgrenze je Kapitel hängt am Wortbudget', async () => {
    const { llm, calls } = makeLlm(req => ({ blocks: goodBlocks(req.prompt) }));
    await runSummaryPipeline({ sources: [merged()], llm });
    const w = calls.filter(c => c.step === 'write');
    expect(w.every(c => c.maxOutputTokens && c.maxOutputTokens <= 16_000)).toBe(true);
    expect(chapterTokenCap(600)).toBe(5000);
    expect(chapterTokenCap(10)).toBe(3000);
    expect(chapterTokenCap(9000)).toBe(16000);
    expect(calls.filter(c => c.step === 'extract').every(c => (c.maxOutputTokens ?? 0) > 0)).toBe(true);
  });

  it('eine schlechtere Reparatur wird nicht übernommen', async () => {
    const { llm } = makeLlm((req, n) => {
      // Erste Fassung mit Quellenangabe im Text (Beanstandung), Reparatur liefert nur eine Überschrift.
      if (req.prompt.includes('=== ÜBERARBEITUNG ===')) return { blocks: [{ type: 'heading', origin: 'quelle', heading: { text: 'X' } }] };
      const blocks = goodBlocks(req.prompt);
      return n === 1 ? { blocks: [...blocks, { type: 'paragraph', origin: 'quelle', paragraph: { text: 'Siehe [1, S. 2].', units: [] } }] } : { blocks };
    });
    const r = await runSummaryPipeline({ sources: [merged()], llm });
    expect(r.blocks.some(b => b.type === 'bullets')).toBe(true);
    expect(r.incompleteChapters).toEqual([]);
  });
});

describe('Zusammengefügte PDF', () => {
  it('Gliederung "Zusammenfügen" → Vorlesungen; Lehrbuch-Gliederungen nicht', () => {
    expect(partsFromOutline([
      { title: 'Heißner', page: 1, hasChildren: false },
      { title: '2. Aufmerksamkeit_1', page: 83, hasChildren: false },
      { title: '2.Aufmerksamkeit_2', page: 108, hasChildren: false },
    ], 142)).toEqual([
      { title: 'Heißner', from: 1, to: 82 },
      { title: '2. Aufmerksamkeit_1', from: 83, to: 107 },
      { title: '2.Aufmerksamkeit_2', from: 108, to: 142 },
    ]);
    expect(partsFromOutline([{ title: 'Kapitel 1', page: 1, hasChildren: true }, { title: 'Kapitel 2', page: 9, hasChildren: false }], 20)).toBeNull();
    expect(partsFromOutline([{ title: 'Folie 1', page: 1, hasChildren: false }, { title: 'Folie 2', page: 2, hasChildren: false }], 2)).toBeNull();
    expect(partsFromOutline([{ title: 'A', page: 3, hasChildren: false }, { title: 'B', page: 9, hasChildren: false }], 20)).toBeNull();
  });

  it('Abdeckung je Vorlesung; reine Organisationsfolien begründet ausgelassen', async () => {
    const { llm } = makeLlm(req => ({ blocks: goodBlocks(req.prompt) }));
    const r = await runSummaryPipeline({ sources: [merged()], llm });
    expect(r.omittedSources).toEqual([{ sourceId: 'gesamt', part: { title: 'Organisatorisches', from: 4, to: 4 }, reason: expect.stringContaining('Organisation') }]);
    const ctx = {
      sources: [{ docId: 'gesamt', name: 'G', pageCount: 4, parts: merged().parts }], units: [] as Unit[], omittedSources: [], sourceWords: 100,
    };
    const onlyFirst: Block[] = [{ id: 'c1-1', origin: 'quelle', cites: [{ sourceId: 'gesamt', page: 1 }], type: 'paragraph', text: 'x' }];
    expect(checkCoverage(onlyFirst, ctx)).toEqual([expect.objectContaining({ rule: 'coverage', part: { title: 'Organisatorisches', from: 4, to: 4 } })]);
  });

  it('Fußnote nennt Vorlesung, Folie und Gesamtseite', () => {
    const refs = [{ n: 1, docId: 'g', name: 'Allgemeine Psychologie 1 (gesamt)', parts: [{ title: 'Heißner', from: 1, to: 82 }, { title: 'Aufmerksamkeit_1', from: 83, to: 107 }] }];
    expect(citeTokens([{ sourceId: 'g', page: 94 }], () => 1, refs)).toBe('[1, Aufmerksamkeit_1, Folie 12 (gesamt S. 94)]');
    expect(citeTokens([{ sourceId: 'g', page: 94 }], () => 1)).toBe('[1, S. 94]');
  });
});

describe('Prüfregeln aus dem Testlauf', () => {
  const unit = (id: string, text: string): Unit => ({ id, sourceId: 's', page: 1, type: 'concept', text });
  it('abgeschnittene Texte: Satzanfang einer Einheit, offene Klammer', () => {
    const units = [unit('u1', 'Wird der eigene Name genannt, zieht dies automatisch die Aufmerksamkeit auf sich.'), unit('u2', 'Gestaltgesetze. Sie gelten für alle.')];
    const blocks: Block[] = [
      { id: 'x-b1', origin: 'quelle', cites: [], type: 'paragraph', text: 'Wird der eigene Name genannt, zieht dies automatisch.' },
      { id: 'b2', origin: 'quelle', cites: [], type: 'paragraph', text: 'Probleme der Filtertheorie: Eindringen von unbeachtetem Input (z.B.' },
      { id: 'x-b3', origin: 'quelle', cites: [], type: 'paragraph', text: 'Gestaltgesetze.' },
      { id: 'b6', origin: 'quelle', cites: [], type: 'paragraph', text: 'Wird der eigene Name genannt, zieht dies automatisch.' },
      { id: 'b4', origin: 'quelle', cites: [], type: 'paragraph', text: 'Szenarien: a) Schule b) Arbeit.' },
      { id: 'b5', origin: 'quelle', cites: [], type: 'paragraph', text: 'Einfluss der Variable (UV) auf (AV) bei N = 50 (je Gruppe n = 25), r = 1) als Beispiel.' },
    ];
    // Satzanfang nur bei Texten, die der Code übernimmt (x-); das Schreibmodell formuliert um.
    expect(checkTruncated(blocks, units).map(i => i.blockId)).toEqual(['x-b1', 'b2']);
  });
  it('erster Satz nie gekürzt, "z.B." ist kein Satzende', () => {
    expect(firstSentence('Probleme der Filtertheorie: Eindringen von Input (z.B. Moray, 1959). Weiter.')).toBe('Probleme der Filtertheorie: Eindringen von Input (z.B. Moray, 1959).');
    const long = `${'Sehr langer Satz '.repeat(20)}ohne Ende`;
    expect(firstSentence(long)).toBe(long.trim());
  });
  it('Abschnitt unter 70 % Abdeckung', () => {
    const byId = new Map(['u1', 'u2', 'u3', 'u4'].map(id => [id, unit(id, 'x')]));
    const blocks: Block[] = [{ id: 'b', origin: 'quelle', cites: [], unitIds: ['u1', 'u2'], type: 'paragraph', text: 'x' }];
    expect(checkSectionCoverage([{ title: 'A', unitIds: ['u1', 'u2', 'u3', 'u4'] }], blocks, byId, 'c1-h')).toHaveLength(1);
    expect(checkSectionCoverage([{ title: 'A', unitIds: ['u1', 'u2', 'u3'] }], [{ ...blocks[0], unitIds: ['u1', 'u2', 'u3'] }], byId, 'c1-h')).toEqual([]);
  });
});
