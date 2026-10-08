import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'fake-token' } } }),
    },
  },
}));

import { generateQuizFromDocument } from './geminiService';
import { QuizType } from '../types';

const respond = (payload: unknown) => ({ ok: true, json: async () => ({ text: JSON.stringify(payload) }) });
const ok = { question: 'Wer gründete 1879 das Labor?', questionType: 'mc', options: ['Wundt', 'Freud', 'James', 'Fechner'], correctAnswerIndices: [0], explanation: 'Wundt', sourceReference: 'x' };
const noIdx = { question: 'Was misst das EEG?', questionType: 'single-choice', options: ['Hirnaktivität', 'Puls', 'Muskeltonus', 'Augenbewegung'], explanation: 'Elektrische Hirnaktivität', sourceReference: 'x' };

describe('generateQuizFromDocument — Reparatur unvollständiger MC-Fragen', () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it('ohne kaputte Frage kein Reparatur-Aufruf', async () => {
    (global.fetch as any).mockResolvedValueOnce(respond([ok]));
    const out = await generateQuizFromDocument({ text: 'Material' }, QuizType.CUSTOM, { customCount: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
  });

  it('ergänzt die richtige Antwort, Optionen bleiben wörtlich', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(respond([ok, noIdx]))
      .mockResolvedValueOnce(respond([{ id: 'r1', options: ['anders', 'b', 'c', 'd'], correctAnswerIndices: [0] }]));
    const out = await generateQuizFromDocument({ text: 'Material' }, QuizType.CUSTOM, { customCount: 2 });
    expect(out).toHaveLength(2);
    const fixed = out.find(q => q.question === 'Was misst das EEG?')!;
    expect(fixed.options).toEqual(['Hirnaktivität', 'Puls', 'Muskeltonus', 'Augenbewegung']);
    expect(fixed.correctAnswerIndices).toEqual([0]);
    expect(fixed.questionType).toBe('mc');
    expect(fixed.isMultipleChoice).toBe(false);
  });

  it('scheitert die Reparatur, fliegt nur die kaputte Frage raus', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(respond([ok, noIdx]))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'kaputt' }) })
      .mockResolvedValue(respond([]));
    const out = await generateQuizFromDocument({ text: 'Material' }, QuizType.CUSTOM, { customCount: 2 });
    expect(out.map(q => q.question)).toEqual(['Wer gründete 1879 das Labor?']);
  });
});
