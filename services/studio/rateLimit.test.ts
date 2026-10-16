import { describe, it, expect, vi } from 'vitest';

/**
 * App-Test 16.10.2026: Der erste Lauf schickt mehr als 30 KI-Anfragen in der
 * ersten Minute, das Backend antwortet mit 429 (Minutengrenze). Die Pipeline
 * wartet dann und versucht es neu, statt mit "Tageslimit erreicht" abzubrechen.
 */
const calls: number[] = [];
vi.mock('../geminiService', () => {
  class RateLimitedError extends Error { constructor(public retryAfterMs: number) { super('RATE_LIMITED'); } }
  return {
    RateLimitedError,
    streamStudioStep: vi.fn(async () => {
      calls.push(Date.now());
      if (calls.length < 3) throw new RateLimitedError(10);
      return { text: '{"ok":true}', finish: 'STOP' };
    }),
  };
});

describe('Minutengrenze des Servers', () => {
  it('wartet und versucht es neu', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { makeAppStudioLlm } = await import('./runSummary');
    const llm = makeAppStudioLlm();
    expect(await llm({ step: 'extract', prompt: 'p', schema: {}, heavy: false })).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
  });
});
