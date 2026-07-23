import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';
import type { WrongAnswerContext } from './geminiService';

const SESSIONS_PER_SOURCE = 8;
const MAX_PER_SESSION = { quiz: 3, exam: 3, feynman: 2 } as const;
/** Startwert, bewusst keine "wissenschaftlich hergeleitete" Zahl — Klausur und Quiz
 *  sind der Kernnachweis, Feynman ergänzt. Anpassbar, falls sich das als falsch erweist. */
const QUOTA = { quiz: 0.4, exam: 0.4, feynman: 0.2 } as const;

type Source = keyof typeof QUOTA;
type Timed = WrongAnswerContext & { ts: number; source: Source };

export interface ErrorPoolInput {
  quiz: QuizResult[];
  exam: ExamResult[];
  recall: RecallResult[];
  /** Entspricht dem Dokument-Filter der Seite (selectedDoc) — leer/undefined = kontoweit. */
  docFilter?: string;
  limit?: number;
}

const bySource = (docFilter: string | undefined, quiz: QuizResult[], exam: ExamResult[], recall: RecallResult[]) => {
  const matches = (docName: string) => !docFilter || docName === docFilter;
  return {
    quiz: quiz.filter(r => matches(r.docName)),
    exam: exam.filter(r => matches(r.docName)),
    recall: recall.filter(r => matches(r.docName)),
  };
};

function fromQuiz(results: QuizResult[]): Timed[] {
  return results.slice(0, SESSIONS_PER_SOURCE).flatMap(result =>
    (result.answers || [])
      .map((a, idx) => ({ a, idx }))
      .filter(({ a }) => !a.isCorrect)
      .slice(0, MAX_PER_SESSION.quiz)
      .map(({ a, idx }) => {
        const q = result.questions?.[a.questionIndex];
        if (!q) return null;
        return {
          id: `${result.id}:q${idx}`, sessionId: result.id, source: 'quiz' as const,
          question: q.question, topic: q.topic, explanation: q.explanation,
          docName: result.docName, ts: result.timestamp,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  );
}

/** Sortiert nach relativem Punktverlust (Schweregrad) statt nach Reihenfolge im
 *  Dokument — ein 1-von-50-Punkte-Abzug soll einen 8-von-10-Totalausfall nicht
 *  aus den Top-3 verdrängen. */
function fromExam(results: ExamResult[]): Timed[] {
  return results.slice(0, SESSIONS_PER_SOURCE).flatMap(result => {
    const withSeverity = (result.questions || [])
      .map(q => ({ q, severity: q.points > 0 ? (q.points - (q.achievedPoints ?? 0)) / q.points : 0 }))
      .filter(({ severity }) => severity > 0)
      .sort((a, b) => b.severity - a.severity)
      .slice(0, MAX_PER_SESSION.exam);
    return withSeverity.map(({ q }) => ({
      id: `${result.id}:${q.id}`, sessionId: result.id, source: 'exam' as const,
      question: q.question, topic: q.topic, explanation: q.feedback || q.solution,
      docName: result.docName, ts: result.timestamp,
    }));
  });
}

function fromFeynman(results: RecallResult[]): Timed[] {
  return results.slice(0, SESSIONS_PER_SOURCE).flatMap(result =>
    (result.missingPoints || []).slice(0, MAX_PER_SESSION.feynman).map((m, idx) => ({
      id: `${result.id}:m${idx}`, sessionId: result.id, source: 'feynman' as const,
      question: `Erkläre: ${result.topic || result.docName}`, topic: result.topic, explanation: m,
      docName: result.docName, ts: result.timestamp,
    }))
  );
}

/**
 * Poolt Fehler aus Quiz, Klausur und Feynman für die Tiefenanalyse. Quotiert
 * statt rein nach Datum zu sortieren — sonst verhungert eine Quelle, die der
 * Nutzer seit Wochen nicht genutzt hat, obwohl sie seine Hauptlernmethode ist.
 * Jeder Eintrag trägt eine stabile id + sessionId (Grundlage für Grounding per
 * Referenz und die "≥2 Sessions"-Mindestschwelle bei der KI-Mustererkennung).
 */
export function buildErrorPool(input: ErrorPoolInput): WrongAnswerContext[] {
  const limit = input.limit ?? 20;
  const filtered = bySource(input.docFilter, input.quiz, input.exam, input.recall);

  const pools: Record<Source, Timed[]> = {
    quiz: fromQuiz(filtered.quiz),
    exam: fromExam(filtered.exam),
    feynman: fromFeynman(filtered.recall),
  };

  const byRecency = (a: Timed, b: Timed) => b.ts - a.ts;
  const quotas = (Object.keys(QUOTA) as Source[]).map(source => ({
    source,
    quota: Math.min(pools[source].length, Math.ceil(limit * QUOTA[source])),
  }));

  const selected: Timed[] = quotas.flatMap(({ source, quota }) =>
    [...pools[source]].sort(byRecency).slice(0, quota)
  );

  const rest = limit - selected.length;
  if (rest > 0) {
    const already = new Set(selected.map(e => e.id));
    const remaining = (Object.keys(QUOTA) as Source[])
      .flatMap(source => pools[source])
      .filter(e => !already.has(e.id))
      .sort(byRecency)
      .slice(0, rest);
    selected.push(...remaining);
  }

  return selected
    .sort(byRecency)
    .map(({ ts, source, ...rest }) => rest);
}
