import type { Collection, ExamTerm, FlashcardDeck, ProcessedDocument } from '../types';
import type { MistakeItem } from './mistakeReviewService';
import { buildModuleFilter, decksOfModule, filterActivityByModule, type ActivityResults } from './moduleProgressService';
import { buildLearningScore } from './learningScoreService';
import { gradeFromPercentage, passThresholdPercent } from './learningProfileService';
import { termsForModule, upcomingExamTerms, pastExamTerms, type DatedExamTerm } from './examTermService';
import { averageGrade, isWeakGrade, gradeScore } from './gradeScale';

/**
 * homeOverviewService — Daten der Startseite "Heute" (Design-Handoff 2026-09):
 * Kennzahlenzeile und Modultabelle. Reine Funktionen, keine Werte erfinden:
 * wo keine Daten vorliegen, bleibt das Feld null.
 *
 * Note je Modul: die selbst eingetragene Klausurnote hat Vorrang; ohne sie
 * zeigt die Tabelle den Ø der Klausur-Simulator-Ergebnisse (als solcher markiert).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type ModuleNextStep = 'enterGrade' | 'mistakes' | 'rebuild' | 'placement' | 'review' | 'cleanup';
export type GradeSource = 'exam' | 'simulator';

export interface ModuleRow {
  id: string;
  name: string;
  /** Lernfortschritt 0–100 wie in der Fach-Sicht des Lern-Coachs; null ohne ausreichende Daten. */
  learningPercent: number | null;
  /** Ø der Klausur-Simulator-Ergebnisse in diesem Modul; null ohne Simulation. */
  examPercent: number | null;
  grade: string | null;
  gradeSource: GradeSource | null;
  /** Note an oder unter der Bestehensgrenze (DE: 4,0 oder schlechter). */
  weak: boolean;
  /** Heute fällige Fehlerfragen aus Dokumenten dieses Moduls. */
  openErrors: number;
  /** Letzte Klausur-Simulation. */
  lastExamAt: number | null;
  nextTerm: DatedExamTerm | null;
  /** Jüngste bereits geschriebene Klausur dieses Moduls, mit oder ohne Note. */
  writtenTerm: DatedExamTerm | null;
  /** Gleichnamiges Modul existiert bereits weiter oben. */
  duplicate: boolean;
  nextStep: ModuleNextStep;
}

export interface HomeKpis {
  nextExamDays: number | null;
  gradeAverage: string | null;
  gradeSource: GradeSource | null;
  examsWritten: number;
  examsTotal: number;
  weeklyQuestions: number;
}

export const buildModuleRows = (input: {
  collections: Collection[];
  documents: ProcessedDocument[];
  decks: FlashcardDeck[];
  activity: ActivityResults;
  dueMistakes: MistakeItem[];
  examTerms: ExamTerm[];
  now: Date;
}): ModuleRow[] => {
  const weakBelow = passThresholdPercent() + 5;
  const seenNames = new Set<string>();

  return input.collections.map((c): ModuleRow => {
    const filter = buildModuleFilter(c, input.documents);
    const scoped = filterActivityByModule(input.activity, filter, new Set());
    // Themen-Metriken tragen keine Fach-Zuordnung, daher wie im Lern-Coach in der Fach-Sicht weggelassen.
    const learningPercent = buildLearningScore({ ...scoped, metrics: [], decks: decksOfModule(input.decks, filter), streakCurrent: 0 }).overall;

    const exams = scoped.examResults;
    const examPercent = exams.length ? Math.round(exams.reduce((s, r) => s + r.score, 0) / exams.length) : null;
    const simulatorGrade = examPercent != null ? gradeFromPercentage(examPercent).grade : null;

    const moduleTerms = termsForModule(input.examTerms, c);
    const pastTerms = pastExamTerms(moduleTerms, input.now);
    const writtenTerm = pastTerms[0] ?? null;
    const realGrade = pastTerms.find(term => term.grade)?.grade ?? null;

    const grade = realGrade ?? simulatorGrade;
    const gradeSource: GradeSource | null = realGrade ? 'exam' : simulatorGrade ? 'simulator' : null;
    const weak = realGrade ? isWeakGrade(realGrade) : examPercent != null && examPercent < weakBelow;
    const openErrors = input.dueMistakes.filter(m => filter.ids.has(m.docId) || filter.names.has(m.docName)).length;

    const key = c.name.trim().toLowerCase();
    const duplicate = seenNames.has(key);
    seenNames.add(key);

    const hasData = learningPercent != null || grade != null;
    const nextStep: ModuleNextStep = duplicate ? 'cleanup'
      : writtenTerm && !writtenTerm.grade ? 'enterGrade'
      : openErrors > 0 ? 'mistakes'
      : weak ? 'rebuild'
      : !hasData ? 'placement'
      : 'review';

    return {
      id: c.id,
      name: c.name,
      learningPercent,
      examPercent,
      grade,
      gradeSource,
      weak,
      openErrors,
      lastExamAt: exams.length ? Math.max(...exams.map(r => r.timestamp)) : null,
      nextTerm: upcomingExamTerms(moduleTerms, input.now)[0] ?? null,
      writtenTerm,
      duplicate,
      nextStep,
    };
  });
};

