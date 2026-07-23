import type { TopicMetric, MetricSource } from '../types';

type SubScore = { value: number; n: number };

/**
 * Adaptiver Lernfaktor α = 1/(n+1) statt eines fixen α = 0,5: bei den ersten
 * Updates eines Themas entsteht ein echter arithmetischer Mittelwert (stabil
 * bei wenig Daten), mit wachsendem n konvergiert α gegen einen kleinen,
 * gleichbleibend reagiblen Wert (folgt Vergessen/Drift bei viel Daten). Ein
 * fixes α = 0,5 zieht schon nach einer einzigen schwachen Session die
 * Konfidenz zur Hälfte in die falsche Richtung — instabiler als eine rohe
 * Trefferquote bei kleinem n, obwohl es genau das vermeiden soll.
 */
export function updateSubScore(sub: SubScore | undefined, scoreNeu: number): SubScore {
  const n = sub?.n ?? 0;
  const alpha = 1 / (n + 1);
  const prevValue = sub?.value ?? 0;
  return { value: Math.round(prevValue + alpha * (scoreNeu - prevValue)), n: n + 1 };
}

/** Gewichtetes Mittel der Sub-Scores nach n je Quelle — Methoden mit mehr Daten wiegen mehr. */
export function aggregateConfidence(subScores: TopicMetric['subScores']): number {
  const entries = Object.values(subScores ?? {}).filter((s): s is SubScore => !!s && s.n > 0);
  if (entries.length === 0) return 0;
  const totalWeight = entries.reduce((sum, s) => sum + s.n, 0);
  return Math.round(entries.reduce((sum, s) => sum + s.value * s.n, 0) / totalWeight);
}

/**
 * Aktualisiert (oder legt an) die TopicMetric für ein Thema nach einer Session.
 * Jede Lernmethode (quiz/exam/recall/cards) führt einen eigenen Sub-Score statt
 * ununterscheidbar in dieselbe Zahl zu schreiben — eine Feynman-Lücke und ein
 * Klausur-Erfolg ziehen sonst an derselben Variable in dieselbe Richtung, obwohl
 * es unterschiedliche Bewertungslogiken sind. `confidence` bleibt als
 * gewichtetes Aggregat für Anzeige/Rückwärtskompatibilität erhalten.
 */
export function updateTopicMetric(
  existing: TopicMetric | undefined,
  topic: string,
  score: number,
  source: MetricSource,
): TopicMetric {
  let subScores = existing?.subScores;
  if (!subScores && existing && existing.totalAttempts > 0) {
    // Migration von Alt-Daten (vor Einführung der Sub-Scores): der bisherige
    // Wert wird für die zuerst schreibende Methode mit n=5 ("mittlere Reife")
    // übernommen, statt bei alpha=1 hart auf den ersten neuen Score zu springen.
    subScores = { [source]: { value: existing.confidence, n: 5 } };
  }
  subScores = { ...(subScores ?? {}) };
  subScores[source] = updateSubScore(subScores[source], score);
  const confidence = aggregateConfidence(subScores);

  if (existing) {
    return {
      ...existing,
      subScores,
      confidence,
      lastReviewed: Date.now(),
      totalAttempts: existing.totalAttempts + 1,
      correctAttempts: existing.correctAttempts + (score >= 70 ? 1 : 0),
    };
  }
  return {
    id: Math.random().toString(36).substr(2, 5),
    topic,
    subScores,
    confidence,
    lastReviewed: Date.now(),
    totalAttempts: 1,
    correctAttempts: score >= 70 ? 1 : 0,
  };
}
