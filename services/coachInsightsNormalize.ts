import type { CoachInsights } from '../types';

/**
 * Normalisierung der KI-Coach-Synthese (generateCoachInsights in geminiService.ts).
 *
 * Gemini lässt trotz responseSchema gelegentlich Felder weg oder liefert falsche
 * Typen — derselbe Effekt, der bei der Quiz-Generierung schon einmal zu Abstürzen
 * geführt hat (siehe quizNormalize.ts). Ohne Absicherung crasht LearningCoach.tsx
 * beim Rendern (z.B. insights.synthesis.map auf undefined) — das passiert
 * außerhalb des try/catch in handleRunCoach (React-Renderfehler nach einem
 * State-Update werden davon nicht abgefangen) und landet ungebremst in der
 * globalen ErrorBoundary. Diese Funktion füllt fehlende/falsch typisierte Felder
 * mit sicheren Leerwerten auf, BEVOR das Ergebnis in den State geschrieben wird.
 */

const VALID_TABS: CoachInsights['recommendations'][number]['tab'][] = ['QUIZ', 'CARDS', 'RECALL', 'EXAM', 'EXPLAINER'];
const VALID_PRIORITIES: CoachInsights['recommendations'][number]['priority'][] = ['hoch', 'mittel', 'niedrig'];

export const normalizeCoachInsights = (raw: unknown): CoachInsights => {
  const r = (raw && typeof raw === 'object') ? raw as Record<string, any> : {};

  const synthesis = Array.isArray(r.synthesis)
    ? r.synthesis.filter((s: any) => typeof s === 'string')
    : [];

  const connections = Array.isArray(r.connections)
    ? r.connections
        .filter((c: any) => c && typeof c.a === 'string' && typeof c.b === 'string' && typeof c.reasoning === 'string')
        .map((c: any) => ({ a: c.a, b: c.b, reasoning: c.reasoning }))
    : [];

  const rawPrognosis = (r.prognosis && typeof r.prognosis === 'object') ? r.prognosis : {};
  const prognosis: CoachInsights['prognosis'] = {
    grade: typeof rawPrognosis.grade === 'string' ? rawPrognosis.grade : '—',
    passProbability: typeof rawPrognosis.passProbability === 'number' ? rawPrognosis.passProbability : 0,
    reasoning: typeof rawPrognosis.reasoning === 'string' ? rawPrognosis.reasoning : '',
  };

  const forwardPrediction = typeof r.forwardPrediction === 'string' ? r.forwardPrediction : '';
  const methodInsight = typeof r.methodInsight === 'string' ? r.methodInsight : '';

  const recommendations = Array.isArray(r.recommendations)
    ? r.recommendations
        .filter((rec: any) =>
          rec && typeof rec.action === 'string' && typeof rec.reasoning === 'string' &&
          VALID_TABS.includes(rec.tab) && VALID_PRIORITIES.includes(rec.priority)
        )
        .slice(0, 3)
        .map((rec: any) => ({ action: rec.action, tab: rec.tab, reasoning: rec.reasoning, priority: rec.priority }))
    : [];

  return { synthesis, connections, prognosis, forwardPrediction, methodInsight, recommendations };
};

/** Parst KI-JSON robust und normalisiert es zu einem sicheren CoachInsights-Objekt. */
export const parseCoachInsights = (text: string): CoachInsights => {
  let raw: unknown;
  try { raw = JSON.parse(text || '{}'); }
  catch { raw = {}; }
  return normalizeCoachInsights(raw);
};
