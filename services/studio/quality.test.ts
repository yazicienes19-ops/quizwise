import { describe, it, expect } from 'vitest';
import type { Block, PipelineSource, Unit } from './types';
import { checkAuthorYears, checkIllustrative, checkMerksatz, checkPriority, checkRepetition, checkSourceErrorHints } from './validate';
import { markPriority } from './priority';
import { assignBudgets, chapterWordTotal, skeletonOutline, lectureIndex, summaryCorridor, type Lecture } from './outline';
import { extractionJobs, parseUnits, scanSourceErrors } from './extract';
import { writerBudget } from './write';
import { extractFacts } from './text';

/**
 * Phase 1.1 Commit 2 (Qualität): Rechenbeispiele, Wiederholungen, Merksatz,
 * Folienfehler, Prüfungsrelevanz, Autor-Jahr, feste Kapitel je Vorlesung.
 * Synthetische Daten, keine echten Folien.
 */

const U = (id: string, page: number, type: Unit['type'], text: string, extra: Partial<Unit> = {}): Unit => ({ id, sourceId: 's', page, type, text, ...extra });
const ctx = (units: Unit[]) => ({ sources: [{ docId: 's', name: 'S', pageCount: 100 }], units, omittedSources: [], sourceWords: 1000 });

describe('Rechenbeispiele sind keine Studienergebnisse', () => {
  const units = [
    U('u1', 24, 'study', 'Handy auf dem Tisch und Konzentration (Muster et al., 2023).', { study: { authors: 'Muster et al.', year: 2023, design: 'Zwei Gruppen' } }),
    U('u2', 25, 'example', 'Angenommen: M = 40 mit Handy, M = 55 ohne Handy, n = 25 je Gruppe.', { illustrative: true }),
  ];
  it('Extraktion: illustrative Befunde werden zu Beispielen ohne Studie', () => {
    const job = extractionJobs({ docId: 's', name: 'S', pageCount: 30, pages: Array.from({ length: 30 }, () => 'x') })[1];
    const [u] = parseUnits({ units: [{ page: 25, type: 'finding', text: 'M = 40 vs. M = 55', illustrative: true, authors: 'Muster et al.', year: '2023' }] }, job);
    expect(u).toMatchObject({ type: 'example', illustrative: true });
    expect(u.study).toBeUndefined();
  });
  it('study.result mit Werten aus dem Rechenbeispiel schlägt an, als Szenario-Tabelle nicht', () => {
    const bad: Block[] = [
      { id: 'c1-1', origin: 'quelle', cites: [], type: 'study', authors: 'Muster et al.', year: 2023, design: 'Zwei Gruppen', result: 'M = 40 mit Handy vs. M = 55 ohne; Hypothese bestätigt.', conclusion: '' },
      { id: 'c1-2', origin: 'quelle', cites: [], type: 'bullets', items: [{ text: 'Muster et al. (2023): M = 40 gegenüber M = 55.', cites: [] }] },
    ];
    expect(checkIllustrative(bad, units).map(i => i.blockId)).toEqual(['c1-1', 'c1-2']);
    const ok: Block[] = [
      { id: 'c1-3', origin: 'quelle', cites: [], type: 'study', authors: 'Muster et al.', year: 2023, design: 'Zwei Gruppen', result: '', conclusion: '' },
      { id: 'c1-4', origin: 'quelle', cites: [], type: 'table', headers: ['Szenario', 'Werte'], rows: [['Rechenbeispiel 1', 'M = 40 vs. M = 55']] },
      { id: 'c1-5', origin: 'quelle', cites: [], type: 'paragraph', text: 'Rechenbeispiel: M = 40 mit Handy, M = 55 ohne.' },
    ];
    expect(checkIllustrative(ok, units)).toEqual([]);
  });
  it('Kennwerte wie "M = 75" zählen als Zahl', () => {
    expect(extractFacts('M = 75, n=25, r = 1')).toEqual(expect.arrayContaining(['M=75', 'n=25', 'r=1']));
  });
});

