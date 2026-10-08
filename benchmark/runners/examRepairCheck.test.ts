// @vitest-environment node
// Nachweis für den Klausur-Fix (08.10.2026): echte Gemini-Klausuren aus einem Benchmark-Lauf
// durch normalizeExamQuestions + Reparatur-Aufruf schicken. Der Reparatur-Aufruf geht LIVE an
// Gemini Flash-Lite (wie im Backend für complexity 'light'). Nur mit BENCHMARK_LIVE=1 und BENCHMARK_RUN.
import { describe, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleGenAI } from '@google/genai';

vi.mock('../../services/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'x' } } }) } },
}));

import { generateFullExam } from '../../services/geminiService';
import { normalizeExamQuestions, mcNeedsRepair } from '../../services/examNormalize';
import { setLocale } from '../../i18n';

const run = process.env.BENCHMARK_LIVE === '1' && process.env.BENCHMARK_RUN ? describe : describe.skip;

run('Klausur-Fix gegen echte Benchmark-Ausgaben', () => {
  it('zählt brauchbare MC-Aufgaben vorher/nachher', async () => {
    setLocale('de');
    const env = readFileSync(join(__dirname, '../../backend/.env'), 'utf8');
    const ai = new GoogleGenAI({ apiKey: env.match(/^GEMINI_API_KEY=(.*)$/m)![1].replace(/["']/g, '').trim() });
    const dir = join(__dirname, '..', 'results', process.env.BENCHMARK_RUN!);
    const raw = readFileSync(join(dir, 'raw.jsonl'), 'utf8').split('\n')
      .filter(l => l.includes('"feature":"klausur"') && l.includes('"repeat":1,') && l.includes('"modelId":"gemini'))
      .map(l => JSON.parse(l)).filter((r: any) => r.status === 'ok').slice(0, Number(process.env.LIMIT ?? 1e9));

    const realFetch = globalThis.fetch;
    const rows: any[] = [];
    for (const r of raw) {
      let parsed: any[];
      try { parsed = JSON.parse(r.text); } catch { continue; }
      if (!Array.isArray(parsed)) continue;
      const mcBefore = normalizeExamQuestions(parsed).filter(q => q.type === 'mc').length;
      const mcTotal = parsed.filter(q => q?.type === 'mc').length;
      const needRepair = parsed.filter(mcNeedsRepair).length;
      let repairCalls = 0;
      global.fetch = vi.fn(async (u: any, init: any) => {
        // Nur App-Aufrufe ans Backend abfangen; das Gemini-SDK selbst nutzt ebenfalls fetch.
        if (!String(u).includes('/api/gemini/')) return realFetch(u, init);
        const body = JSON.parse(init.body);
        if (repairCalls++ === 0) return { ok: true, json: async () => ({ text: r.text }) } as any;
        const res = await ai.models.generateContent({
          model: 'gemini-3.5-flash-lite',
          contents: [{ role: 'user', parts: body.parts }],
          config: { temperature: body.config?.temperature, responseMimeType: body.config?.responseMimeType, responseSchema: body.config?.responseSchema, maxOutputTokens: 16384 },
        });
        return { ok: true, json: async () => ({ text: res.text ?? '' }) } as any;
      }) as any;
      const after = normalizeExamQuestions(await generateFullExam({ text: 'Material' }, undefined, { count: parsed.length, difficulty: 'mittel' }));
      const mcAfter = after.filter(q => q.type === 'mc');
      rows.push({ caseId: r.caseId, model: r.modelId, mcTotal, mcBefore, needRepair, mcAfter: mcAfter.length, repaired: mcAfter.filter(q => parsed.some((p: any) => p.id === q.id && mcNeedsRepair(p))).map(q => ({ question: q.question, solution: q.solution, options: q.options, correct: q.correctIndices })) });
    }
    writeFileSync(join(dir, 'exam_repair_check.json'), JSON.stringify(rows, null, 2));
    for (const model of [...new Set(rows.map(x => x.model))]) {
      const m = rows.filter(x => x.model === model);
      const s = (k: string) => m.reduce((a, x) => a + x[k], 0);
      console.log(`${model}: MC gesamt ${s('mcTotal')}, brauchbar vorher ${s('mcBefore')}, nachher ${s('mcAfter')} (Reparatur-Aufrufe für ${s('needRepair')} Aufgaben)`);
    }
  }, 900_000);
});
