import { describe, it, expect, vi } from 'vitest';
import type { RecallChallenge } from '../types';
import {
  generateValidatedChallenge, questionMatchesFocus, resolveActualTopic, MAX_GENERATION_ATTEMPTS,
} from './recallChallengeGuard';

// Die echten Live-Fragen vom Browser-Test (2026-08-22)
const LIVE_Q1 = 'Warum ist der Fokus auf beobachtbares Verhalten im Behaviorismus entscheidend für die Ablehnung innerer mentaler Zustände, und wie lässt sich dies auf die wissenschaftliche Betrachtung von Verhaltensänderungen übertragen?';
const LIVE_Q2 = 'Warum ist die Konzentration auf beobachtbares Verhalten für das Verständnis psychologischer Prozesse laut dem Behaviorismus entscheidend und wie grenzt sich dies von der Betrachtung innerer mentaler Zustände ab?';
const EXTINCTION_Q = 'Erkläre, was Extinktion bei der klassischen Konditionierung bedeutet und welche Prozesse danach auftreten können.';

const mkChallenge = (over: Partial<RecallChallenge>): RecallChallenge => ({
  question: EXTINCTION_Q,
  topic: 'Extinktion',
  expectedKeywords: ['Extinktion', 'Reiz'],
  conceptContext: 'Kontext',
  ...over,
} as RecallChallenge);



describe('questionMatchesFocus', () => {
  it('exaktes Thema, Enthaltensein und Token-Überdeckung zählen als Treffer', () => {
    expect(questionMatchesFocus(mkChallenge({ topic: 'Extinktion' }), 'Extinktion')).toBe(true);
    expect(questionMatchesFocus(mkChallenge({ topic: 'Extinktion (Löschung)' }), 'Extinktion')).toBe(true);
    expect(questionMatchesFocus(mkChallenge({ topic: 'Klassische Konditionierung Extinktion' }), 'Extinktion')).toBe(true);
  });

  it('klar anderes Thema UND Frage ohne Fokus-Begriff → kein Treffer', () => {
    expect(questionMatchesFocus(mkChallenge({ topic: 'Behaviorismus', question: LIVE_Q1 }), 'Extinktion')).toBe(false);
  });

  it('LIVE-Lüge (2. Runde): topic behauptet Fokus, Fragetext behandelt etwas anderes → kein Treffer', () => {
    // Genauso passiert im Browser: topic="Extinktion" (Prompt-Gehorsam), Frage = Behaviorismus
    expect(questionMatchesFocus(mkChallenge({ topic: 'Extinktion', question: LIVE_Q1 }), 'Extinktion')).toBe(false);
  });

  it('Fragetext erwähnt den Fokus-Begriff → Treffer (auch bei ausgeschmücktem topic)', () => {
    expect(questionMatchesFocus(mkChallenge({ topic: 'Extinktion (Löschung)', question: EXTINCTION_Q }), 'Extinktion')).toBe(true);
  });

  it('leerer Fokus ist immer ok', () => {
    expect(questionMatchesFocus(mkChallenge({ topic: 'Irgendwas' }), '  ')).toBe(true);
  });
});

describe('resolveActualTopic (BUG 2)', () => {
  it('KI-topic gewinnt über den Fokus — das Fakt schlägt den Wunsch', () => {
    expect(resolveActualTopic(mkChallenge({ topic: 'Behaviorismus' }), 'Extinktion', 'Quelle')).toBe('Behaviorismus');
  });

  it('Fokus nur als Fallback, wenn die KI kein topic liefert', () => {
    expect(resolveActualTopic(mkChallenge({ topic: '' }), 'Extinktion', 'Quelle')).toBe('Extinktion');
    expect(resolveActualTopic(mkChallenge({ topic: '  ' }), '', 'Quelle')).toBe('Quelle');
    expect(resolveActualTopic(mkChallenge({ topic: undefined }), '', '')).toBe('Recall Session');
  });

  it('kürzt absurd lange Topics auf 80 Zeichen', () => {
    expect(resolveActualTopic(mkChallenge({ topic: 'x'.repeat(200) }), '', '').length).toBe(80);
  });
});

