import { describe, it, expect } from 'vitest';
import type { Block, PipelineSource } from './types';
import type { StudioLlm, StudioLlmRequest } from './llm';
import { runSummaryPipeline } from './pipeline';
import { checkGuideStructure, checkResultNumbers } from './validate';
import { guideCorridor } from './outline';
import { GUIDE_PARTS } from './prompts/guide.v1';

/** Phase A: Lernleitfaden über die Pipeline. Synthetische Daten, keine echten Folien, kein Netz. */

const PAGES = [
  'Gedächtnis Definition Kurzzeitgedächtnis Langzeitgedächtnis Muster 2001',
  'Studie Beispiel und Probe 2005 Wiedergabe 64 % und 31 %',
  'Modell Speicher Abruf Vergessen Kreislauf',
];
const source = (): PipelineSource => ({ docId: 'd', name: 'Gedächtnis', pageCount: 3, pages: [...PAGES] });
const ids = (prompt: string) => [...prompt.matchAll(/^- (u\d+) /gm)].map(m => m[1]);

const check = (q: string, a: string, units: string[]) => ({ type: 'check', origin: 'quelle', check: { question: q, answer: a, units } });
const guideChapter = (prompt: string, omit: string[] = []) => {
  const u = ids(prompt);
  return { blocks: [
    { type: 'heading', origin: 'quelle', heading: { text: GUIDE_PARTS.terms } },
    { type: 'table', origin: 'quelle', table: { headers: ['Begriff', 'Erklärung'], rows: u.map(id => ({ cells: [`Begriff ${id}`, `Erklärung ${id} aus der Folie.`], units: [id] })) } },
    { type: 'heading', origin: 'quelle', heading: { text: GUIDE_PARTS.questions } },
    ...(omit.includes('questions') ? [] : [
      check('Warum unterscheidet man Kurzzeit und Langzeit?', 'Weil beide verschieden lange speichern.', u.slice(0, 1)),
      check('Wie hängen Speicher und Abruf zusammen?', 'Abruf setzt eine Speicherung voraus.', u.slice(0, 1)),
      check('Was zeigt die Studie zur Wiedergabe?', 'Mit Wiederholung gaben mehr Personen die Liste wieder.', u.slice(0, 1)),
    ]),
    { type: 'heading', origin: 'quelle', heading: { text: GUIDE_PARTS.exam } },
    check('Wende das Modell auf einen Prüfungstag an.', 'Speichern vorher, Abruf am Tag, Vergessen ohne Wiederholung.', u.slice(0, 1)),
    check('Vergleiche Kurzzeit- und Langzeitgedächtnis.', 'Dauer und Umfang unterscheiden sich.', u.slice(0, 1)),
  ] };
};

const makeLlm = (write: (req: StudioLlmRequest) => unknown) => {
  const calls: StudioLlmRequest[] = [];
  const llm: StudioLlm = async req => {
    calls.push(req);
    if (req.step === 'extract') return { units: [...req.prompt.matchAll(/\[Seite (\d+)\]\n([^\n]+)/g)].map(m => ({ page: Number(m[1]), type: 'concept', text: m[2] })) };
    if (req.step === 'outline') return { chapters: [{ title: 'Gedächtnis', sections: [{ title: 'Grundlagen', unitIds: [...req.prompt.matchAll(/^(u\d+) \|/gm)].map(m => m[1]) }] }] };
    if (req.step === 'write') return write(req);
    return { issues: [], errors: [], items: [], topic: 'x' };
  };
  return { llm, calls };
};

