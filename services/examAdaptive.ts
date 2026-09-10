import type { TopicSecurity } from '../types';

export interface TopicWeight {
  topic: string;
  minCount: number;
}

export interface DifficultyMix {
  leicht: number;
  mittel: number;
  schwer: number;
}

/** Soll-Vorgabe einer adaptiven Klausur inkl. der Signale, aus denen sie entstand —
 *  wird bis in ExamResult persistiert, damit Ist-vs-Soll auch später nachvollziehbar ist. */
export interface AdaptiveExamTarget {
  topicWeights: TopicWeight[];
  difficultyMix: DifficultyMix;
  signals: {
    recentAvgScore: number | null;
    daysUntilNextExam: number | null;
    examCount: number;
  };
}

export interface TopicCoverage extends TopicWeight {
  actual: number;
}

export const DIFFICULTY_LEVELS = ['leicht', 'mittel', 'schwer'] as const;

const SEVERITY: Record<TopicSecurity['security'], number> = { kritisch: 2, unsicher: 1, sicher: 0 };

/**
 * Wandelt die Themen-Konfidenz aus dem Lernprofil in verbindliche Mindest-
 * Fragenzahlen für die Klausurgenerierung um (Paket 11, Phase 3A) — analog zum
 * bestehenden EXAM_TYPE_WEIGHTS/EXAM_TYPE_BULLETS-Muster in services/geminiService.ts
 * (Ziel-Stückzahl statt nur weicher Text-Hinweis). Höchstens die Hälfte der
 * Klausur wird auf Schwächen konzentriert, damit das Material selbst weiterhin
 * den Großteil der Fragen bestimmt und die Vorgabe bei wenig Historie nicht die
 * ganze Klausur dominiert.
 */
export function computeTopicWeights(topicMastery: TopicSecurity[], totalCount: number, maxTopics = 5): TopicWeight[] {
  if (totalCount <= 0) return [];
  const budget = Math.floor(totalCount / 2);
  if (budget <= 0) return [];
  const weak = topicMastery
    .filter(t => t.security !== 'sicher')
    .sort((a, b) => (SEVERITY[b.security] - SEVERITY[a.security]) || (a.confidence - b.confidence))
    .slice(0, Math.min(maxTopics, budget));
  if (weak.length === 0) return [];

  const weightOf = (t: TopicSecurity) => SEVERITY[t.security] + 1; // kritisch=3, unsicher=2
  const weightSum = weak.reduce((s, t) => s + weightOf(t), 0);
  const weights = weak.map(t => ({
    topic: t.topic,
    minCount: Math.max(1, Math.floor(budget * (weightOf(t) / weightSum))),
  }));
  // Rundungsrest den schwersten Themen zuschlagen, aber nie über das Budget hinaus
  let rest = budget - weights.reduce((s, w) => s + w.minCount, 0);
  for (let i = 0; rest > 0 && i < weights.length; i++, rest--) weights[i].minCount += 1;
  return weights;
}

const BASE_MIX: Record<'leicht' | 'mittel' | 'schwer', DifficultyMix> = {
  leicht: { leicht: 60, mittel: 30, schwer: 10 },
  mittel: { leicht: 25, mittel: 50, schwer: 25 },
  schwer: { leicht: 10, mittel: 30, schwer: 60 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Verschiebt den Basis-Schwierigkeitsmix (aus der vom Nutzer gewählten Stufe)
 * anhand zweier stetiger Signale (Paket 11, Phase 3A): jüngerer Klausur-Noten-
 * schnitt (65 % neutral, 80 % → +10 Punkte schwerer, 50 % → −10 leichter, dazwischen
 * linear) und Nähe des nächsten Prüfungstermins (≤21 Tage keine Verschiebung,
 * danach linear bis −10 bei ≥42 Tagen; kein Termin bekannt → −5). Ergebnis
 * summiert immer auf 100.
 */
export function computeDifficultyMix(
  baseDifficulty: 'leicht' | 'mittel' | 'schwer',
  recentAvgScore: number | null,
  daysUntilNextExam: number | null,
): DifficultyMix {
  const base = BASE_MIX[baseDifficulty] ?? BASE_MIX.mittel;
  let shift = 0; // positiv = schwerer, negativ = leichter (Prozentpunkte, zwischen leicht/schwer verschoben)
  if (recentAvgScore != null) shift += clamp((recentAvgScore - 65) / 15 * 10, -10, 10);
  if (daysUntilNextExam == null) shift -= 5;
  else shift -= 10 * clamp((daysUntilNextExam - 21) / 21, 0, 1);
  shift = Math.round(clamp(shift, -20, 20));

  const leicht = clamp(base.leicht - shift, 5, 80);
  const schwer = clamp(base.schwer + shift, 5, 80);
  const mittel = Math.max(5, 100 - leicht - schwer);
  const sum = leicht + mittel + schwer;
  const roundedLeicht = Math.round((leicht / sum) * 100);
  const roundedMittel = Math.round((mittel / sum) * 100);
  return { leicht: roundedLeicht, mittel: roundedMittel, schwer: 100 - roundedLeicht - roundedMittel };
}

/** Durchschnitt der ersten n Scores (Aufrufer übergibt neueste zuerst), null ohne Historie. */
export function recentAverageScore(scores: number[], n = 5): number | null {
  const recent = scores.slice(0, n);
  if (recent.length === 0) return null;
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

/**
 * Schwache Themen sollen bewusst wiederholt werden — sie dürfen deshalb nicht
 * gleichzeitig in der "bereits geprüft, nicht erneut verwenden"-Liste stehen,
 * sonst bekommt das Modell zwei widersprüchliche Anweisungen.
 */
export function excludeTopicsWithoutAdaptive(excludeTopics: string[], topicWeights: TopicWeight[]): string[] {
  if (topicWeights.length === 0) return excludeTopics;
  const keep = new Set(topicWeights.map(w => normalizeTopic(w.topic)));
  return excludeTopics.filter(t => !keep.has(normalizeTopic(t)));
}

const normalizeTopic = (s: string) => s.trim().toLowerCase();

/** Ist-Schwierigkeitsverteilung der tatsächlich generierten Fragen in Prozent (Summe 100 oder 0 ohne Daten). */
export function computeActualDifficultyMix(questions: { difficulty?: string }[]): DifficultyMix {
  const counts: DifficultyMix = { leicht: 0, mittel: 0, schwer: 0 };
  let total = 0;
  questions.forEach(q => {
    if (q.difficulty === 'leicht' || q.difficulty === 'mittel' || q.difficulty === 'schwer') { counts[q.difficulty] += 1; total += 1; }
  });
  if (total === 0) return counts;
  const leicht = Math.round((counts.leicht / total) * 100);
  const mittel = Math.round((counts.mittel / total) * 100);
  return { leicht, mittel, schwer: 100 - leicht - mittel };
}

/** Wie viele Fragen je Soll-Thema tatsächlich generiert wurden (Groß-/Kleinschreibung
 *  und Teilstring-Treffer tolerant, weil das Modell Themen leicht anders benennt). */
export function computeTopicCoverage(questions: { topic?: string }[], topicWeights: TopicWeight[]): TopicCoverage[] {
  return topicWeights.map(w => {
    const target = normalizeTopic(w.topic);
    const actual = questions.filter(q => {
      const qt = normalizeTopic(q.topic ?? '');
      return qt.length > 0 && (qt === target || qt.includes(target) || target.includes(qt));
    }).length;
    return { ...w, actual };
  });
}