// ── Orchestrierung: die 8 Guard-Szenarien aus der Vorgabe ──────────────────
describe('generateValidatedChallenge', () => {
  const baseOpts = {
    source: { text: 'doc' } as never,
    recentQuestions: [] as string[],
  };

  it('TEST 1+5: Fokus passt beim ersten Versuch → ok, actualTopic = KI-topic/Fokus, 1 Call', async () => {
    const generate = vi.fn().mockResolvedValue(mkChallenge({}));
    const res = await generateValidatedChallenge({ ...baseOpts, focusTopic: 'Extinktion', generate });
    expect(generate).toHaveBeenCalledTimes(1);
    if ('error' in res) throw new Error('unexpected error');
    expect(res.challenge.topic).toBe('Extinktion');
    expect(res.actualTopic).toBe('Extinktion');
  });

  it('TEST 2: Fokus zweimal ignoriert → sauberer focus-Fehler, nie ausgeliefert, max 2 Calls', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(mkChallenge({ topic: 'Behaviorismus', question: LIVE_Q1 }))
      .mockResolvedValueOnce(mkChallenge({ topic: 'Behaviorismus', question: LIVE_Q2 }));
    const res = await generateValidatedChallenge({ ...baseOpts, focusTopic: 'Extinktion', generate });
    expect(generate).toHaveBeenCalledTimes(MAX_GENERATION_ATTEMPTS);
    expect(res).toEqual({ error: 'focus' });
  });

  it('TEST 2a: zweite Regeneration enthält Korrektur-Hinweis (retryHint) im Prompt-Call', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(mkChallenge({ topic: 'Behaviorismus', question: LIVE_Q1 }))
      .mockResolvedValueOnce(mkChallenge({}));
    await generateValidatedChallenge({ ...baseOpts, focusTopic: 'Extinktion', generate });
    const secondCall = generate.mock.calls[1];
    expect(secondCall[3]?.retryHint).toContain('Extinktion');
  });

  it('TEST 3: erst Duplikat, dann neue Frage → ok nach Regeneration; Duplikat-Frage landet auf avoidQuestions', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(mkChallenge({ topic: 'Extinktion', question: LIVE_Q1 }))
      .mockResolvedValueOnce(mkChallenge({ topic: 'Extinktion', question: EXTINCTION_Q }));
    const res = await generateValidatedChallenge({
      ...baseOpts, focusTopic: 'Extinktion', recentQuestions: [LIVE_Q1], generate,
    });
    expect(generate).toHaveBeenCalledTimes(2);
    const secondCall = generate.mock.calls[1];
    expect(secondCall[3]?.avoidQuestions).toContain(LIVE_Q1);
    if ('error' in res) throw new Error('unexpected error');
  });

  it('TEST 4: ohne Fokus, andere Frage → sofort ok, Verhalten unverändert', async () => {
    const generate = vi.fn().mockResolvedValue(mkChallenge({ topic: 'Operante Konditionierung', question: OTHER }));
    const res = await generateValidatedChallenge({ ...baseOpts, generate });
    expect(generate).toHaveBeenCalledTimes(1);
    if ('error' in res) throw new Error('unexpected error');
    expect(res.actualTopic).toBe('Operante Konditionierung');
  });

  it('TEST 6: Fokus-Verstoß liefert Fehler statt fake success — nichts zum Speichern', async () => {
    const generate = vi.fn().mockResolvedValue(mkChallenge({ topic: 'Behaviorismus', question: LIVE_Q1 }));
    const res = await generateValidatedChallenge({ ...baseOpts, focusTopic: 'Extinktion', generate });
    expect(res).toEqual({ error: 'focus' });
    // Der Aufrufer (ActiveRecall) returned in diesem Fall ohne setChallenge —
    // es existiert kein Challenge-Objekt, das in die History gelangen könnte.
  });

  it('TEST 7: zweimal Duplikat → sauberer duplicate-Fehler, keine Schleife', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(mkChallenge({ question: LIVE_Q1 }))
      .mockResolvedValueOnce(mkChallenge({ question: LIVE_Q2 }));
    const res = await generateValidatedChallenge({ ...baseOpts, recentQuestions: [LIVE_Q1], generate });
    expect(generate).toHaveBeenCalledTimes(MAX_GENERATION_ATTEMPTS);
    expect(res).toEqual({ error: 'duplicate' });
  });

  it('TEST 8: bestehender Flow ohne Fokus und ohne Recent-Fragen funktioniert unverändert', async () => {
    const generate = vi.fn().mockResolvedValue(mkChallenge({}));
    const res = await generateValidatedChallenge({ ...baseOpts, generate });
    if ('error' in res) throw new Error('unexpected error');
    expect(res.challenge.question).toBe(EXTINCTION_Q);
    expect(generate.mock.calls[0][3]?.avoidQuestions).toEqual([]);
  });
});

const OTHER = 'Erkläre den Unterschied zwischen positiver und negativer Verstärkung mit je einem Beispiel aus dem Alltag.';
