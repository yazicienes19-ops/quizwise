import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'fake-token' } } }),
    },
  },
}));

import { generateFullExam } from './geminiService';

const respond = (payload: unknown) => ({ ok: true, json: async () => ({ text: JSON.stringify(payload) }) });
const okMc = { id: 'q1', type: 'mc', question: 'Wer gründete 1879 das Labor?', solution: 'Wundt', points: 2, options: ['Wundt', 'Freud', 'James', 'Fechner'], correctIndices: [0] };
const brokenMc = { id: 'q2', type: 'mc', question: 'Was ist Apperzeption?', solution: 'Aktive Wahrnehmung mit Aufmerksamkeit', points: 2, tfCorrect: false };
const open = { id: 'q3', type: 'open', question: 'Erkläre Perzeption.', solution: 'Passive Wahrnehmung', points: 4 };

describe('generateFullExam — Reparatur von MC-Aufgaben ohne Optionen', () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it('ohne kaputte MC-Aufgabe kein zweiter Aufruf', async () => {
    (global.fetch as any).mockResolvedValueOnce(respond([okMc, open]));
    const out = await generateFullExam({ text: 'Material' }, undefined, { count: 2, difficulty: 'mittel' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(2);
  });

  it('ergänzt nur die kaputte Aufgabe, der Rest bleibt unverändert', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(respond([okMc, brokenMc, open]))
      .mockResolvedValueOnce(respond([{ id: 'q2', options: ['Aktive Wahrnehmung', 'Passive Wahrnehmung', 'Reflex', 'Traum'], correctIndices: [0] }]));
    const out = await generateFullExam({ text: 'Material' }, undefined, { count: 3, difficulty: 'mittel' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const repairPrompt = JSON.parse((global.fetch as any).mock.calls[1][1].body).parts[0].text as string;
    expect(repairPrompt).toContain('Was ist Apperzeption?');
    expect(repairPrompt).not.toContain('Wer gründete 1879');
    expect(out[0]).toEqual(okMc);
    expect(out[1].options).toEqual(['Aktive Wahrnehmung', 'Passive Wahrnehmung', 'Reflex', 'Traum']);
    expect(out[1].correctIndices).toEqual([0]);
    expect(out[2]).toEqual(open);
  });

  it('MC mit Optionen, aber ohne correctIndices: Optionen bleiben wörtlich, nur die Indizes kommen dazu', async () => {
    const noIdx = { id: 'q4', type: 'mc', question: 'Was misst das EEG?', solution: 'Elektrische Hirnaktivität', points: 2, options: ['Hirnaktivität', 'Puls', 'Muskeln', 'Augen'] };
    (global.fetch as any)
      .mockResolvedValueOnce(respond([noIdx]))
      .mockResolvedValueOnce(respond([{ id: 'q4', options: ['anders', 'b', 'c', 'd'], correctIndices: [0] }]));
    const out = await generateFullExam({ text: 'Material' }, undefined, { count: 1, difficulty: 'mittel' });
    const repairPrompt = JSON.parse((global.fetch as any).mock.calls[1][1].body).parts[0].text as string;
    expect(repairPrompt).toContain('Hirnaktivität');
    expect(out[0].options).toEqual(['Hirnaktivität', 'Puls', 'Muskeln', 'Augen']);
    expect(out[0].correctIndices).toEqual([0]);
  });

  it('liefert die Reparatur Platzhalter-Optionen, bleibt die Aufgabe unrepariert', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(respond([brokenMc]))
      .mockResolvedValueOnce(respond([{ id: 'q2', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctIndices: [0] }]));
    const out = await generateFullExam({ text: 'Material' }, undefined, { count: 1, difficulty: 'mittel' });
    expect(out).toEqual([brokenMc]);
  });

  it('scheitert die Reparatur, kommt die ursprüngliche Liste zurück', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(respond([okMc, brokenMc]))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'kaputt' }) });
    const out = await generateFullExam({ text: 'Material' }, undefined, { count: 2, difficulty: 'mittel' });
    expect(out).toEqual([okMc, brokenMc]);
  });
});
