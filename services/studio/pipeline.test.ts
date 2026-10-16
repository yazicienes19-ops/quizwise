import { describe, it, expect, vi } from 'vitest';
import type { PipelineSource } from './types';
import type { StudioLlm, StudioLlmRequest } from './llm';
import { runSummaryPipeline, PipelineCancelled } from './pipeline';

/**
 * Synthetischer Nachbau des Testfalls "Allgemeine Psychologie 1": eine
 * Sammeldatei, die die Folien eines Einzel-PDFs enthält, dazu eine dritte
 * Quelle ("Wahrnehmung"), die das Modell in der Gliederung vergisst.
 * Keine echten Folien (Repo ist öffentlich), kein Netz.
 */

const P = {
  intro: 'Psychologie ist die Wissenschaft vom Erleben und Verhalten, Wundt gründete das erste Labor in Leipzig im Jahr 1879',
  gorilla: 'Inattentional Blindness Simons und Chabris 1999 Gorilla Experiment: 58 % bemerkten den Gorilla bei einfacher und 27 % bei schwerer Aufgabe',
  door: 'Change Blindness Simons und Levin 1998 Türsteher Experiment: nur 7 von 15 Personen bemerkten den Wechsel des Gesprächspartners',
  task: 'Selbststudium Aufgabe: Recherchiere die Flanker Aufgabe nach Eriksen und beschreibe den Ablauf in eigenen Worten für die nächste Sitzung',
  exam: 'Klausur 120 Minuten bestanden ab 50 % Aufgabentypen Wiedergabe Anwendung Transfer Learning Outcomes Theorien vergleichen und kontrastieren',
  percept: 'Wahrnehmung Bottom up und Top down Verarbeitung Gestaltgesetze Nähe Ähnlichkeit Geschlossenheit nach Wertheimer im Jahr 1923 beschrieben',
  filter: 'Filtertheorie Broadbent 1958 frühe Selektion nach physikalischen Merkmalen Attenuation Treisman 1964 abgeschwächte Weiterleitung',
};

const sources = (): PipelineSource[] => [
  { docId: 'bundle', name: 'Allgemeine Psychologie 1 Heißner', pageCount: 5, pages: [P.intro, P.gorilla, P.door, P.task, P.exam] },
  { docId: 'single', name: '2. Aufmerksamkeit_1', pageCount: 3, pages: [P.gorilla, P.door, P.filter] },
  { docId: 'percept', name: '1_Wahrnehmung', pageCount: 1, pages: [P.percept] },
];

/** Antwort der Extraktion aus dem Fenstertext: je Seite eine passende Einheit. */
const fakeExtract = (prompt: string) => {
  const units: Record<string, unknown>[] = [];
  for (const m of prompt.matchAll(/\[Seite (\d+)\]\n([^\n]+)/g)) {
    const page = Number(m[1]);
    const text = m[2];
    if (text === P.gorilla) units.push({ page, type: 'study', text, title: 'Gorilla', authors: 'Simons & Chabris', year: 1999, result: '58 % vs. 27 %' });
    else if (text === P.door) units.push({ page, type: 'study', text, title: 'Türsteher', authors: 'Simons & Levin', year: 1998, result: '7 von 15' });
    else if (text === P.task) units.push({ page, type: 'task', text: 'Recherchiere die Flanker-Aufgabe nach Eriksen.' });
    else if (text === P.exam) units.push({ page, type: 'exam_info', text: 'Klausur: 120 Minuten, bestanden ab 50 %.' });
    else if (text === P.filter) {
      units.push({ page, type: 'study', text: 'Filtertheorie: frühe Selektion.', authors: 'Broadbent', year: 1958 });
      units.push({ page, type: 'study', text: 'Attenuation: abgeschwächte Weiterleitung.', authors: 'Treisman', year: 1964 });
    } else units.push({ page, type: 'concept', text: text.slice(0, 120) });
  }
  return { units };
};

const unitIdsIn = (prompt: string) => [...prompt.matchAll(/^(u\d+) \|/gm)].map(m => m[1]);

interface Opts { badFirstWrite?: boolean; stayBad?: boolean }

const makeLlm = (opts: Opts = {}) => {
  const calls: StudioLlmRequest[] = [];
  const llm: StudioLlm = async req => {
    calls.push(req);
    if (req.step === 'extract') return fakeExtract(req.prompt);
    if (req.step === 'outline') {
      // Das Modell "vergisst" die Wahrnehmungs-Einheit (letzte ID).
      const ids = unitIdsIn(req.prompt);
      return { chapters: [{ title: 'Aufmerksamkeit', sections: [{ title: 'Phänomene', unitIds: ids.slice(0, -1) }] }] };
    }
    if (req.step === 'check') return { issues: [] };
    // write: Einheiten-IDs aus dem Prompt zitieren, je Einheit ein Stichpunkt.
    const ids = [...req.prompt.matchAll(/^- (u\d+) /gm)].map(m => m[1]);
    const repair = req.prompt.includes('=== ÜBERARBEITUNG ===');
    const bad = opts.badFirstWrite && (!repair || opts.stayBad);
    return {
      blocks: [
        { type: 'heading', origin: 'quelle', level: 3, text: 'Abschnitt' },
        { type: 'bullets', origin: 'quelle', items: ids.map(id => ({ text: bad ? `Befund mit 50 % [1, S. 3] zu ${id}` : `Befund zu ${id}`, units: [id] })) },
        { type: 'callout', origin: 'quelle', variant: 'merksatz', text: 'Merk dir das.', units: ids.slice(0, 1) },
      ],
    };
  };
  return { llm, calls };
};

