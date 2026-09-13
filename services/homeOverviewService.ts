import type { Collection, ExamTerm, FlashcardDeck, ProcessedDocument } from '../types';
import type { MistakeItem } from './mistakeReviewService';
import { buildModuleFilter, decksOfModule, filterActivityByModule, type ActivityResults } from './moduleProgressService';
import { buildLearningScore } from './learningScoreService';
import { gradeFromPercentage, passThresholdPercent } from './learningProfileService';
import { daysUntilDate } from './calendarSessions';

/**
 * homeOverviewService — Daten der Startseite "Heute" (Design-Handoff 2026-09):
 * Kennzahlenzeile und Modultabelle. Reine Funktionen, keine Werte erfinden:
 * wo keine Daten vorliegen, bleibt das Feld null.
 *
 * "Note" ist bewusst der Ø der Klausur-Simulator-Ergebnisse im Modul (echte
 * Uni-Noten speichert StudeArc nicht), Termine kommen aus den Klausurterminen
 * des Kalenders und werden über den Namen einem Modul zugeordnet (ExamTerm hat
 * keine Collection-Zuordnung).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type ModuleNextStep = 'mistakes' | 'rebuild' | 'placement' | 'review' | 'cleanup';
export type ModuleSort = 'urgency' | 'grade' | 'date' | 'alpha';

export interface UpcomingTerm {
  title: string;
  date: string;
  days: number;
}

export interface ModuleRow {
  id: string;
  name: string;
  /** Lernfortschritt 0–100 wie in der Fach-Sicht des Lern-Coachs; null ohne ausreichende Daten. */
  learningPercent: number | null;
  /** Ø der Klausur-Simulator-Ergebnisse in diesem Modul; null ohne Simulation. */
  examPercent: number | null;
  grade: string | null;
  /** Simulator-Schnitt knapp an oder unter der Bestehensgrenze (DE: 4,0 oder schlechter). */
  weak: boolean;
  /** Heute fällige Fehlerfragen aus Dokumenten dieses Moduls. */
  openErrors: number;
  lastExamAt: number | null;
  nextTerm: UpcomingTerm | null;
  /** Gleichnamiges Modul existiert bereits weiter oben. */
  duplicate: boolean;
  nextStep: ModuleNextStep;
}

export interface HomeKpis {
  nextExamDays: number | null;
  gradeAverage: string | null;
  examsWritten: number;
  examsTotal: number;
  weeklyQuestions: number;
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Klausurtermin ↔ Modul über den Namen, nur ganze Wörter ("Statistik I" passt nicht zu "Statistik II"). */
export const termMatchesModule = (termTitle: string, moduleName: string): boolean => {
  const a = normalize(termTitle);
  const b = normalize(moduleName);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
};

export const upcomingExamTerms = (examTerms: ExamTerm[], now: Date): UpcomingTerm[] =>
  examTerms
    .map(term => ({ title: term.title, date: term.date, days: daysUntilDate(term.date, now) }))
    .filter(term => term.days >= 0)
    .sort((a, b) => a.days - b.days);

export const buildModuleRows = (input: {
  collections: Collection[];
  documents: ProcessedDocument[];
  decks: FlashcardDeck[];
  activity: ActivityResults;
  dueMistakes: MistakeItem[];
  examTerms: ExamTerm[];
  now: Date;
}): ModuleRow[] => {
  const upcoming = upcomingExamTerms(input.examTerms, input.now);
  const weakBelow = passThresholdPercent() + 5;
  const seenNames = new Set<string>();

  return input.collections.map((c): ModuleRow => {
    const filter = buildModuleFilter(c, input.documents);
    const scoped = filterActivityByModule(input.activity, filter, new Set());
    // Themen-Metriken tragen keine Fach-Zuordnung, daher wie im Lern-Coach in der Fach-Sicht weggelassen.
    const learningPercent = buildLearningScore({ ...scoped, metrics: [], decks: decksOfModule(input.decks, filter), streakCurrent: 0 }).overall;

    const exams = scoped.examResults;
    const examPercent = exams.length ? Math.round(exams.reduce((s, r) => s + r.score, 0) / exams.length) : null;
    const weak = examPercent != null && examPercent < weakBelow;
    const openErrors = input.dueMistakes.filter(m => filter.ids.has(m.docId) || filter.names.has(m.docName)).length;

    const key = normalize(c.name);
    const duplicate = seenNames.has(key);
    seenNames.add(key);

    const hasData = learningPercent != null || examPercent != null;
    const nextStep: ModuleNextStep = duplicate ? 'cleanup'
      : openErrors > 0 ? 'mistakes'
      : weak ? 'rebuild'
      : !hasData ? 'placement'
      : 'review';

    return {
      id: c.id,
      name: c.name,
      learningPercent,
      examPercent,
      grade: examPercent != null ? gradeFromPercentage(examPercent).grade : null,
      weak,
      openErrors,
      lastExamAt: exams.length ? Math.max(...exams.map(r => r.timestamp)) : null,
      nextTerm: upcoming.find(term => termMatchesModule(term.title, c.name)) ?? null,
      duplicate,
      nextStep,
    };
  });
};

const hasData = (r: ModuleRow) => r.learningPercent != null || r.examPercent != null;

/** Dringlichkeit: anstehende Klausur, dann offene Fehlerfragen, dann schwacher Simulator-Schnitt, dann Module mit Daten, zuletzt ohne. */
const urgencyRank = (r: ModuleRow): number =>
  r.nextTerm ? 0 : r.openErrors > 0 ? 1 : r.weak ? 2 : hasData(r) ? 3 : 4;

const nullsLast = (a: number | null, b: number | null, dir: 1 | -1): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
};

