import { describe, it, expect } from 'vitest';
import { termMatchesModule, termBelongsToModule, upcomingExamTerms, pastExamTerms, nextExamForModule } from './examTermService';
import type { Collection, ExamTerm } from '../types';

const now = new Date('2026-09-13T12:00:00');
const col = (id: string, name: string): Collection => ({ id, name, emoji: '📘', color: '#000' });
const term = (id: string, title: string, date: string, collectionId?: string): ExamTerm => ({ id, title, date, topics: [], collectionId });

const stat = col('stat', 'Statistik I');
const bio = col('bio', 'Biologische Psychologie');

describe('examTermService', () => {
  it('ordnet über ganze Wörter zu', () => {
    expect(termMatchesModule('Klausur Statistik I', 'Statistik I')).toBe(true);
    expect(termMatchesModule('Klausur Statistik II', 'Statistik I')).toBe(false);
    expect(termMatchesModule('Bio', 'Biologische Psychologie')).toBe(false);
  });

  it('feste Zuordnung schlägt den Namen, Altbestand fällt auf den Namen zurück', () => {
    expect(termBelongsToModule(term('a', 'Klausur Statistik I', '2026-10-07', 'bio'), stat)).toBe(false);
    expect(termBelongsToModule(term('a', 'Klausur Statistik I', '2026-10-07', 'bio'), bio)).toBe(true);
    expect(termBelongsToModule(term('b', 'Klausur Statistik I', '2026-10-07'), stat)).toBe(true);
  });

  it('trennt anstehende und vergangene Termine', () => {
    const terms = [term('old', 'Alt', '2026-02-04'), term('older', 'Älter', '2026-01-10'), term('soon', 'Bald', '2026-10-07'), term('today', 'Heute', '2026-09-13')];
    expect(upcomingExamTerms(terms, now).map(t => t.id)).toEqual(['today', 'soon']);
    expect(pastExamTerms(terms, now).map(t => t.id)).toEqual(['old', 'older']);
  });

  it('nächster Termin je Fach, ohne Fach der nächste insgesamt', () => {
    const terms = [term('s', 'Statistik', '2026-10-20', 'stat'), term('b', 'Bio', '2026-09-30', 'bio')];
    expect(nextExamForModule(terms, stat, now)?.id).toBe('s');
    expect(nextExamForModule(terms, null, now)?.id).toBe('b');
    expect(nextExamForModule(terms, col('x', 'Leer'), now)).toBeNull();
  });
});
