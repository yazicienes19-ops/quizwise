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
  const weak = topicMastery
    .filter(t => t.security !== 'sicher')
    .sort((a, b) => (SEVERITY[b.security] - SEVERITY[a.security]) || (a.confidence - b.confidence))
    .slice(0, maxTopics);
  if (weak.length === 0) return [];

  const weightOf = (t: TopicSecurity) => SEVERITY[t.security] + 1; // kritisch=3, unsicher=2
  const weightSum = weak.reduce((s, t) => s + weightOf(t), 0);
  const budget = Math.max(weak.length, Math.floor(totalCount / 2));
  return weak.map(t => ({
    topic: t.topic,
    minCount: Math.max(1, Math.round(budget * (weightOf(t) / weightSum))),
  }));
}

const BASE_MIX: Record<'leicht' | 'mittel' | 'schwer', DifficultyMix> = {
  leicht: { leicht: 60, mittel: 30, schwer: 10 },
  mittel: { leicht: 25, mittel: 50, schwer: 25 },
  schwer: { leicht: 10, mittel: 30, schwer: 60 },
};

/**
 * Verschiebt den Basis-Schwierigkeitsmix (aus der vom Nutzer gewählten Stufe)
 * anhand zweier Signale (Paket 11, Phase 3A): jüngerer Klausur-Notenschnitt
 * (hohe Trefferquote → etwas schwerer, niedrige → etwas leichter) und Nähe des
 * nächsten Prüfungstermins aus examTerms (weit weg oder kein Termin bekannt →
 * etwas diagnostischer/leichter; ≤21 Tage → die gewählte Stufe bleibt
 * unverändert maßgeblich, keine zusätzliche Verschiebung). Ergebnis summiert
 * immer auf 100. Ohne Historie (beide Signale null) exakt der Basis-Mix.
 */
export function computeDifficultyMix(
  baseDifficulty: 'leicht' | 'mittel' | 'schwer',
  recentAvgScore: number | null,
  daysUntilNextExam: number | null,
): DifficultyMix {
  const base = BASE_MIX[baseDifficulty] ?? BASE_MIX.mittel;
  let shift = 0; // positiv = schwerer, negativ = leichter (Prozentpunkte, zwischen leicht/schwer verschoben)
  if (recentAvgScore != null) {
    if (recentAvgScore >= 80) shift += 10;
    else if (recentAvgScore < 50) shift -= 10;
  }
  if (daysUntilNextExam == null) shift -= 5;
  else if (daysUntilNextExam > 21) shift -= 10;
  shift = Math.max(-20, Math.min(20, shift));

  const leicht = Math.max(5, Math.min(80, base.leicht - shift));
  const schwer = Math.max(5, Math.min(80, base.schwer + shift));
  const mittel = Math.max(5, 100 - leicht - schwer);
  const sum = leicht + mittel + schwer;
  const roundedLeicht = Math.round((leicht / sum) * 100);
  const roundedMittel = Math.round((mittel / sum) * 100);
  return { leicht: roundedLeicht, mittel: roundedMittel, schwer: 100 - roundedLeicht - roundedMittel };
}
