// @vitest-environment node
// Live-Funktionstest gegen Produktion (nach Deploy): echte Anmeldung (E2E_TOKEN), echtes Backend
// (VITE_BACKEND_URL), echte App-Funktionen inkl. Reparatur/Normalisierung. Nur mit BENCHMARK_E2E=1.
import { describe, it, vi, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../services/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: process.env.E2E_TOKEN } } }) } },
}));

import { generateQuizFromDocument, generateFullExam, evaluateRecallResponse } from '../../services/geminiService';
import { normalizeExamQuestions } from '../../services/examNormalize';
import { setLocale } from '../../i18n';
import { QuizType } from '../../types';

const run = process.env.BENCHMARK_E2E === '1' && process.env.E2E_TOKEN ? describe : describe.skip;
const skript = readFileSync(join(__dirname, '..', 'datasets', 'sources', 'Geschichte_Skript.md'), 'utf8');
const kapitel = (n: number) => { const a = skript.indexOf(`## ${n}.`); return skript.slice(a, skript.indexOf(`## ${n + 1}.`, a)); };

run('Live gegen Produktion', () => {
  setLocale('de');

  it('Quiz: alle Fragen spielbar', async () => {
    const t0 = Date.now();
    const qs = await generateQuizFromDocument({ text: kapitel(5) + kapitel(6) }, QuizType.CUSTOM, { customCount: 10, questionType: 'mixed' });
    const mcLike = qs.filter(q => ['mc', 'single', 'scenario', 'truefalse', undefined].includes(q.questionType as any));
    const kaputt = mcLike.filter(q => q.options.length < 2 || q.correctAnswerIndices.length === 0);
    const cloze = qs.filter(q => q.questionType === 'cloze');
    console.log(`Quiz: ${qs.length}/10 Fragen in ${((Date.now() - t0) / 1000).toFixed(1)} s | Typen ${JSON.stringify(qs.reduce((a: any, q) => ({ ...a, [q.questionType ?? 'mc']: (a[q.questionType ?? 'mc'] ?? 0) + 1 }), {}))} | MC kaputt ${kaputt.length} | Lückentexte ohne Lücke ${cloze.filter(q => !q.clozeText?.includes('__LÜCKE__')).length}`);
    expect(qs.length).toBeGreaterThanOrEqual(8);
    expect(kaputt).toHaveLength(0);
  }, 180_000);

  it('Klausur: MC-Aufgaben kommen vollständig an', async () => {
    const t0 = Date.now();
    const raw = await generateFullExam({ text: kapitel(12) + kapitel(13) }, undefined, { count: 10, difficulty: 'mittel' });
    const exam = normalizeExamQuestions(raw);
    const mcRoh = raw.filter((q: any) => q?.type === 'mc').length;
    const mc = exam.filter(q => q.type === 'mc');
    console.log(`Klausur: ${exam.length}/10 brauchbar in ${((Date.now() - t0) / 1000).toFixed(1)} s | MC ${mc.length} von ${mcRoh} geliefert | Typen ${JSON.stringify(exam.reduce((a: any, q) => ({ ...a, [q.type]: (a[q.type] ?? 0) + 1 }), {}))}`);
    for (const q of mc.slice(0, 2)) console.log(`  MC: ${q.question.slice(0, 90)} → richtig: ${q.correctIndices!.map(i => q.options![i]).join(' | ').slice(0, 90)}`);
    expect(mc.length).toBe(mcRoh);
    expect(exam.length).toBeGreaterThanOrEqual(8);
  }, 240_000);

  it('Feynman-Bewertung: erkennt eingebaute Fehler', async () => {
    const t0 = Date.now();
    const ev = await evaluateRecallResponse(
      { question: 'Erkläre die 4-Säfte-Lehre.', expectedKeywords: ['Blut', 'Schleim', 'gelbe Galle', 'schwarze Galle', 'Temperament'], conceptContext: 'Humoralpathologie', topic: '4-Säfte-Lehre' },
      'Die 4-Säfte-Lehre kommt von Platon. Wer zu viel schwarze Galle hat, ist cholerisch. Viel Blut macht sanguinisch, viel Schleim phlegmatisch.',
      { text: kapitel(5) }, 'peer');
    const text = [ev.feedback, ...(ev.missingPoints ?? [])].join(' ');
    console.log(`Feynman: Punkte ${ev.score} in ${((Date.now() - t0) / 1000).toFixed(1)} s | Hippokrates/Galen erwähnt: ${/Hippokrates|Galen/.test(text)} | melancholisch erwähnt: ${/melanchol/i.test(text)}`);
    expect(ev.score).toBeLessThan(70);
  }, 120_000);
});