const hasData = (r: ModuleRow) => r.learningPercent != null || r.grade != null;

/** Dringlichkeit: anstehende Klausur, fehlende Note, offene Fehlerfragen, schwache Note, Module mit Daten, zuletzt ohne. */
const urgencyRank = (r: ModuleRow): number =>
  r.nextTerm ? 0
    : r.nextStep === 'enterGrade' ? 1
    : r.openErrors > 0 ? 2
    : r.weak ? 3
    : hasData(r) ? 4
    : 5;

/** Vergleichswert 0–100 (höher = besser) über echte Noten und Simulator-Prozente hinweg. */
const gradeSortValue = (r: ModuleRow): number | null =>
  r.gradeSource === 'exam' && r.grade ? gradeScore(r.grade) : r.examPercent;

const nullsLast = (a: number | null, b: number | null, dir: 1 | -1): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
};

export type ModuleSort = 'urgency' | 'grade' | 'date' | 'alpha';

const COMPARE: Record<ModuleSort, (a: ModuleRow, b: ModuleRow) => number> = {
  urgency: (a, b) => {
    const rank = urgencyRank(a) - urgencyRank(b);
    if (rank !== 0) return rank;
    if (a.nextTerm && b.nextTerm) return a.nextTerm.days - b.nextTerm.days;
    if (urgencyRank(a) === 2) return b.openErrors - a.openErrors;
    return 0;
  },
  grade: (a, b) => nullsLast(gradeSortValue(a), gradeSortValue(b), -1),
  date: (a, b) => nullsLast(a.nextTerm?.days ?? null, b.nextTerm?.days ?? null, 1),
  alpha: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
};

/** Stabil: bei Gleichstand bleibt die Sidebar-Reihenfolge erhalten. */
export const sortModuleRows = (rows: ModuleRow[], sort: ModuleSort): ModuleRow[] =>
  rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => COMPARE[sort](a.row, b.row) || a.index - b.index)
    .map(({ row }) => row);

/**
 * Notenschnitt/Klausuren: sobald eine echte Note eingetragen ist, zählen nur
 * echte Klausuren (Simulator-Werte würden den Schnitt verfälschen); vorher der
 * Simulator als Ersatz, in der UI als solcher gekennzeichnet.
 */
export const buildHomeKpis = (input: {
  rows: ModuleRow[];
  examTerms: ExamTerm[];
  activity: ActivityResults;
  now: Date;
}): HomeKpis => {
  const realGrades = input.rows.filter(r => r.gradeSource === 'exam' && r.grade).map(r => r.grade as string);
  const simulated = input.rows.filter(r => r.examPercent != null);
  const simulatedMean = simulated.length ? simulated.reduce((s, r) => s + (r.examPercent ?? 0), 0) / simulated.length : null;

  const since = input.now.getTime() - 7 * DAY_MS;
  const weeklyQuestions =
    input.activity.quizResults.filter(r => r.timestamp >= since).reduce((s, r) => s + r.totalCount, 0) +
    input.activity.examResults.filter(r => r.timestamp >= since).reduce((s, r) => s + (r.questions?.length ?? 0), 0);

  const useReal = realGrades.length > 0;
  return {
    nextExamDays: upcomingExamTerms(input.examTerms, input.now)[0]?.days ?? null,
    gradeAverage: useReal
      ? averageGrade(realGrades)
      : simulatedMean != null ? gradeFromPercentage(Math.round(simulatedMean)).grade : null,
    gradeSource: useReal ? 'exam' : simulatedMean != null ? 'simulator' : null,
    examsWritten: useReal ? input.rows.filter(r => r.writtenTerm).length : simulated.length,
    examsTotal: input.rows.length,
    weeklyQuestions,
  };
};

export const formatPercent = (n: number, locale: string): string =>
  locale === 'de' ? `${n} %` : locale === 'tr' ? `%${n}` : `${n}%`;