describe('runSummaryPipeline', () => {
  it('Duplikate zitieren das Einzel-PDF, keine Quelle geht verloren, Extras vom Code', async () => {
    const { llm, calls } = makeLlm();
    const r = await runSummaryPipeline({ sources: sources(), llm });
    const cites = r.blocks.flatMap(b => [...b.cites, ...('items' in b ? (b.items as { cites: { sourceId: string; page: number }[] }[]).flatMap(i => i.cites) : [])]);
    // Gorilla/Türsteher stehen in beiden Dateien: zitiert wird nur das Einzel-PDF.
    expect(cites.some(c => c.sourceId === 'bundle' && (c.page === 2 || c.page === 3))).toBe(false);
    expect(cites.some(c => c.sourceId === 'single' && c.page === 1)).toBe(true);
    // Vom Modell vergessene Quelle landet trotzdem im Text.
    expect(cites.some(c => c.sourceId === 'percept')).toBe(true);
    expect(r.omittedSources).toEqual([]);
    const headings = r.blocks.filter(b => b.type === 'heading').map(b => (b.type === 'heading' ? b.text : ''));
    expect(headings).toEqual(expect.arrayContaining(['Aufmerksamkeit', 'Zeitleiste', 'Aufgaben aus der Vorlesung', 'Klausurinfos']));
    const tl = r.blocks.find(b => b.type === 'timeline');
    expect(tl?.type === 'timeline' && tl.items.map(i => i.year)).toEqual([1958, 1964, 1998, 1999]);
    // Doppelte Seiten der Sammeldatei werden gar nicht erst extrahiert.
    const extractText = calls.filter(c => c.step === 'extract').map(c => c.prompt).join('\n');
    expect((extractText.match(/Gorilla Experiment/g) ?? []).length).toBe(1);
    // Modellwahl: Extraktion leicht, Rest schwer.
    expect(calls.filter(c => c.step === 'extract').every(c => !c.heavy)).toBe(true);
    expect(calls.filter(c => c.step !== 'extract').every(c => c.heavy)).toBe(true);
    expect(r.stats.outputWords).toBeGreaterThan(0);
  });

  it('beanstandete Kapitel werden einmal repariert', async () => {
    const { llm, calls } = makeLlm({ badFirstWrite: true });
    const r = await runSummaryPipeline({ sources: sources(), llm });
    expect(calls.some(c => c.step === 'write' && c.prompt.includes('=== ÜBERARBEITUNG ==='))).toBe(true);
    expect(r.warnings.filter(w => /Quellenangabe|50%/.test(w))).toEqual([]);
  });

  it('was nach der Reparatur bleibt, steht sichtbar als Warnung am Ergebnis', async () => {
    const { llm } = makeLlm({ badFirstWrite: true, stayBad: true });
    const r = await runSummaryPipeline({ sources: sources(), llm });
    expect(r.warnings.some(w => /Quellenangabe als Text/.test(w))).toBe(true);
    expect(r.warnings.some(w => /50%/.test(w))).toBe(true);
  });

  it('Sammeldatei nur aus Duplikaten wird begründet ausgelassen', async () => {
    const { llm } = makeLlm();
    const src: PipelineSource[] = [
      { docId: 'bundle', name: 'Sammeldatei', pageCount: 2, pages: [P.gorilla, P.door] },
      { docId: 'single', name: 'Einzel', pageCount: 1, pages: [P.gorilla] },
      { docId: 'single2', name: 'Einzel 2', pageCount: 1, pages: [P.door] },
    ];
    const r = await runSummaryPipeline({ sources: src, llm });
    expect(r.omittedSources).toEqual([{ sourceId: 'bundle', reason: expect.stringContaining('Einzel') }]);
  });

  it('Extraktion kommt beim zweiten Lauf aus dem Cache', async () => {
    const store = new Map<string, unknown[]>();
    const cache = { get: async (h: string) => store.get(h) ?? null, set: async (h: string, _d: string, _p: number, u: unknown[]) => { store.set(h, u); } };
    const first = makeLlm();
    await runSummaryPipeline({ sources: sources(), llm: first.llm, cache });
    const second = makeLlm();
    await runSummaryPipeline({ sources: sources(), llm: second.llm, cache });
    expect(second.calls.filter(c => c.step === 'extract')).toHaveLength(0);
  });

  it('Abbruch beendet den Lauf', async () => {
    const { llm } = makeLlm();
    let cancelled = false;
    const spy = vi.fn(async (req: StudioLlmRequest) => { cancelled = true; return llm(req); });
    await expect(runSummaryPipeline({ sources: sources(), llm: spy, isCancelled: () => cancelled })).rejects.toBeInstanceOf(PipelineCancelled);
  });

  it('Kapitelwahl: nur gewählte Seiten', async () => {
    const { llm } = makeLlm();
    const r = await runSummaryPipeline({ sources: [sources()[1]], ranges: new Map([['single', [[3, 3]]]]), llm });
    const cited = r.blocks.flatMap(b => [...b.cites, ...('items' in b ? (b.items as { cites: { page: number }[] }[]).flatMap(i => i.cites) : [])]);
    expect(cited.every(c => c.page === 3)).toBe(true);
  });
});
