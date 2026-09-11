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

const mc = (question: string) => ({
  question, questionType: 'mc', options: ['a', 'b', 'c', 'd'], correctAnswerIndices: [0],
  explanation: 'e', sourceReference: 's', topic: 'T',
});

const respond = (payload: unknown) => ({ ok: true, json: async () => ({ text: JSON.stringify(payload) }) });
const promptOf = (call: number): string =>
  JSON.parse((global.fetch as any).mock.calls[call][1].body).parts.map((p: any) => p.text ?? '').join('\n');

describe('generateQuizFromDocument — Nachlieferung bei zu wenigen Fragen', () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it('fordert die fehlenden Fragen nach, ohne Themen-Sperre und ohne Duplikate', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(respond([mc('Frage 1?'), mc('Frage 2?'), mc('Frage 3?')]))
      .mockResolvedValueOnce(respond([mc('frage 1?'), mc('Frage 4?'), mc('Frage 5?')]));

    const result = await generateQuizFromDocument({ text: 'Material' }, QuizType.CUSTOM, { customCount: 5, excludeTopics: ['Altes Thema'] });

    expect(result.map(q => q.question)).toEqual(['Frage 1?', 'Frage 2?', 'Frage 3?', 'Frage 4?', 'Frage 5?']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(promptOf(0)).toContain('BEREITS ABGEFRAGT');
    expect(promptOf(1)).toContain('NACHLIEFERUNG: Dieses Quiz braucht noch 2 weitere Frage(n)');
    expect(promptOf(1)).toContain('- Frage 1?');
    expect(promptOf(1)).not.toContain('BEREITS ABGEFRAGT');
  });

  it('macht keinen Zusatz-Call, wenn die Anzahl schon stimmt', async () => {
    (global.fetch as any).mockResolvedValueOnce(respond([1, 2, 3, 4, 5].map(i => mc(`F${i}?`))));
    const result = await generateQuizFromDocument({ text: 'Material' }, QuizType.CUSTOM, { customCount: 5 });
    expect(result).toHaveLength(5);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('liefert das Teil-Quiz, wenn die Nachlieferung scheitert', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(respond([mc('Frage 1?'), mc('Frage 2?')]))
      .mockRejectedValueOnce(new Error('offline'));
    const result = await generateQuizFromDocument({ text: 'Material' }, QuizType.CUSTOM, { customCount: 5 });
    expect(result.map(q => q.question)).toEqual(['Frage 1?', 'Frage 2?']);
  });
});