describe('Autor und Jahr: Paare statt "verschiedene Jahre"', () => {
  const units = [
    U('u1', 100, 'study', 'Change Blindness (Levin & Simons, 1997).'),
    U('u2', 104, 'study', 'Türsteher-Experiment (Simons & Levin, 1998).'),
    U('u3', 94, 'study', 'Gorilla', { study: { authors: 'Simons & Chabris', year: 1999 } }),
    U('u4', 105, 'finding', 'Wahrnehmungsüberschätzung (Levin et al., 2000).'),
    U('u5', 130, 'concept', 'Probleme (z.B. Moray, 1959).'),
  ];
  it('keine Warnung für verschiedene Studien desselben Autors', () => {
    const blocks: Block[] = [{ id: 'b', origin: 'quelle', cites: [], type: 'paragraph',
      text: 'Levin & Simons (1997), Simons & Levin (1998), Simons & Chabris (1999), Levin et al. (2000), Moray (1959).' }];
    expect(checkAuthorYears(blocks, ctx(units))).toEqual([]);
  });
  it('Quellenangaben ohne Komma auf der Folie ("Allport 1987", "Johnston und Heinz 1978") gelten', () => {
    const src = [U('a', 136, 'concept', 'Selection for action (Allport 1987).'), U('b', 140, 'concept', 'Ressourcen (z. B. Allport 1989), flexible Selektion (Johnston und Heinz 1978).')];
    const blocks: Block[] = [{ id: 'b', origin: 'quelle', cites: [], type: 'paragraph', text: 'Allport (1987), Allport (1989) und Johnston & Heinz (1978).' }];
    expect(checkAuthorYears(blocks, ctx(src))).toEqual([]);
  });
  it('Warnung nur für ein Paar, das in keiner Quelle steht', () => {
    const blocks: Block[] = [{ id: 'b', origin: 'quelle', cites: [], type: 'paragraph', text: 'Moray (2011) zeigte den Effekt.' }];
    expect(checkAuthorYears(blocks, ctx(units)).map(i => i.message)).toEqual(['„Moray (2011)“ steht so in keiner Quelle.']);
  });
});

describe('Kapitel-Regeln', () => {
  const callout = (id: string, variant: 'merksatz' | 'hinweis'): Block => ({ id, origin: 'quelle', cites: [], type: 'callout', variant, text: 'x' });
  it('genau ein Merksatz je Kapitel', () => {
    expect(checkMerksatz([callout('a', 'merksatz')], 'c1-h', 'K')).toEqual([]);
    expect(checkMerksatz([callout('a', 'hinweis')], 'c1-h', 'K')[0].message).toContain('keinen Merksatz');
    expect(checkMerksatz([callout('a', 'merksatz'), callout('b', 'merksatz')], 'c1-h', 'K')[0].message).toContain('2 Merksätze');
  });
  it('Folienfehler brauchen einen Hinweis auf ihrer Seite', () => {
    const err = U('e', 24, 'source_error', 'Auf Folie 24 steht vermutlich versehentlich die Hypothese aus dem anderen Beispiel.');
    expect(checkSourceErrorHints([], [err])).toHaveLength(1);
    expect(checkSourceErrorHints([{ ...callout('h', 'hinweis'), cites: [{ sourceId: 's', page: 24 }] }], [err])).toEqual([]);
  });
  it('Wiederholung: gleicher Inhalt in zwei Blöcken, Studie als Block und als Stichpunkt', () => {
    const blocks: Block[] = [
      { id: 'a', origin: 'quelle', cites: [], type: 'paragraph', text: 'Selektive Aufmerksamkeit richtet sich auf einen Reiz, geteilte Aufmerksamkeit auf mehrere Reize gleichzeitig.' },
      { id: 'b', origin: 'quelle', cites: [], type: 'bullets', items: [{ text: 'Selektive Aufmerksamkeit richtet sich auf einen Reiz, geteilte auf mehrere Reize gleichzeitig.', cites: [] }] },
      { id: 'c', origin: 'quelle', cites: [{ sourceId: 's', page: 99 }], type: 'study', authors: 'Most et al.', year: 2001, design: 'D', result: 'R', conclusion: '' },
      { id: 'd', origin: 'quelle', cites: [], type: 'bullets', items: [{ text: 'Most et al. (2001) fanden einen Effekt der Salienz.', cites: [{ sourceId: 's', page: 99 }] }] },
      // Anderes Experiment derselben Autoren auf einer anderen Folie: keine Wiederholung.
      { id: 'f', origin: 'quelle', cites: [], type: 'bullets', items: [{ text: 'Most et al. (2001) variierten außerdem die Helligkeit.', cites: [{ sourceId: 's', page: 96 }] }] },
      { id: 'e', origin: 'quelle', cites: [], type: 'paragraph', text: 'Ein ganz anderer Gedanke über das Gedächtnis und seine Speicher.' },
    ];
    expect(checkRepetition(blocks).map(i => i.blockId)).toEqual(['b', 'd']);
  });
});

describe('Prüfungsrelevanz aus Wiederholungs- und Quizfolien', () => {
  const units = [
    U('u1', 18, 'list', 'Die vier Ziele der Psychologie: Beschreiben, Erklären, Vorhersagen, Verändern von Erleben und Verhalten.'),
    U('u2', 19, 'concept', 'Hermeneutik deutet Texte, Empirie prüft Aussagen an der Erfahrung.'),
    U('u3', 20, 'concept', 'Psychologie untersucht Erleben und Verhalten.'),
    U('u4', 46, 'practice_question', 'Was sind die Ziele der Psychologie?', { answer: 'Beschreiben, erklären, vorhersagen und verändern.' }),
  ];
  it('markiert nur, was auf der Quizfolie wieder auftaucht', () => {
    const marked = markPriority(units);
    expect(marked.filter(u => u.priority).map(u => u.id)).toEqual(['u1']);
  });
  it('fehlender prüfungsrelevanter Stoff schlägt an', () => {
    const byId = new Map(markPriority(units).map(u => [u.id, u]));
    expect(checkPriority(['u1', 'u2'], [], byId, 'c1-h')).toHaveLength(1);
    expect(checkPriority(['u1', 'u2'], [{ id: 'x', origin: 'quelle', cites: [], unitIds: ['u1'], type: 'paragraph', text: 't' }], byId, 'c1-h')).toEqual([]);
  });
});

