import { describe, it, expect } from 'vitest';
import type { Block, PipelineSource } from './types';
import type { StudioLlm, StudioLlmRequest } from './llm';
import { runSummaryPipeline } from './pipeline';
import { checkLength, checkScriptSections } from './validate';
import { scriptCorridor } from './outline';

/**
 * Phase 2: Format „Skript“ (verstehen statt wiederholen). Synthetische
 * Daten, keine echten Folien, kein Netz.
 */

const PAGES = [
  'Aufmerksamkeit Definition selektive und geteilte Aufmerksamkeit Cocktail Party Phänomen',
  'Inattentional Blindness Gorilla Experiment Simons und Chabris 1999 mit 58 % und 27 %',
  'Filtertheorie frühe Selektion nach physikalischen Merkmalen Broadbent 1958',
  'Attenuation abgeschwächte Weiterleitung Treisman 1964 Vergleich mit Broadbent',
];

const source = (): PipelineSource => ({ docId: 'd', name: 'Aufmerksamkeit', pageCount: 4, pages: [...PAGES] });

const fakeExtract = (prompt: string) => ({
  units: [...prompt.matchAll(/\[Seite (\d+)\]\n([^\n]+)/g)].map(m => ({ page: Number(m[1]), type: Number(m[1]) === 2 ? 'study' : 'concept', text: m[2],
    ...(Number(m[1]) === 2 ? { authors: 'Simons & Chabris', year: '1999', design: 'Video', result: '58 % vs. 27 %' } : {}) })),
});

const ids = (prompt: string) => [...prompt.matchAll(/^- (u\d+) /gm)].map(m => m[1]);

