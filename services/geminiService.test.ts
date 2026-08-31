import { describe, it, expect, vi, beforeEach } from 'vitest';

// callBackend (services/geminiService.ts) braucht eine Supabase-Session für den
// Auth-Header — echtes supabaseClient.ts würde beim Import mit fehlenden
// VITE_SUPABASE_*-Env-Vars im Testlauf crashen, deshalb komplett gemockt
// (gleiches Muster wie hooks/useKnowledgeGraph.test.ts / services/documentService.test.ts).
vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'fake-token' } } }),
    },
  },
}));

import { evaluateStepByStep } from './geminiService';

const mockFetchOnce = (payload: unknown) => {
  (global.fetch as any).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ text: JSON.stringify(payload) }),
  });
};

describe('evaluateStepByStep', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  const q1 = { id: 'q1', question: 'Löse x²-5x+6=0', expectedSteps: ['x²-5x+6=0', '(x-2)(x-3)=0', 'x=2 oder x=3'], userSteps: ['x²-5x+6=0', '(x-2)(x-3)=0', 'x=2 oder x=3'], points: 6 };
  const q2 = { id: 'q2', question: 'Leite f(x)=x^2 ab', expectedSteps: ['f\'(x)=2x'], userSteps: ['f\'(x)=2x'], points: 3 };

  it('leeres Array ohne Fragen macht keinen Call', async () => {
    const result = await evaluateStepByStep([]);
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ordnet die KI-Antwort per ID den Fragen zu (ein Call reicht)', async () => {
    mockFetchOnce([
      { id: 'q1', achievedPoints: 6, correctApproach: true, finalResultCorrect: true, stepFeedback: [{ stepIndex: 0, verdict: 'correct' }, { stepIndex: 1, verdict: 'correct' }, { stepIndex: 2, verdict: 'correct' }] },
      { id: 'q2', achievedPoints: 3, correctApproach: true, finalResultCorrect: true, stepFeedback: [{ stepIndex: 0, verdict: 'correct' }] },
    ]);

    const result = await evaluateStepByStep([q1, q2]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.id === 'q1')?.achievedPoints).toBe(6);
    expect(result.find(r => r.id === 'q2')?.achievedPoints).toBe(3);
  });

  it('vergibt echte Teilpunkte (weder 0 noch volle Punktzahl) bei größtenteils richtigem Weg mit einem Fehler', async () => {
    mockFetchOnce([
      {
        id: 'q1', achievedPoints: 4, correctApproach: true, finalResultCorrect: false,
        stepFeedback: [
          { stepIndex: 0, verdict: 'correct' },
          { stepIndex: 1, verdict: 'correct' },
          { stepIndex: 2, verdict: 'error', note: 'Vorzeichen beim Auflösen vertauscht.', errorType: 'sign_error' },
        ],
      },
    ]);

    const result = await evaluateStepByStep([q1]);
    expect(result[0].achievedPoints).toBe(4);
    expect(result[0].achievedPoints).toBeGreaterThan(0);
    expect(result[0].achievedPoints).toBeLessThan(6);
    expect(result[0].correctApproach).toBe(true);
    expect(result[0].finalResultCorrect).toBe(false);
    expect(result[0].stepFeedback?.[2].errorType).toBe('sign_error');
  });

  it('fehlt eine ID in der ersten Antwort, wird gezielt genau diese Frage nachgefragt (Retry)', async () => {
    // Erster Call: nur q1 kommt zurück, q2 fehlt.
    mockFetchOnce([
      { id: 'q1', achievedPoints: 6, correctApproach: true, finalResultCorrect: true, stepFeedback: [] },
    ]);
    // Retry-Call: liefert q2 nach.
    mockFetchOnce([
      { id: 'q2', achievedPoints: 1, correctApproach: false, finalResultCorrect: false, stepFeedback: [{ stepIndex: 0, verdict: 'error', errorType: 'calc_error' }] },
    ]);

    const result = await evaluateStepByStep([q1, q2]);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Der Retry-Call darf NUR die fehlende Frage enthalten, nicht die ganze Liste erneut.
    const secondCallBody = JSON.parse((global.fetch as any).mock.calls[1][1].body);
    expect(secondCallBody.parts[0].text).toContain('"id":"q2"');
    expect(secondCallBody.parts[0].text).not.toContain('"id":"q1"');

    expect(result.find(r => r.id === 'q1')?.achievedPoints).toBe(6);
    expect(result.find(r => r.id === 'q2')?.achievedPoints).toBe(1);
  });

  it('fehlt eine ID auch nach dem Retry, gibt es einen 0-Punkte-Fallback OHNE erfundenes Feedback', async () => {
    // Erster Call: q2 fehlt.
    mockFetchOnce([
      { id: 'q1', achievedPoints: 6, correctApproach: true, finalResultCorrect: true, stepFeedback: [] },
    ]);
    // Retry-Call: liefert wieder nichts Brauchbares für q2.
    mockFetchOnce([]);

    const result = await evaluateStepByStep([q1, q2]);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const fallback = result.find(r => r.id === 'q2');
    expect(fallback).toBeDefined();
    expect(fallback?.achievedPoints).toBe(0);
    expect(fallback?.correctApproach).toBe(false);
    expect(fallback?.finalResultCorrect).toBe(false);
    expect(fallback?.stepFeedback).toEqual([]);
  });

  it('wirft der Retry-Call selbst einen Fehler, bricht die gesamte Bewertung nicht ab (fällt auf 0-Punkte-Fallback zurück)', async () => {
    mockFetchOnce([
      { id: 'q1', achievedPoints: 6, correctApproach: true, finalResultCorrect: true, stepFeedback: [] },
    ]);
    (global.fetch as any).mockRejectedValueOnce(new Error('Netzwerkfehler'));

    const result = await evaluateStepByStep([q1, q2]);
    expect(result.find(r => r.id === 'q1')?.achievedPoints).toBe(6);
    expect(result.find(r => r.id === 'q2')?.achievedPoints).toBe(0);
  });
});
