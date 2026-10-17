import { describe, it, expect } from 'vitest';
import type { Block, PipelineSource } from './types';
import type { StudioLlm, StudioLlmRequest } from './llm';
import { runSummaryPipeline } from './pipeline';
import { checkGuideStructure, checkGuideTerms, checkMeta, checkResultNumbers, checkStudyMixing } from './validate';
import { normalizeBlocks } from './blocks';
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
/** Text einer Einheit aus dem Schreib-Prompt (Zeile „- u1 (typ, Quelle, S. 1) Text“). */
const unitTextOf = (prompt: string, id: string) => prompt.match(new RegExp(`^- ${id} \\([^)]*\\)(?: \\[[^\\]]*\\])* (.+)$`, 'm'))?.[1] ?? `Erklärung ${id}.`;

const check = (q: string, a: string, units: string[]) => ({ type: 'check', origin: 'quelle', check: { question: q, answer: a, units } });
const guideChapter = (prompt: string, omit: string[] = []) => {
  const u = ids(prompt);
  return { blocks: [
    { type: 'heading', origin: 'quelle', heading: { text: GUIDE_PARTS.terms } },
    { type: 'table', origin: 'quelle', table: { headers: ['Begriff', 'Erklärung'], rows: u.map(id => ({ cells: [`Begriff ${id}`, unitTextOf(prompt, id)], units: [id] })) } },
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
      { id: 'u3', sourceId: 'd', page: 4, type: 'concept' as const, text: 'Überschätzen: Muster & Probe (2003): 12 % sahen es, 70 % glaubten es.' },
    ];
    const p = (text: string): Block[] => [{ id: 'c1-1', origin: 'quelle', cites: [], type: 'paragraph', text }];
    expect(checkResultNumbers(units, p('Mit Wiederholung 64 %, ohne 31 %. Es sahen 12 %, 70 % glaubten es.'), 'c1-h')).toEqual([]);
    expect(checkResultNumbers(units, p('Bis zu 64 % gaben die Liste wieder. Bis zu 70 % glaubten es.'), 'c1-h').map(i => i.message))
      .toEqual(['Ergebnisse fehlen: 31% (u1); 12% (u3). Nimm jeden Wert einzeln und exakt auf.']);
  });

  it('Studienkarte mit Belegen einer anderen Arbeit desselben Autors wird gemeldet', () => {
    const units = [
      { id: 'u1', sourceId: 'd', page: 5, type: 'study' as const, text: 'Split: Muster (1950) Zahlen auf beiden Ohren.' },
      { id: 'u2', sourceId: 'd', page: 9, type: 'concept' as const, text: 'Filtermodell nach Muster (1960): seriell, Umschalten.' },
    ];
    const study = (pages: number[]): Block => ({ id: 'c1-1', origin: 'quelle', cites: pages.map(page => ({ sourceId: 'd', page })), type: 'study', authors: 'Muster', year: 1950, design: 'a', result: 'b', conclusion: 'c' });
    expect(checkStudyMixing([study([5])], units)).toEqual([]);
    expect(checkStudyMixing([study([5, 9])], units).map(i => i.message)).toEqual([
      'Die Studie „Muster (1950)“ stützt sich auf Seite 9, dort geht es um eine andere Arbeit von Muster. Aufbau, Ergebnis und Schluss nur aus den Einheiten dieser Studie.',
    ]);
  });

  it('Beschreibung einer Abbildung statt ihres Inhalts wird gemeldet', () => {
    const p = (text: string): Block[] => [{ id: 'c1-1', origin: 'quelle', cites: [], type: 'bullets', items: [{ text, cites: [] }] }];
    expect(checkMeta(p('Zwei Pfeile führen vom Reiz zur Reaktion.')).map(i => i.rule)).toEqual(['meta']);
    expect(checkMeta(p('Der Reiz wird erst geprüft, dann folgt die Reaktion.'))).toEqual([]);
  });

  it('Klausurfalle „A vs. B: woran man sie unterscheidet: …“ wird zu „A vs. B: …“', () => {
    const byId = new Map([['u1', { id: 'u1', sourceId: 'd', page: 1, type: 'concept' as const, text: 'x' }]]) as Parameters<typeof normalizeBlocks>[1];
    const { blocks: [b] } = normalizeBlocks([{ type: 'callout', origin: 'quelle', callout: { variant: 'klausurfalle', text: 'Reiz vs. Reaktion: woran man sie unterscheidet: Der Reiz kommt zuerst.', units: ['u1'] } }], byId, 'c1-');
    expect(b.type === 'callout' && b.text).toBe('Reiz vs. Reaktion: Der Reiz kommt zuerst.');
  });

  it('mehr Zellen als Spalten: der Rest kommt in die letzte Spalte, kein Formfehler', () => {
    const byId = new Map([['u1', { id: 'u1', sourceId: 'd', page: 1, type: 'concept' as const, text: 'x' }]]) as Parameters<typeof normalizeBlocks>[1];
    const { blocks: [b] } = normalizeBlocks([{ type: 'table', origin: 'quelle', table: { headers: ['Begriff', 'Erklärung'], rows: [{ cells: ['Reiz', 'Kommt zuerst.', 'Löst die Reaktion aus.'], units: ['u1'] }] } }], byId, 'c1-');
    expect(b.type === 'table' && b.rows).toEqual([['Reiz', 'Kommt zuerst. Löst die Reaktion aus.']]);
    expect(b.type === 'table' && b.shapeError).toBeUndefined();
  });

  it('„hinweis“ setzt nur der Code: vom Modell geschrieben wird es ein Beispiel', () => {
    const byId = new Map([['u1', { id: 'u1', sourceId: 'd', page: 1, type: 'concept' as const, text: 'x' }]]) as Parameters<typeof normalizeBlocks>[1];
    const { blocks: [b] } = normalizeBlocks([{ type: 'callout', origin: 'quelle', callout: { variant: 'hinweis', text: 'Ein Zahlenbeispiel zur Methode.', units: ['u1'] } }], byId, 'c1-');
    expect(b.type === 'callout' && b.variant).toBe('beispiel');
  });

  it('Studienjahr kommt aus der belegten Einheit derselben Autoren', () => {
    const byId = new Map([['u1', { id: 'u1', sourceId: 'd', page: 1, type: 'study' as const, text: 'x', study: { authors: 'Probe et al.', year: 2011 } }]]) as Parameters<typeof normalizeBlocks>[1];
    const { blocks: [b] } = normalizeBlocks([{ type: 'study', origin: 'quelle', study: { authors: 'Probe et al.', year: '1911', design: 'a', result: 'b', conclusion: 'c', units: ['u1'] } }], byId, 'c1-');
    expect(b.type === 'study' && b.year).toBe(2011);
  });

  it('Definitionen gehören in eine Tabellenzeile, Begriffe nicht nur in eine Frage', () => {
    const units = [
      { id: 'u1', sourceId: 'd', page: 1, type: 'definition' as const, text: 'Reiz: was einwirkt.' },
      { id: 'u2', sourceId: 'd', page: 2, type: 'concept' as const, text: 'Gewöhnung: schwächere Reaktion.' },
    ];
    const table: Block = { id: 'c1-1', origin: 'quelle', cites: [], unitIds: ['u1'], type: 'table', headers: ['Begriff', 'Erklärung'], rows: [['Reiz', 'was einwirkt']] };
    const question: Block = { id: 'c1-2', origin: 'quelle', cites: [], unitIds: ['u2'], type: 'check', question: 'Was ist Gewöhnung?', answer: 'Schwächere Reaktion.' };
    expect(checkGuideTerms(units, [table, question], 'c1-h').map(i => i.message)).toEqual(['Begriffe fehlen in „Kernbegriffe“ (eigene Zeile) oder „Modelle und Abläufe“: u2.']);
    expect(checkGuideTerms(units, [{ ...table, unitIds: ['u1', 'u2'] }], 'c1-h')).toEqual([]);
  });
});
