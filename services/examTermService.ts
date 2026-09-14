import type { Collection, ExamTerm } from '../types';
import { daysUntilDate } from './calendarSessions';

/**
 * Klausurtermine ↔ Fächer. Seit 2026-09 trägt ein Termin eine feste
 * Fach-Zuordnung (collectionId); Altbestand ohne Zuordnung wird weiter über den
 * Namen zugeordnet, damit bestehende Termine nicht aus den Fächern verschwinden.
 */

export interface DatedExamTerm extends ExamTerm {
  /** Tage bis zum Termin (negativ = vergangen). */
  days: number;
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Namensabgleich nur über ganze Wörter ("Statistik I" passt nicht zu "Statistik II"). */
export const termMatchesModule = (termTitle: string, moduleName: string): boolean => {
  const a = normalize(termTitle);
  const b = normalize(moduleName);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
};

export const termBelongsToModule = (term: ExamTerm, module: Collection): boolean =>
  term.collectionId ? term.collectionId === module.id : termMatchesModule(term.title, module.name);

export const termsForModule = (terms: ExamTerm[], module: Collection): ExamTerm[] =>
  terms.filter(term => termBelongsToModule(term, module));

const withDays = (terms: ExamTerm[], now: Date): DatedExamTerm[] =>
  terms.map(term => ({ ...term, days: daysUntilDate(term.date, now) }));

/** Heute und später, nächster zuerst. */
export const upcomingExamTerms = (terms: ExamTerm[], now: Date): DatedExamTerm[] =>
  withDays(terms, now).filter(term => term.days >= 0).sort((a, b) => a.days - b.days);

/** Vor heute, jüngster zuerst. */
export const pastExamTerms = (terms: ExamTerm[], now: Date): DatedExamTerm[] =>
  withDays(terms, now).filter(term => term.days < 0).sort((a, b) => b.days - a.days);

/** Nächster Termin: bei aktivem Fach nur dessen Termine, sonst alle. */
export const nextExamForModule = (terms: ExamTerm[], module: Collection | null, now: Date): DatedExamTerm | null =>
  upcomingExamTerms(module ? termsForModule(terms, module) : terms, now)[0] ?? null;
