import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'fake-token' } } }),
    },
  },
}));

import { chatWithTutor } from './geminiService';

/** Antwort mit Stream-Body, dessen Stücke absichtlich mitten in NDJSON-Zeilen enden. */
const streamResponse = (pieces: string[]) => {
  const encoder = new TextEncoder();
  const queue = [...pieces];
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => (queue.length ? { value: encoder.encode(queue.shift()!), done: false } : { value: undefined, done: true }),
      }),
    },
  };
};

const options = { mode: 'explain' as const, useExternalKnowledge: true, includeSourceQuote: false };

describe('chatWithTutor — Streaming', () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it('setzt NDJSON-Stücke zusammen und meldet jeden Zwischenstand', async () => {
    (global.fetch as any).mockResolvedValueOnce(streamResponse([
      '{"t":"Hal', 'lo"}\n{"t":" Welt"}\n', '{"done":true}\n',
    ]));
    const partials: string[] = [];
    const result = await chatWithTutor(null, [], 'Hi', options, p => partials.push(p));

    expect(result).toBe('Hallo Welt');
    expect(partials).toEqual(['Hallo', 'Hallo Welt']);
    expect((global.fetch as any).mock.calls[0][0]).toMatch(/\/api\/gemini\/stream$/);
  });

  it('fällt auf den normalen Aufruf zurück, wenn das Backend die Stream-Route nicht kennt', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 404, body: null, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ text: 'Ohne Stream' }) });
    const result = await chatWithTutor(null, [], 'Hi', options, () => {});

    expect(result).toBe('Ohne Stream');
    expect((global.fetch as any).mock.calls[1][0]).toMatch(/\/api\/gemini\/generate$/);
  });

  it('wirft den Fehler, den das Backend mitten im Stream meldet', async () => {
    (global.fetch as any).mockResolvedValueOnce(streamResponse(['{"t":"Teil"}\n{"error":"timeout: zu lange"}\n']));
    await expect(chatWithTutor(null, [], 'Hi', options, () => {})).rejects.toThrow('timeout: zu lange');
  });

  it('nutzt ohne onPartial weiter den normalen Aufruf', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ text: 'Normal' }) });
    await expect(chatWithTutor(null, [], 'Hi', options)).resolves.toBe('Normal');
    expect((global.fetch as any).mock.calls[0][0]).toMatch(/\/api\/gemini\/generate$/);
  });
});