const COMPARE: Record<ModuleSort, (a: ModuleRow, b: ModuleRow) => number> = {
  urgency: (a, b) => {
    const rank = urgencyRank(a) - urgencyRank(b);
    if (rank !== 0) return rank;
    if (a.nextTerm && b.nextTerm) return a.nextTerm.days - b.nextTerm.days;
    if (urgencyRank(a) === 1) return b.openErrors - a.openErrors;
    return 0;
  },
  grade: (a, b) => nullsLast(a.examPercent, b.examPercent, -1),
  date: (a, b) => nullsLast(a.nextTerm?.days ?? null, b.nextTerm?.days ?? null, 1),
  alpha: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
};

/** Stabil: bei Gleichstand bleibt die Sidebar-Reihenfolge erhalten. */
export const sortModuleRows = (rows: ModuleRow[], sort: ModuleSort): ModuleRow[] =>
  rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => COMPARE[sort](a.row, b.row) || a.index - b.index)
    .map(({ row }) => row);

export const buildHomeKpis = (input: {
  rows: ModuleRow[];
  examTerms: ExamTerm[];
  activity: ActivityResults;
  now: Date;
}): HomeKpis => {
  const graded = input.rows.filter(r => r.examPercent != null);
  const mean = graded.length ? graded.reduce((s, r) => s + (r.examPercent ?? 0), 0) / graded.length : null;
  const since = input.now.getTime() - 7 * DAY_MS;
  const weeklyQuestions =
    input.activity.quizResults.filter(r => r.timestamp >= since).reduce((s, r) => s + r.totalCount, 0) +
    input.activity.examResults.filter(r => r.timestamp >= since).reduce((s, r) => s + (r.questions?.length ?? 0), 0);

  return {
    nextExamDays: upcomingExamTerms(input.examTerms, input.now)[0]?.days ?? null,
    gradeAverage: mean != null ? gradeFromPercentage(Math.round(mean)).grade : null,
    examsWritten: graded.length,
    examsTotal: input.rows.length,
    weeklyQuestions,
  };
};

/** Deutsche Noten mit Dezimalkomma ("2,3"), andere Sprachen unverändert. */
export const formatGrade = (grade: string, locale: string): string =>
  locale === 'de' ? grade.replace('.', ',') : grade;

export const formatPercent = (n: number, locale: string): string =>
  locale === 'de' ? `${n} %` : locale === 'tr' ? `%${n}` : `${n}%`;
