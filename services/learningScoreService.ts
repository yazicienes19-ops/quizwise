import type { TopicMetric, FlashcardDeck } from '../types';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';
import { t } from '../i18n';

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
    { key: 'verstaendnis', emoji: '🧠', label: t('ls.verstaendnis'), score: verstaendnis, hint: t('ls.verstaendnis.hint', { n: recallResults.length }) },
    { key: 'langzeit', emoji: '📚', label: t('ls.langzeit'), score: langzeit, hint: t('ls.langzeit.hint', { n: establishedCards.length }) },
    { key: 'abruf', emoji: '⚡', label: t('ls.abruf'), score: abruf, hint: t('ls.abruf.hint') },
    { key: 'transfer', emoji: '🎯', label: t('ls.transfer'), score: transfer, hint: t('ls.transfer.hint') },
    { key: 'klausur', emoji: '📝', label: t('ls.klausur'), score: klausur, hint: t('ls.klausur.hint', { n: examResults.length }) },
  ];

  const available = dimensions.filter((d): d is LearningScoreDimension & { score: number } => d.score !== null);
  return {
    dimensions,
    overall: available.length > 0 ? avg(available.map(d => d.score)) : null,
  };
};