describe('Lernleitfaden', () => {
  it('ein Aufruf je Kapitel mit Leitfaden-Prompt, keine Zeitleiste, Fragen belegt', async () => {
    const { llm, calls } = makeLlm(req => guideChapter(req.prompt));
    const r = await runSummaryPipeline({ sources: [source()], llm, format: 'leitfaden' });
    const writes = calls.filter(c => c.step === 'write');
    expect(writes).toHaveLength(1);
    expect(writes[0].prompt).toContain('Lernleitfadens zur Klausurvorbereitung');
    expect(calls.some(c => c.step === 'timeline')).toBe(false);
    expect(r.format).toBe('leitfaden');
    expect(r.blocks.filter(b => b.type === 'check').every(b => b.cites.length)).toBe(true);
    expect(r.warnings.filter(w => /Kernbegriffe|Verständnisfragen|Klausurfragen/.test(w))).toEqual([]);
  });

  it('fehlen die Verständnisfragen, wird das Kapitel einmal überarbeitet', async () => {
    let first = true;
    const { llm, calls } = makeLlm(req => {
      const repair = req.prompt.includes('=== ÜBERARBEITUNG ===');
      if (!repair && first) { first = false; return guideChapter(req.prompt, ['questions']); }
      return guideChapter(req.prompt);
    });
    const r = await runSummaryPipeline({ sources: [source()], llm, format: 'leitfaden' });
    const repairs = calls.filter(c => c.step === 'write' && c.prompt.includes('=== ÜBERARBEITUNG ==='));
    expect(repairs).toHaveLength(1);
    expect(repairs[0].prompt).toContain('„Verständnisfragen“ mit mindestens 3 Fragen');
    expect(r.blocks.filter(b => b.type === 'check' && b.id.startsWith('c')).length).toBeGreaterThanOrEqual(5);
  });

  it('Aufbau: Tabelle, mindestens 3 Verständnis- und 2 Klausurfragen, Antwort beantwortet die Frage', () => {
    const h = (id: string, text: string): Block => ({ id, origin: 'quelle', cites: [], type: 'heading', level: 3, text });
    const q = (id: string, question: string, answer: string, cited = true): Block =>
      ({ id, origin: 'quelle', cites: cited ? [{ sourceId: 'd', page: 1 }] : [], type: 'check', question, answer });
    const table: Block = { id: 't', origin: 'quelle', cites: [], type: 'table', headers: ['Begriff', 'Erklärung'], rows: [['A', 'B']] };
    const ok: Block[] = [h('h1', 'Kernbegriffe'), table, h('h2', 'Verständnisfragen'), q('a', 'Warum A?', 'Weil B.'), q('b', 'Wie C?', 'Über D.'), q('c', 'Was E?', 'F ist es.'),
      h('h3', 'Typische Klausurfragen'), q('d', 'Wende G an.', 'H und I.'), q('e', 'Vergleiche J und K.', 'L gegen M.')];
    expect(checkGuideStructure(ok, 'c1-h')).toEqual([]);
    const bad: Block[] = [h('h1', 'Kernbegriffe'), h('h2', 'Verständnisfragen'), q('a', 'Welche Rolle spielt Gewohnheit?', 'Welche Rolle spielt Gewohnheit?'), q('b', 'Wie C?', 'Über D.', false)];
    expect(checkGuideStructure(bad, 'c1-h').map(i => i.message)).toEqual([
      'Im Kapitel fehlt „Kernbegriffe“ mit einer Tabelle Begriff | Erklärung, „Verständnisfragen“ mit mindestens 3 Fragen, „Typische Klausurfragen“ mit mindestens 2 Fragen.',
      'Die Antwort auf „Welche Rolle spielt Gewohnheit?“ wiederholt nur die Frage. Beantworte sie aus den Einheiten.',
      'Frage „Wie C?“ ohne Beleg: in "units" die Einheiten der Antwort angeben.',
    ]);
  });

  it('Länge 30 bis 60 % der Quelle', () => {
    expect(guideCorridor(5000)).toEqual({ min: 1500, max: 3000, target: 2250 });
    expect(guideCorridor(1000).min).toBe(800);
  });

  it('Ergebniszahlen echter Studien müssen im Kapitel stehen, Rechenbeispiele nicht', () => {
    const units = [
      { id: 'u1', sourceId: 'd', page: 2, type: 'finding' as const, text: 'Wiedergabe: 64 % mit Wiederholung, 31 % ohne.' },
      { id: 'u2', sourceId: 'd', page: 3, type: 'example' as const, text: 'Angenommen 50 % und 20 %.', illustrative: true },
    ];
    const p = (text: string): Block[] => [{ id: 'c1-1', origin: 'quelle', cites: [], type: 'paragraph', text }];
    expect(checkResultNumbers(units, p('Mit Wiederholung 64 %, ohne 31 %.'), 'c1-h')).toEqual([]);
    expect(checkResultNumbers(units, p('Bis zu 64 % gaben die Liste wieder.'), 'c1-h').map(i => i.message))
      .toEqual(['Ergebnisse fehlen: 31% (u1). Nimm jeden Wert einzeln und exakt auf.']);
  });
});
