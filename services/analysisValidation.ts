import type { ErrorPattern, LearningAnalysis, RecommendedActionType } from '../types';

/** Deterministisches Mapping: die Ursachen-Klassifikation der KI entscheidet über
 *  ein festes Regelwerk die Handlungsempfehlung — nicht die freie Modellwahl.
 *  Verhindert das beobachtete Problem, dass die KI-Empfehlung nie zum Routing
 *  passte (die App kennt nur 4 feste Aktionen, das Modell erfand eigene Begriffe). */
export const RECOMMENDED_ACTION_BY_CAUSE: Record<ErrorPattern['causeType'], RecommendedActionType> = {
  concept: 'kurze Erklärung',
  application: '3 gezielte Übungsfragen',
  recall: 'Erstellung von Karteikarten',
  structure: 'Start einer geführten Study-Session',
};

/** Einzige Quelle der vier gültigen Aktions-Strings — auch fürs Gemini-Schema-Enum verwendet. */
export const ACTION_TYPES: RecommendedActionType[] = Object.values(RECOMMENDED_ACTION_BY_CAUSE);

/** Unter dieser Gesamtfehlerzahl wird jede "Muster"-Erkennung zum Overfitting auf Rauschen. */
export const MIN_TOTAL_ERRORS_FOR_PATTERNS = 5;
/** Ein Muster braucht mindestens diese Anzahl Belege … */
const MIN_OCCURRENCES = 2;
/** … aus mindestens dieser Anzahl verschiedener Sessions (sonst zählt eine einzelne
 *  Session mit zwei ähnlichen Fragen schon als "Muster"). */
const MIN_SESSIONS = 2;

export interface RawErrorPattern {
  pattern: string;
  description: string;
  concepts: string[];
  probableCause: string;
  causeType: string;
  sourceErrorIds: string[];
  recommendedAction: { type: string; reasoning: string };
}

export interface RawLearningAnalysis {
  overallHealth: string;
  overallHealthErrorIds: string[];
  errorPatterns: RawErrorPattern[];
}

const isCauseType = (v: string): v is ErrorPattern['causeType'] =>
  v === 'concept' || v === 'application' || v === 'recall' || v === 'structure';

const isActionType = (v: string): v is RecommendedActionType =>
  (ACTION_TYPES as string[]).includes(v);

/**
 * Härtet die rohe KI-Antwort gegen drei Fehlerklassen ab, die reines
 * Prompt-Wording nicht zuverlässig verhindert:
 *  1. Erfundene/übernommene Fehlerzahlen — count wird NIE vom Modell übernommen,
 *     sondern aus der Länge der (gegen echte IDs geprüften) Belegliste berechnet.
 *  2. Muster aus zu wenig/zu einseitiger Evidenz — Mindestschwelle ≥2 Belege aus ≥2 Sessions.
 *  3. Freie Handlungsempfehlung — das Ursache→Aktion-Mapping entscheidet, die
 *     Modellwahl bleibt nur als secondaryType sichtbar, falls sie abweicht.
 */
export function validateLearningAnalysis(
  raw: RawLearningAnalysis,
  realErrorIds: ReadonlySet<string>,
  sessionIdByErrorId: ReadonlyMap<string, string>,
): LearningAnalysis {
  const errorPatterns: ErrorPattern[] = raw.errorPatterns
    .map((p): ErrorPattern | null => {
      const belegteIds = [...new Set(p.sourceErrorIds)].filter(id => realErrorIds.has(id));
      const sessionCount = new Set(belegteIds.map(id => sessionIdByErrorId.get(id)).filter(Boolean)).size;
      if (belegteIds.length < MIN_OCCURRENCES || sessionCount < MIN_SESSIONS) return null;

      const causeType = isCauseType(p.causeType) ? p.causeType : 'concept';
      const mappedType = RECOMMENDED_ACTION_BY_CAUSE[causeType];
      const modelType = isActionType(p.recommendedAction?.type) ? p.recommendedAction.type : undefined;

      return {
        pattern: p.pattern,
        description: p.description,
        count: belegteIds.length,
        concepts: p.concepts ?? [],
        probableCause: p.probableCause,
        causeType,
        sourceErrorIds: belegteIds,
        recommendedAction: {
          type: mappedType,
          secondaryType: modelType && modelType !== mappedType ? modelType : undefined,
          reasoning: p.recommendedAction?.reasoning ?? '',
        },
      };
    })
    .filter((p): p is ErrorPattern => p !== null);

  const overallHealthErrorIds = (raw.overallHealthErrorIds ?? []).filter(id => realErrorIds.has(id));
  const overallHealth = overallHealthErrorIds.length > 0 || realErrorIds.size === 0
    ? raw.overallHealth
    : 'Noch nicht genug belastbare Daten für eine Einschätzung des Lernverhaltens.';

  return { overallHealth, errorPatterns };
}

export const EMPTY_ANALYSIS: LearningAnalysis = {
  overallHealth: 'Noch zu wenige falsch beantwortete Fragen für eine Fehleranalyse — lerne weiter, dann wird sie aussagekräftig.',
  errorPatterns: [],
};
