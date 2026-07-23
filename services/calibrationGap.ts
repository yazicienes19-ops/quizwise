import type { QuizResult } from './quizHistoryService';

/** Ab wie vielen kalibrierten Antworten zu einem Thema der Gap in den Prompt darf — sonst Rauschen statt Signal. */
export const MIN_CALIBRATED_FOR_GAP = 5;

export interface TopicCalibrationGap {
  topic: string;
  overconfidenceRate: number;   // 0-100: Anteil "sicher"-Antworten, die trotzdem falsch waren
  underconfidenceRate: number;  // 0-100: Anteil "unsicher"-Antworten, die trotzdem richtig waren
  n: number;
}

/**
 * Kalibrierungs-Gap je Thema aus der Quiz-Selbsteinschätzung (UserAnswer.confidence
 * vor Aufdeckung der Lösung, siehe services/calibration.ts) — bisher nur für die
 * ResultView-Anzeige genutzt, nie in die Tiefenanalyse eingespeist. Braucht die
 * Themenzuordnung aus questions[i], da UserAnswer selbst kein Thema trägt.
 */
export function computeTopicCalibrationGaps(results: QuizResult[]): TopicCalibrationGap[] {
  const byTopic = new Map<string, { sicherFalsch: number; sicherGesamt: number; unsicherRichtig: number; unsicherGesamt: number }>();

  for (const result of results) {
    for (const answer of result.answers || []) {
      if (!answer.confidence) continue;
      const topic = result.questions?.[answer.questionIndex]?.topic;
      if (!topic) continue;
      const entry = byTopic.get(topic) ?? { sicherFalsch: 0, sicherGesamt: 0, unsicherRichtig: 0, unsicherGesamt: 0 };
      if (answer.confidence === 'sicher') {
        entry.sicherGesamt++;
        if (!answer.isCorrect) entry.sicherFalsch++;
      } else {
        entry.unsicherGesamt++;
        if (answer.isCorrect) entry.unsicherRichtig++;
      }
      byTopic.set(topic, entry);
    }
  }

  const gaps: TopicCalibrationGap[] = [];
  for (const [topic, e] of byTopic) {
    const n = e.sicherGesamt + e.unsicherGesamt;
    if (n < MIN_CALIBRATED_FOR_GAP) continue;
    gaps.push({
      topic,
      overconfidenceRate: e.sicherGesamt > 0 ? Math.round((e.sicherFalsch / e.sicherGesamt) * 100) : 0,
      underconfidenceRate: e.unsicherGesamt > 0 ? Math.round((e.unsicherRichtig / e.unsicherGesamt) * 100) : 0,
      n,
    });
  }
  return gaps;
}
