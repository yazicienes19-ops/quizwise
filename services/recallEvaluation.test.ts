import { describe, it, expect, vi, beforeEach } from 'vitest';

// Gleiches Mock-Muster wie examAdaptivePrompt.test.ts: callBackend braucht eine Session.
vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'fake-token' } } }),
    },
  },
}));

import { evaluateRecallResponse } from './geminiService';
import type { RecallChallenge } from '../types';

const challenge: RecallChallenge = {
  question: 'Erkläre die klassische Konditionierung.',
  topic: 'Klassische Konditionierung',
  expectedKeywords: ['Neutraler Reiz', 'Unkonditionierte Reaktion', 'Pawlow'],
  conceptContext: 'Kontext',
};

const mockFetchOnce = (payload: unknown) => {
  (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ text: JSON.stringify(payload) }) });
};

const promptOf = (): string =>
  JSON.parse((global.fetch as any).mock.calls[0][1].body).parts.map((p: any) => p.text ?? '').join('\n');

const basePayload = {
  score: 72, clarity: 64, feedback: 'f', missingPoints: [], strengths: [], suggestedReview: 'r',
  unexplainedJargon: [], usedExample: false, coveredKeywords: [], probeQuestion: '',
};

describe('evaluateRecallResponse (Feynman-Bewertung)', () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it('misst Verständlichkeit an der gewählten Zielgruppe', async () => {
    mockFetchOnce(basePayload);
    await evaluateRecallResponse(challenge, 'Antwort', { text: 'Dokument' }, 'child');
    expect(promptOf()).toContain('ZIELGRUPPE: ein zwölfjähriges Kind');

    (global.fetch as any).mockReset();
    mockFetchOnce(basePayload);
    await evaluateRecallResponse(challenge, 'Antwort', { text: 'Dokument' }, 'exam');
    expect(promptOf()).toContain('ZIELGRUPPE: Prüfer in einer mündlichen Prüfung');
  });

  it('Inhalt zählt in jedem Modus: vereinfachen erlaubt, weglassen kostet, Prüfung streng', async () => {
    mockFetchOnce(basePayload);
    await evaluateRecallResponse(challenge, 'Antwort', { text: 'Dokument' }, 'child');
    const childPrompt = promptOf();
    expect(childPrompt).toContain('Vereinfachen heißt aber nicht weglassen');
    expect(childPrompt).toContain('fehlende Inhalte zählen immer als Lücke');
    expect(childPrompt).not.toContain('INHALT (streng');

    (global.fetch as any).mockReset();
    mockFetchOnce(basePayload);
    await evaluateRecallResponse(challenge, 'Antwort', { text: 'Dokument' }, 'peer');
    expect(promptOf()).toContain('Fehlende Kernaussagen oder Zusammenhänge gehören in missingPoints');

    (global.fetch as any).mockReset();
    mockFetchOnce(basePayload);
    await evaluateRecallResponse(challenge, 'Antwort', { text: 'Dokument' }, 'exam');
    const examPrompt = promptOf();
    expect(examPrompt).toContain('INHALT (streng wie in einer mündlichen Prüfung)');
    expect(examPrompt).toContain('umgangssprachliche Umschreibung statt des Fachbegriffs gilt hier als Lücke');
  });

  it('normalisiert die neuen Felder: Kernbegriffe nur aus der Vorgabe, Werte geklemmt, Nachfrage getrimmt', async () => {
    mockFetchOnce({
      ...basePayload,
      clarity: 130,
      coveredKeywords: ['pawlow', 'Erfundener Begriff', 'Neutraler Reiz', 'PAWLOW'],
      unexplainedJargon: [' Stimulus ', '', 'Reflex', 'a', 'b', 'c', 'd'],
      usedExample: true,
      probeQuestion: '  Warum speichelt der Hund schon beim Glockenton?  ',
    });
    const res = await evaluateRecallResponse(challenge, 'Antwort', { text: 'Dokument' }, 'child');
    expect(res.clarity).toBe(100);
    expect(res.coveredKeywords).toEqual(['Pawlow', 'Neutraler Reiz']);
    expect(res.unexplainedJargon).toEqual(['Stimulus', 'Reflex', 'a', 'b', 'c']);
    expect(res.usedExample).toBe(true);
    expect(res.probeQuestion).toBe('Warum speichelt der Hund schon beim Glockenton?');
  });

  it('wertet Fachsprache in der Prüfungs-Zielgruppe nicht als Mangel', async () => {
    mockFetchOnce({ ...basePayload, unexplainedJargon: ['Stimulus'] });
    const res = await evaluateRecallResponse(challenge, 'Antwort', { text: 'Dokument' }, 'exam');
    expect(res.unexplainedJargon).toEqual([]);
  });

  it('bleibt mit Alt-Antworten ohne die neuen Felder lauffähig', async () => {
    mockFetchOnce({ score: 55, feedback: 'f', missingPoints: ['x'], strengths: [], suggestedReview: 'r' });
    const res = await evaluateRecallResponse(challenge, 'Antwort', { text: 'Dokument' });
    expect(res.score).toBe(55);
    expect(res.clarity).toBeUndefined();
    expect(res.coveredKeywords).toEqual([]);
    expect(res.probeQuestion).toBe('');
  });
});