describe('Feste Kapitel je Vorlesung', () => {
  const lectures: Lecture[] = [{ title: 'Heißner', docId: 'g', from: 1, to: 3 }, { title: 'Aufmerksamkeit_1', docId: 'g', from: 4, to: 6 }];
  const units = [1, 2, 4, 5, 6].map(p => ({ id: `u${p}`, sourceId: 'g', page: p, type: 'concept' as const, text: `t${p}` }));
  const groups = lectures.map((lecture, i) => ({ lecture, units: units.filter(u => lectureIndex(u, lectures) === i) }));
  it('Kapitelzahl = Vorlesungen, Einheiten bleiben in ihrem Kapitel, Vergessenes wird einsortiert', () => {
    // Modell liefert ein Kapitel zu viel, verschiebt u4 nach vorn und vergisst u6.
    const raw = { chapters: [
      { title: 'Einführung', sections: [{ title: 'A', unitIds: ['u1', 'u2', 'u4'] }] },
      { title: 'Aufmerksamkeit', sections: [{ title: 'B', unitIds: ['u5'] }] },
      { title: 'Extra', sections: [{ title: 'C', unitIds: ['u6'] }] },
    ] };
    const ch = skeletonOutline(raw, groups);
    expect(ch.map(c => c.title)).toEqual(['Einführung', 'Aufmerksamkeit']);
    expect(ch[0].sections.flatMap(s => s.unitIds)).toEqual(['u1', 'u2']);
    expect(ch[1].sections.flatMap(s => s.unitIds).sort()).toEqual(['u4', 'u5', 'u6']);
  });
  it('ohne Modellantwort: Titel der Vorlesung', () => {
    expect(skeletonOutline({}, groups).map(c => c.title)).toEqual(['Heißner', 'Aufmerksamkeit_1']);
  });
});

describe('Folienfehler im Rohtext und kleineres Schreibbudget', () => {
  it('Fehler nur auf gewählten Seiten im Fenster, gecacht', async () => {
    const src: PipelineSource = { docId: 's', name: 'S', pageCount: 3, pages: ['a b c', 'Handy-Beispiel mit Musik-Hypothese', 'c d e'] };
    const store = new Map<string, unknown[]>();
    const cache = { get: async (h: string) => store.get(h) ?? null, set: async (h: string, _d: string, _p: number, u: unknown[]) => { store.set(h, u); } };
    let calls = 0;
    const llm = async () => { calls += 1; return { errors: [{ page: 2, text: 'Auf Folie 2 steht vermutlich die falsche Hypothese.' }, { page: 9, text: 'außerhalb' }] }; };
    const units = await scanSourceErrors([src], new Map([['s', new Set([1, 2, 3])]]), llm, cache);
    expect(units).toEqual([{ sourceId: 's', page: 2, type: 'source_error', text: 'Auf Folie 2 steht vermutlich die falsche Hypothese.' }]);
    await scanSourceErrors([src], new Map([['s', new Set([1, 2, 3])]]), llm, cache);
    expect(calls).toBe(1);
  });
  it('Schreibmodell bekommt ein Viertel weniger als das echte Budget', () => {
    expect(writerBudget(800)).toBe(600);
  });
});

describe('Budget nach Folienwörtern, Abschnitte vom Code vorab abgezogen', () => {
  it('knapp extrahierte, aber volle Folien bekommen ihr Budget', () => {
    const units: Unit[] = [U('a', 1, 'concept', 'lang '.repeat(80)), U('b', 2, 'study', 'kurz')];
    const chapters = [
      { title: 'A', budget: 0, sections: [{ title: 'a', unitIds: ['a'] }] },
      { title: 'B', budget: 0, sections: [{ title: 'b', unitIds: ['b'] }] },
    ];
    // Nach Einheitentext bekäme B fast nichts; nach Folienwörtern (je 100) die Hälfte.
    expect(assignBudgets(chapters, units, 1000).map(c => c.budget)).toEqual([988, 60]);
    expect(assignBudgets(chapters, units, 1000, () => 100).map(c => c.budget)).toEqual([500, 500]);
  });
  it('Kapitel bekommen die Obergrenze abzüglich der angehängten Abschnitte', () => {
    const { max, min } = summaryCorridor(5248);
    expect(chapterWordTotal(5248, 450)).toBe(Math.round(max * 0.85) - 450);
    expect(chapterWordTotal(5248, 99999)).toBe(Math.round(min * 0.8));
  });
});
