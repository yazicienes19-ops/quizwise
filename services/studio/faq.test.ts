import { describe, it, expect } from 'vitest';
import type { Block, PipelineSource } from './types';
import type { StudioLlm, StudioLlmRequest } from './llm';
import { runSummaryPipeline } from './pipeline';
import { checkFaqChapter } from './validate';

/** Phase A: Häufige Fragen über die Pipeline. Synthetische Daten, keine echten Folien, kein Netz. */

const q = (id: string, question: string, answer: string, unitIds: string[], cited = true): Block =>
  ({ id, origin: 'quelle', cites: cited ? [{ sourceId: 'd', page: 1 }] : [], unitIds, type: 'check', question, answer });

describe('Häufige Fragen', () => {
  it('je Abschnitt eine Frage, belegt, beantwortet, nicht zu lang, keine doppelt', () => {
    const sections = [{ title: 'Speicher', unitIds: ['u1'] }, { title: 'Abruf', unitIds: ['u2'] }];
    expect(checkFaqChapter(sections, [q('a', 'Was ist ein Speicher?', 'Er hält Inhalte fest.', ['u1']), q('b', 'Wie funktioniert der Abruf?', 'Inhalte werden zurückgeholt.', ['u2'])], 'c1-h')).toEqual([]);
    const msgs = checkFaqChapter(sections, [
      q('a', 'Was ist ein Speicher?', 'Was ist ein Speicher?', ['u1']),
      q('b', 'Was ist ein Speicher?', `${'lang '.repeat(91)}Ende.`, ['u1']),
      q('c', 'Warum vergessen wir?', 'Weil Spuren verblassen.', ['u1'], false),
    ], 'c1-h').map(i => i.message);
    expect(msgs).toEqual([
      'Abschnitte ohne Frage: „Abruf“. Je Abschnitt mindestens eine Frage.',
      'Die Antwort auf „Was ist ein Speicher?“ wiederholt nur die Frage.',
      'Antwort auf „Was ist ein Speicher?“ hat 92 Wörter, höchstens 90.',
      'Frage „Was ist ein Speicher?“ steht doppelt.',
      'Frage „Warum vergessen wir?“ ohne Beleg: in "units" die Einheiten der Antwort angeben.',
    ]);
  });

  it('Pipeline: ein Aufruf je Kapitel mit FAQ-Prompt, keine Übungsfragen oder Zeitleiste', async () => {
    const calls: StudioLlmRequest[] = [];
    const llm: StudioLlm = async req => {
      calls.push(req);
      if (req.step === 'extract') return { units: [...req.prompt.matchAll(/\[Seite (\d+)\]\n([^\n]+)/g)].map(m => ({ page: Number(m[1]), type: 'concept', text: m[2] })) };
      if (req.step === 'outline') return { chapters: [{ title: 'Gedächtnis', sections: [{ title: 'A', unitIds: [...req.prompt.matchAll(/^(u\d+) \|/gm)].map(m => m[1]) }] }] };
      if (req.step === 'write') {
        const ids = [...req.prompt.matchAll(/^- (u\d+) /gm)].map(m => m[1]);
        return { blocks: ids.map((id, i) => ({ type: 'check', origin: 'quelle', check: { question: `Frage ${i + 1} zu ${id}?`, answer: `Antwort zu ${id} aus der Folie.`, units: [id] } })) };
      }
      return { issues: [], errors: [], items: [] };
    };
    const source: PipelineSource = { docId: 'd', name: 'Gedächtnis', pageCount: 2, pages: ['Speicher hält Inhalte über die Zeit', 'Abruf holt Inhalte aus dem Speicher'] };
    const r = await runSummaryPipeline({ sources: [source], llm, format: 'faq' });
    expect(calls.filter(c => c.step === 'write')[0].prompt).toContain('häufigen Fragen (FAQ)');
    expect(calls.some(c => c.step === 'practice' || c.step === 'timeline')).toBe(false);
    expect(r.format).toBe('faq');
    expect(r.blocks.filter(b => b.type === 'check').length).toBe(2);
  });

  it('Folienserie „Ablauf - Schritt“ ergibt die Schrittfolge in Seitenreihenfolge', async () => {
    const { slideSequences } = await import('./text');
    const u = (page: number, title: string) => ({ sourceId: 'd', page, title });
    expect(slideSequences([u(7, 'Lernzyklus - Prüfen'), u(5, 'Lernzyklus - Planen'), u(6, 'Lernzyklus - Üben'), u(9, 'Anderes Thema')]))
      .toEqual([{ sourceId: 'd', name: 'Lernzyklus', steps: ['Planen', 'Üben', 'Prüfen'], from: 5, to: 7 }]);
  });

  it('eine Antwort verbindet nie zwei Beispiele verschiedener Autoren', () => {
    const units = [
      { id: 'u1', sourceId: 'd', page: 1, type: 'example' as const, text: 'Beispiel 1 (Muster, 2010): Lernen mit Licht.' },
      { id: 'u2', sourceId: 'd', page: 2, type: 'example' as const, text: 'Beispiel 2 (Probe, 2020): Lernen mit Lärm.' },
    ];
    const msgs = checkFaqChapter([], [q('a', 'Wie prüft man Hypothesen an Beispielen?', 'Mit Licht und analog mit Lärm.', ['u1', 'u2'])], 'c1-h', 0, units).map(i => i.message);
    expect(msgs).toContain('Die Antwort auf „Wie prüft man Hypothesen an Beispielen?“ verbindet verschiedene Beispiele (Muster, Probe). Je Beispiel eine eigene Frage.');
  });

  it('Beschreibung eines Ablaufs in anderer Reihenfolge als die Folienserie wird erkannt', async () => {
    const { contradictsSequence } = await import('./text');
    const steps = ['Planen', 'Ausführung', 'Überprüfung', 'Bewertung und neue Ziele'];
    expect(contradictsSequence('Kreislauf vom Planen über Bewertung, neue Ziele zur Ausführung und Überprüfung.', steps)).toBe(true);
    expect(contradictsSequence('Schritte: Planen, Ausführung, Überprüfung, Bewertung und neue Ziele.', steps)).toBe(false);
  });
});
