import type { QuizQuestion, UserAnswer } from '../types';
import { stageForLiveStreak } from './bloomProgression';

/**
 * adaptiveQuizOrder.ts — leichte, kostenlose Umsortierung der noch nicht
 * gezeigten Fragen INNERHALB einer laufenden Quiz-Session.
 *
 * Ergänzt die sitzungsübergreifende, persistente Anpassung (topicBloomHints in
 * generateQuizFromDocument) um eine Live-Komponente: reagiert auf den Streak
 * INNERHALB des aktuellen Quiz, ohne einen weiteren KI-Call — nutzt nur das
 * bereits im selben Generierungs-Call self-gelabelte bloomLevel jeder Frage.
 *
 * Neutral-per-default: Fehlt bloomLevel (Mistake-Review, alte gespeicherte
 * Quizze, fehlgeschlagenes Labeling), verhält sich pickNextQuestionIndex exakt
 * wie die heutige sequenzielle Reihenfolge — kein Sonderfall-Code nötig, ergibt
 * sich rein aus der Logik unten (Vergleich gegen ein exaktes Ziel-Level, ein
 * fehlendes bloomLevel kann dieses nie treffen → nie ein Grund zum Vorziehen).
 */

const topicOf = (q: QuizQuestion | undefined): string => q?.topic || 'Allgemein';

/** Aktueller Live-Streak eines Themas: aufeinanderfolgende richtige Antworten
 *  am Ende der bisherigen (chronologischen) Antwort-Reihenfolge dieser Session,
 *  nur Antworten desselben Themas gezählt. */
export function computeTopicStreak(topic: string, questions: QuizQuestion[], answers: UserAnswer[]): number {
  let streak = 0;
  for (const a of answers) {
    if (topicOf(questions[a.questionIndex]) !== topic) continue;
    if (a.isCorrect) streak++;
    else streak = 0;
  }
  return streak;
}

/**
 * Bestimmt den Original-Array-Index der nächsten zu zeigenden Frage.
 * Gibt -1 zurück, wenn keine Frage mehr offen ist.
 */
export function pickNextQuestionIndex(questions: QuizQuestion[], answers: UserAnswer[]): number {
  const answeredIndices = new Set(answers.map(a => a.questionIndex));

  let defaultNextIndex = -1;
  for (let i = 0; i < questions.length; i++) {
    if (!answeredIndices.has(i)) { defaultNextIndex = i; break; }
  }
  if (defaultNextIndex === -1) return -1;

  const topic = topicOf(questions[defaultNextIndex]);
  const defaultBloom = questions[defaultNextIndex].bloomLevel;
  const targetLevel = stageForLiveStreak(computeTopicStreak(topic, questions, answers));

  // Passt der Standard-Kandidat schon (oder hat er gar kein Label, also neutral)?
  if (!defaultBloom || defaultBloom === targetLevel) return defaultNextIndex;

  // Sonst: unter den noch offenen Fragen DESSELBEN Themas nach einer besser
  // passenden suchen (frühestes Vorkommen) — niemals themenübergreifend.
  for (let i = defaultNextIndex + 1; i < questions.length; i++) {
    if (answeredIndices.has(i)) continue;
    if (topicOf(questions[i]) !== topic) continue;
    if (questions[i].bloomLevel === targetLevel) return i;
  }

  return defaultNextIndex;
}
