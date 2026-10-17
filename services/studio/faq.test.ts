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
});
