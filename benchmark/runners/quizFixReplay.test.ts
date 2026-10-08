// @vitest-environment node
// Nachweis Quiz-Fix (08.10.2026): echte Quiz-Ausgaben eines Benchmark-Laufs (Runde 1) durch den
// App-Ablauf schicken (Reparatur-Aufruf LIVE an Flash-Lite + normalizeQuizQuestions), so wie es beim
// Nutzer ankommt. Ergebnis als neuer Lauf <run>_quizfix, damit Prüfer und Bericht ihn bewerten können.
// Nur mit BENCHMARK_LIVE=1 und BENCHMARK_RUN.
import { describe, it, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleGenAI } from '@google/genai';

vi.mock('../../services/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'x' } } }) } },
}));

import { generateQuizFromDocument } from '../../services/geminiService';
import { setLocale } from '../../i18n';
import { QuizType } from '../../types';

const run = process.env.BENCHMARK_LIVE === '1' && process.env.BENCHMARK_RUN ? describe : describe.skip;
const MODELS = ['gemini-lite', 'claude-haiku-no-thinking'];

run('Quiz-Fix: App-Ablauf auf echte Benchmark-Ausgaben', () => {
  it('erzeugt den Lauf <run>_quizfix', async () => {
    setLocale('de');
    const env = readFileSync(join(__dirname, '../../backend/.env'), 'utf8');
    const ai = new GoogleGenAI({ apiKey: env.match(/^GEMINI_API_KEY=(.*)$/m)![1].replace(/["']/g, '').trim() });
    const src = join(__dirname, '..', 'results', process.env.BENCHMARK_RUN!);
    const out = `${src}_quizfix`;
    mkdirSync(out, { recursive: true });
    const meta = JSON.parse(readFileSync(join(src, 'meta.json'), 'utf8'));
    const cases = Object.fromEntries(JSON.parse(readFileSync(join(__dirname, '..', 'datasets', meta.datasetVersion, 'cases', 'quiz.json'), 'utf8')).map((c: any) => [c.id, c]));
    const raw = readFileSync(join(src, 'raw.jsonl'), 'utf8').split('\n')
      .filter(l => l.includes('"feature":"quiz"') && l.includes('"repeat":1,'))
      .map(l => JSON.parse(l)).filter((r: any) => r.status === 'ok' && MODELS.includes(r.modelId));

    const realFetch = globalThis.fetch;
    const lines: string[] = [];
    let repairCost = 0, repairCalls = 0;
    for (const r of raw) {
      let first = true;
      global.fetch = vi.fn(async (u: any, init: any) => {
        if (!String(u).includes('/api/gemini/')) return realFetch(u, init);
        const body = JSON.parse(init.body);
        const prompt = body.parts.map((p: any) => p.text ?? '').join('\n');
        if (first) { first = false; return { ok: true, json: async () => ({ text: r.text }) } as any; }
        if (prompt.includes('NACHLIEFERUNG')) return { ok: true, json: async () => ({ text: '[]' }) } as any; // keine Nachlieferung: nur die erste Antwort zählt
        repairCalls++;
        const res = await ai.models.generateContent({
          model: 'gemini-3.5-flash-lite',
          contents: [{ role: 'user', parts: body.parts }],
          config: { temperature: body.config?.temperature, responseMimeType: body.config?.responseMimeType, responseSchema: body.config?.responseSchema, maxOutputTokens: 16384 },
        });
        const u2 = res.usageMetadata ?? {};
        repairCost += ((u2.promptTokenCount ?? 0) * 0.30 + ((u2.candidatesTokenCount ?? 0) + (u2.thoughtsTokenCount ?? 0)) * 2.50) / 1e6;
        return { ok: true, json: async () => ({ text: res.text ?? '' }) } as any;
      }) as any;
      const c = cases[r.caseId];
      const qs = await generateQuizFromDocument({ text: 'Material' }, QuizType.CUSTOM, { customCount: c.input.count, questionType: c.input.questionType ?? 'mixed' });
      lines.push(JSON.stringify({ ...r, runId: `${meta.runId}_quizfix`, modelId: `${r.modelId}+app`, text: JSON.stringify(qs) }));
    }
    writeFileSync(join(out, 'raw.jsonl'), lines.join('\n') + '\n');
    writeFileSync(join(out, 'meta.json'), JSON.stringify({ ...meta, runId: `${meta.runId}_quizfix`, models: MODELS.map(id => ({ ...meta.models.find((m: any) => m.id === id), id: `${id}+app` })), run: { ...meta.run, repeat: 1 }, note: 'Runde 1 der Quiz-Ausgaben, durch App-Ablauf (Reparatur + Normalisierung). Latenz/Kosten = Original ohne Reparatur.' }, null, 2));
    console.log(`${lines.length} Quiz → ${out}; Reparatur-Aufrufe ${repairCalls}, Kosten ${(repairCost * 100).toFixed(2)} ct`);
  }, 900_000);
});
