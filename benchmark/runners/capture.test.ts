// Baut für jeden Testfall die Anfrage, die die App wirklich verschickt: ruft die echte
// Funktion aus services/geminiService.ts auf und fängt den Request an /api/gemini ab.
// Kein Modellaufruf, keine Änderung am App-Code. Läuft nur mit BENCHMARK_CAPTURE=1
// (npm run benchmark:capture), sonst übersprungen.
import { describe, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../services/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'x' } } }) } },
}));

import {
  generateQuizFromDocument, generateFlashcardsFromDocument, chatWithTutor, generateRecallChallenge,
  evaluateRecallResponse, generateFullExam, evaluateWithRubric, evaluateStepByStep,
  generateGroundedExplanation, generateStudioOutput, evaluateSelfCheck,
} from '../../services/geminiService';
import { buildStudioPrompt } from '../../services/subjectStudio';
import { setLocale } from '../../i18n';
import { QuizType } from '../../types';
import { DATASET_VERSION } from '../benchmark.config.ts';
import { resolveSource } from '../sources.ts';
import type { Feature, TestCase } from '../features.ts';

const run = process.env.BENCHMARK_CAPTURE === '1' ? describe : describe.skip;
const DIR = join(__dirname, '..', 'datasets', DATASET_VERSION);

const callFeature = async (c: TestCase, sourceText: string): Promise<unknown> => {
  const source = { text: sourceText };
  const i = c.input;
  switch (c.feature as Feature) {
    case 'quiz':
      return generateQuizFromDocument(source, QuizType.CUSTOM, { customCount: i.count, questionType: i.questionType ?? 'mixed', customFocus: i.focus });
    case 'karten':
      return generateFlashcardsFromDocument(source, i.count);
    case 'tutor':
      return chatWithTutor(source, i.history ?? [], i.message, {
        mode: i.mode ?? 'explain', useExternalKnowledge: false, includeSourceQuote: true,
      });
    case 'feynman_frage':
      return generateRecallChallenge(source, i.focusTopic);
    case 'feynman_bewertung':
      return evaluateRecallResponse(i.challenge, i.answer, source, i.audience ?? 'peer');
    case 'klausur':
      return generateFullExam(source, undefined, { count: i.count, difficulty: i.difficulty ?? 'mittel', types: i.types });
    case 'korrektur':
      return evaluateWithRubric(i.questions, i.scoringProfile ?? { mode: 'standard', emphases: ['understanding'] });
    case 'rechenweg':
      return evaluateStepByStep(i.questions);
    case 'leser':
      return generateGroundedExplanation(source, i.concept, i.context);
    case 'studio':
      return generateStudioOutput(buildStudioPrompt(i.format, i.subjectName, [
        { n: 1, docId: 'd1', name: i.sourceName ?? 'Skript', text: sourceText, paged: false, truncated: false } as any,
      ], i.focus));
    case 'selbsttest':
      return evaluateSelfCheck(i.question, i.reference, sourceText, i.userAnswer);
  }
};

run('Benchmark: App-Anfragen aufzeichnen', () => {
  it('zeichnet alle Testfälle auf', async () => {
    setLocale('de');
    const files = readdirSync(join(DIR, 'cases')).filter(f => f.endsWith('.json')).sort();
    const lines: string[] = [];
    const errors: string[] = [];
    for (const f of files) {
      const cases: TestCase[] = JSON.parse(readFileSync(join(DIR, 'cases', f), 'utf8'));
      for (const c of cases) {
        let captured: unknown = null;
        global.fetch = vi.fn(async (_url: any, init: any) => {
          captured ??= JSON.parse(init.body);
          // Leere Antwort: die Funktion bricht danach ab oder liefert leer, egal.
          return { ok: true, status: 200, json: async () => ({ text: '[]' }) } as any;
        }) as any;
        try { await callFeature(c, resolveSource(c.source)); } catch { /* erwartet */ }
        if (!captured) { errors.push(c.id); continue; }
        lines.push(JSON.stringify({ caseId: c.id, feature: c.feature, request: captured }));
      }
    }
    writeFileSync(join(DIR, 'requests.jsonl'), lines.join('\n') + '\n');
    console.log(`${lines.length} Anfragen aufgezeichnet nach ${DIR}/requests.jsonl`);
    if (errors.length) throw new Error(`Keine Anfrage für: ${errors.join(', ')}`);
    if (!existsSync(join(DIR, 'requests.jsonl'))) throw new Error('nichts geschrieben');
  }, 120_000);
});
