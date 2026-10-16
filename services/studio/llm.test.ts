import { describe, it, expect } from 'vitest';
import { detectRunaway, guardedLlm, StudioLlmError, type StudioLlmRequest, type StudioTransport } from './llm';

const req: StudioLlmRequest = { step: 'write', prompt: 'p', schema: {}, heavy: true };

/** Transport, der eine Antwort in Stücken liefert und beim Abbruch aufhört (wie fetch mit AbortSignal). */
const streaming = (answers: { chunks: string[]; finish?: string }[]) => {
  const calls: { aborted: boolean; sent: number }[] = [];
  const transport: StudioTransport = async (_req, onText, signal) => {
    const a = answers[Math.min(calls.length, answers.length - 1)];
    const call = { aborted: false, sent: 0 };
    calls.push(call);
    let full = '';
    for (const c of a.chunks) {
      if (signal.aborted) { call.aborted = true; throw new DOMException('aborted', 'AbortError'); }
      full += c;
      call.sent += 1;
      onText(full);
    }
    if (signal.aborted) { call.aborted = true; throw new DOMException('aborted', 'AbortError'); }
    return { text: full, finish: a.finish };
  };
  return { transport, calls };
};

describe('detectRunaway (Kostenbremse)', () => {
  it('erkennt die Schleifen aus dem Testlauf vom 16.10.', () => {
    expect(detectRunaway('{"blocks":[{"type":"study","study":{"authors":"Moray","year":"195959')).toMatch(/Jahr/);
    expect(detectRunaway('{"year": 1959591959')).toMatch(/Jahr/);
    expect(detectRunaway(`{"text":"x","n":${'0102'.repeat(6)}`)).toMatch(/Ziffernfolge/);
    expect(detectRunaway(`{"text":"${'Vier-Säfte-Lehre. '.repeat(90)}`)).toMatch(/Textfeld/);
  });
  it('lässt normale Antworten durch', () => {
    const ok = JSON.stringify({ blocks: [{ type: 'study', study: { authors: 'Simons & Chabris', year: '1999', result: '58 % vs. 27 %', units: ['u12'] } }] });
    expect(detectRunaway(ok)).toBeNull();
    expect(detectRunaway('{"year": "19')).toBeNull();
    expect(detectRunaway(`{"text":"${'a'.repeat(1400)}","units":["u1"]}`)).toBeNull();
  });
});

describe('guardedLlm', () => {
  it('bricht eine Schleife sofort ab und versucht es direkt neu', async () => {
    const { transport, calls } = streaming([
      { chunks: ['{"blocks":[{"type":"study","study":{"authors":"Moray","year":"1959', '5919', '5959', '1959', 'rest', 'rest'] },
      { chunks: ['{"blocks":[]}'] },
    ]);
    const events: string[] = [];
    const llm = guardedLlm(transport, { onEvent: e => events.push(`${e.kind}:${e.attempt}`) });
    expect(await llm(req)).toEqual({ blocks: [] });
    expect(calls[0].aborted).toBe(true);
    // Abgebrochen nach dem Stück, das die Grenze reißt; der Rest wurde nicht mehr abgeholt.
    expect(calls[0].sent).toBe(2);
    expect(events).toEqual(['loop:1']);
  });
  it('wiederholt bei Token-Limit und ungültigem JSON, gibt nach 2 Versuchen auf', async () => {
    const { transport, calls } = streaming([
      { chunks: ['{"blocks":[{"type":"para'], finish: 'MAX_TOKENS' },
      { chunks: ['{"blocks":['], finish: 'STOP' },
    ]);
    const llm = guardedLlm(transport);
    const err = await llm(req).catch(e => e);
    expect(err).toBeInstanceOf(StudioLlmError);
    expect((err as StudioLlmError).events.map(e => e.kind)).toEqual(['max_tokens', 'bad_json']);
    expect(calls).toHaveLength(2);
  });
  it('Netzfehler ohne Schleife werden weitergereicht (kein stiller zweiter Aufruf)', async () => {
    const transport: StudioTransport = async () => { throw new Error('LIMIT_REACHED'); };
    await expect(guardedLlm(transport)(req)).rejects.toThrow('LIMIT_REACHED');
  });
});