/** Ein vollständiger Skript-Abschnitt; `omit` lässt Teile weg. */
const section = (prompt: string, omit: string[] = []) => {
  // Je Abschnitt eigener Text (sonst schlägt zu Recht die Wiederholungsregel an).
  const tag = prompt.match(/## Abschnitt: (\S+)/)?.[1] ?? 'x';
  return { blocks: [
  { type: 'heading', origin: 'quelle', heading: { text: 'Abschnitt' } },
  ...(omit.includes('leitfrage') ? [] : [{ type: 'callout', origin: 'quelle', callout: { variant: 'leitfrage', text: `Worum geht es bei ${tag}?` } }]),
  { type: 'paragraph', origin: 'quelle', paragraph: { text: `${tag}: ${Array.from({ length: 60 }, (_, i) => `${tag}wort${i}`).join(' ')}.`, units: ids(prompt) } },
  { type: 'callout', origin: 'ki', callout: { variant: 'beispiel', text: `${tag}: ${Array.from({ length: 12 }, (_, i) => `${tag}bsp${i}`).join(' ')}.` } },
  ...(omit.includes('check') ? [] : [{ type: 'check', origin: 'quelle', check: { question: `Wie wendest du ${tag} an?`, answer: `So: ${tag}.`, units: ids(prompt).slice(0, 1) } }]),
  { type: 'callout', origin: 'quelle', callout: { variant: 'bruecke', text: `${tag}: ${Array.from({ length: 8 }, (_, i) => `${tag}weiter${i}`).join(' ')}.` } },
] };
};

const outline = (prompt: string) => {
  const all = [...prompt.matchAll(/^(u\d+) \|/gm)].map(m => m[1]);
  return { chapters: [{ title: 'Aufmerksamkeit', sections: [{ title: 'Grundlagen', unitIds: all.slice(0, 2) }, { title: 'Modelle', unitIds: all.slice(2) }] }] };
};

const makeLlm = (write: (req: StudioLlmRequest) => unknown) => {
  const calls: StudioLlmRequest[] = [];
  const llm: StudioLlm = async req => {
    calls.push(req);
    if (req.step === 'extract') return fakeExtract(req.prompt);
    if (req.step === 'outline') return outline(req.prompt);
    if (req.step === 'check' || req.step === 'scan') return { issues: [], errors: [] };
    if (req.step === 'timeline') return { topic: 'x', items: [] };
    return write(req);
  };
  return { llm, calls };
};

describe('Skript', () => {
  it('je Abschnitt ein Aufruf mit Skript-Prompt und Nachbarn, keine Zeitleiste, Format im Ergebnis', async () => {
    const { llm, calls } = makeLlm(req => section(req.prompt));
    const r = await runSummaryPipeline({ sources: [source()], llm, format: 'skript' });
    const writes = calls.filter(c => c.step === 'write');
    expect(writes.map(w => `${(w.prompt.match(/## Abschnitt: .*/g) ?? []).join(' / ')}${w.prompt.includes('=== ÜBERARBEITUNG ===') ? ` REPARATUR: ${w.prompt.split('=== ÜBERARBEITUNG ===')[1].split('\n')[2]}` : ''}`)).toEqual(['## Abschnitt: Grundlagen', '## Abschnitt: Modelle']);
    expect(writes.every(w => w.prompt.includes('Zweck: VERSTEHEN'))).toBe(true);
    expect(writes[0].prompt).toContain('NÄCHSTER ABSCHNITT: Modelle');
    expect(writes[1].prompt).toContain('VORHERIGER ABSCHNITT: Grundlagen');
    expect(calls.some(c => c.step === 'timeline')).toBe(false);
    expect(r.format).toBe('skript');
    expect(r.blocks.some(b => b.type === 'check')).toBe(true);
    expect(r.warnings.filter(w => /Leitfrage|Kurz gecheckt|Überleitung|Merksatz/.test(w))).toEqual([]);
    // Das Schema bietet check an, die Zusammenfassung nicht.
    expect(JSON.stringify(writes[0].schema)).toContain('"check"');
  });

  it('fehlt Leitfrage oder Kurz gecheckt, wird nur dieser Abschnitt neu geschrieben', async () => {
    let first = true;
    const { llm, calls } = makeLlm(req => {
      const repair = req.prompt.includes('=== ÜBERARBEITUNG ===');
      if (!repair && req.prompt.includes('Abschnitt: Modelle') && first) { first = false; return section(req.prompt, ['leitfrage', 'check']); }
      return section(req.prompt);
    });
    const r = await runSummaryPipeline({ sources: [source()], llm, format: 'skript' });
    const repairs = calls.filter(c => c.step === 'write' && c.prompt.includes('=== ÜBERARBEITUNG ==='));
    expect(repairs).toHaveLength(1);
    expect(repairs[0].prompt).toContain('Abschnitt: Modelle');
    expect(repairs[0].prompt).not.toContain('## Abschnitt: Grundlagen');
    expect(r.warnings.filter(w => /Leitfrage/.test(w))).toEqual([]);
  });

  it('Aufbau je Abschnitt: Leitfrage zuerst, mindestens eine Frage, Überleitung', () => {
    const h = (id: string): Block => ({ id, origin: 'quelle', cites: [], type: 'heading', level: 3, text: id });
    const c = (id: string, variant: 'leitfrage' | 'bruecke'): Block => ({ id, origin: 'quelle', cites: [], type: 'callout', variant, text: 'x' });
    const q = (id: string): Block => ({ id, origin: 'quelle', cites: [], type: 'check', question: 'q', answer: 'a' });
    const ok: Block[] = [h('A'), c('a1', 'leitfrage'), q('a2'), c('a3', 'bruecke')];
    expect(checkScriptSections(ok, 'c1-h')).toEqual([]);
    const bad: Block[] = [...ok, h('B'), q('b1')];
    expect(checkScriptSections(bad, 'c1-h').map(i => i.message)).toEqual(['Abschnitt „B“: es fehlt eine Leitfrage am Anfang, eine Überleitung am Ende.']);
  });

  it('Länge 80 bis 150 % der Quelle', () => {
    expect(scriptCorridor(5000)).toEqual({ min: 4000, max: 7500, target: 5750 });
    const ctx = { sources: [], units: [], omittedSources: [], sourceWords: 5000, format: 'skript' as const };
    const p = (n: number): Block[] => [{ id: 'c1-1', origin: 'quelle', cites: [], type: 'paragraph', text: 'wort '.repeat(n) }];
    expect(checkLength(p(1000), ctx)[0].message).toMatch(/Zu kurz/);
    expect(checkLength(p(5500), ctx)).toEqual([]);
    expect(checkLength(p(9000), ctx)[0].message).toMatch(/Zu lang/);
  });
});
