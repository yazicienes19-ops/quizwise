import type { TopicMetric, FlashcardDeck } from '../types';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';

/**
 * learningScoreService — deterministischer „Learning Score" für den Lern-Coach.
 *
 * Bewertet fünf Lernbereiche getrennt (0–100) aus vorhandenen Daten — kein
 * KI-Call. Dimensionen unterhalb ihrer Daten-Mindestschwelle liefern `null`
 * plus einen Hinweis, was noch fehlt (Muster „Bald verfügbar").
 */

export interface LearningScoreDimension {
  key: 'verstaendnis' | 'langzeit' | 'abruf' | 'transfer' | 'klausur';
  emoji: string;
  label: string;
  score: number | null;
  /** Was fehlt, wenn score === null. */
  hint: string;
}

export interface LearningScore {
  dimensions: LearningScoreDimension[];
  /** Ø aller berechenbaren Dimensionen; null wenn keine berechenbar. */
  overall: number | null;
}

const avg = (nums: number[]): number =>
  nums.length ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length) : 0;

export const buildLearningScore = (input: {
  quizResults: QuizResult[];
  examResults: ExamResult[];
  recallResults: RecallResult[];
  metrics: TopicMetric[];
  decks: FlashcardDeck[];
  streakCurrent: number;
}): LearningScore => {
  const { quizResults, examResults, recallResults, metrics, decks, streakCurrent } = input;

  // 🧠 Verständnis — Erklären in eigenen Worten (Feynman + KI-Erklärer-Bewertungen)
  const verstaendnis: number | null = recallResults.length >= 2
    ? avg(recallResults.map(r => r.score))
    : null;

  // 📚 Wissen behalten — Anteil der etablierten Karten mit stabilem Intervall (>= 7 Tage)
  const establishedCards = decks.flatMap(d => d.cards).filter(c => c.srs && c.srs.repetitions > 0);
  let langzeit: number | null = null;
  if (establishedCards.length >= 10) {
    const stableShare = establishedCards.filter(c => (c.srs?.interval ?? 0) >= 7).length / establishedCards.length;
    langzeit = Math.min(100, Math.round(stableShare * 100) + Math.min(streakCurrent, 10));
  }

  // ⚡ Wissen abrufen — Quiz-Genauigkeit + Karteikarten-Konfidenz
  const abrufParts: number[] = [];
  if (quizResults.length >= 2) abrufParts.push(avg(quizResults.map(r => r.score)));
  if (metrics.length >= 3) abrufParts.push(avg(metrics.map(m => m.confidence)));
  const abruf: number | null = abrufParts.length > 0 ? avg(abrufParts) : null;

  // 🎯 Wissen anwenden — Transfer- und Beispiel-Kategorien aus Klausuren
  const transferScores: number[] = [];
  examResults.forEach(r => {
    (r.categoryBreakdown || []).forEach(({ category, score }) => {
      if (category === 'transfer' || category === 'beispiel') transferScores.push(score);
    });
  });
  const transfer: number | null = transferScores.length > 0 ? avg(transferScores) : null;

  // 📝 Klausurleistung
  const klausur: number | null = examResults.length >= 2
    ? avg(examResults.map(r => r.score))
    : null;

  const dimensions: LearningScoreDimension[] = [
    { key: 'verstaendnis', emoji: '🧠', label: 'Verständnis', score: verstaendnis, hint: `Braucht 2 Erklär-Sessions (du hast ${recallResults.length}).` },
    { key: 'langzeit', emoji: '📚', label: 'Wissen behalten', score: langzeit, hint: `Braucht 10 gelernte Karteikarten (du hast ${establishedCards.length}).` },
    { key: 'abruf', emoji: '⚡', label: 'Wissen abrufen', score: abruf, hint: 'Braucht 2 Quizzes oder 3 Karteikarten-Themen.' },
    { key: 'transfer', emoji: '🎯', label: 'Wissen anwenden', score: transfer, hint: 'Braucht eine Klausur mit Transfer-/Beispielaufgaben.' },
    { key: 'klausur', emoji: '📝', label: 'Klausurleistung', score: klausur, hint: `Braucht 2 Klausursimulationen (du hast ${examResults.length}).` },
  ];

  const available = dimensions.filter((d): d is LearningScoreDimension & { score: number } => d.score !== null);
  return {
    dimensions,
    overall: available.length > 0 ? avg(available.map(d => d.score)) : null,
  };
};
