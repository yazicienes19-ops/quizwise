import { describe, it, expect } from 'vitest';
import {
  sessionsForDate,
  applySessionSave,
  resolveModuleColor,
  toDateStr,
} from './calendarSessions';
import type { RecurringStudySession, CalendarStudySession, Collection } from '../types';

const psych: Collection = { id: 'psych', name: 'Allgemeine Psychologie I', emoji: '', color: '#10B981' };
const collections: Collection[] = [psych];

describe('resolveModuleColor', () => {
  it('gibt Hex-Farben unverändert zurück', () => {
    expect(resolveModuleColor('#10B981')).toBe('#10B981');
  });
  it('mappt bekannte Alt-Tailwind-Klassen auf Hex', () => {
    expect(resolveModuleColor('bg-emerald-500')).toBe('#10B981');
  });
  it('fällt bei unbekanntem Wert auf die Standardfarbe zurück', () => {
    expect(resolveModuleColor('bg-unknown-500')).toBe('#6366F1');
  });
  it('fällt bei fehlendem Wert auf die Standardfarbe zurück', () => {
    expect(resolveModuleColor(undefined)).toBe('#6366F1');
  });
});

describe('sessionsForDate', () => {
  it('zeigt eine wiederkehrende Session am richtigen Wochentag', () => {
    const monday = new Date(2026, 7, 3); // Montag
    const rule: RecurringStudySession = {
      id: 'r1', weekday: 1, moduleId: 'psych', topic: 'Wahrnehmung', startTime: '16:00', endTime: '17:30',
    };
    const result = sessionsForDate(monday, [rule], [], collections);
    expect(result).toHaveLength(1);
    expect(result[0].recurring).toBe(true);
    expect(result[0].subjectLabel).toBe('Allgemeine Psychologie I');
    expect(result[0].topic).toBe('Wahrnehmung');
  });

  it('zeigt eine wiederkehrende Session NICHT an einem anderen Wochentag', () => {
    const tuesday = new Date(2026, 7, 4);
    const rule: RecurringStudySession = {
      id: 'r1', weekday: 1, topic: 'Wahrnehmung', startTime: '16:00', endTime: '17:30',
    };
    expect(sessionsForDate(tuesday, [rule], [], collections)).toHaveLength(0);
  });

  it('unterdrückt ein einzelnes Vorkommen über skipDates', () => {
    const monday = new Date(2026, 7, 3);
    const rule: RecurringStudySession = {
      id: 'r1', weekday: 1, topic: 'Wahrnehmung', startTime: '16:00', endTime: '17:30',
      skipDates: [toDateStr(monday)],
    };
    expect(sessionsForDate(monday, [rule], [], collections)).toHaveLength(0);
  });

  it('zeigt eine einmalige Session nur am exakten Datum', () => {
    const s: CalendarStudySession = {
      id: 's1', date: '2026-08-12', topic: 'Klausurvorbereitung', startTime: '10:00', endTime: '11:00', customSubject: 'Statistik',
    };
    expect(sessionsForDate(new Date(2026, 7, 12), [], [s], collections)).toHaveLength(1);
    expect(sessionsForDate(new Date(2026, 7, 13), [], [s], collections)).toHaveLength(0);
  });

  it('sortiert mehrere Sessions am selben Tag nach Startzeit', () => {
    const monday = new Date(2026, 7, 3);
    const rule: RecurringStudySession = { id: 'r1', weekday: 1, topic: 'Spät', startTime: '18:00', endTime: '19:00' };
    const oneOff: CalendarStudySession = { id: 's1', date: toDateStr(monday), topic: 'Früh', startTime: '09:00', endTime: '10:00' };
    const result = sessionsForDate(monday, [rule], [oneOff], collections);
    expect(result.map(r => r.topic)).toEqual(['Früh', 'Spät']);
  });
});

describe('applySessionSave', () => {
  const genId = () => 'new-id';
  const dateStr = '2026-08-03';
  const weekday = 1;

  it('legt eine neue einmalige Session an', () => {
    const res = applySessionSave(
      { topic: 'Wahrnehmung', startTime: '16:00', endTime: '17:00', repeat: 'once', moduleId: 'psych' },
      dateStr, weekday, [], [], genId
    );
    expect(res.oneOff).toHaveLength(1);
    expect(res.oneOff[0].date).toBe(dateStr);
    expect(res.recurring).toHaveLength(0);
  });

  it('legt eine neue wöchentliche Regel an', () => {
    const res = applySessionSave(
      { topic: 'Wahrnehmung', startTime: '16:00', endTime: '17:00', repeat: 'weekly', moduleId: 'psych' },
      dateStr, weekday, [], [], genId
    );
    expect(res.recurring).toHaveLength(1);
    expect(res.recurring[0].weekday).toBe(weekday);
    expect(res.oneOff).toHaveLength(0);
  });

  it('aktualisiert eine bestehende Regel in place, wenn wöchentlich bearbeitet wird', () => {
    const existing: RecurringStudySession = { id: 'r1', weekday, topic: 'Alt', startTime: '16:00', endTime: '17:00' };
    const res = applySessionSave(
      { topic: 'Neu', startTime: '16:00', endTime: '17:00', repeat: 'weekly', editing: { kind: 'recurring', ruleId: 'r1' } },
      dateStr, weekday, [existing], [], genId
    );
    expect(res.recurring).toHaveLength(1);
    expect(res.recurring[0].topic).toBe('Neu');
    expect(res.recurring[0].id).toBe('r1');
  });

  it('reduziert ein wiederkehrendes Vorkommen auf "nur dieser Tag": skip + Override-Eintrag', () => {
    const existing: RecurringStudySession = { id: 'r1', weekday, topic: 'Alt', startTime: '16:00', endTime: '17:00' };
    const res = applySessionSave(
      { topic: 'Nur heute anders', startTime: '16:00', endTime: '17:00', repeat: 'once', editing: { kind: 'recurring', ruleId: 'r1' } },
      dateStr, weekday, [existing], [], genId
    );
    expect(res.recurring[0].skipDates).toEqual([dateStr]);
    expect(res.oneOff).toHaveLength(1);
    expect(res.oneOff[0].topic).toBe('Nur heute anders');
    expect(res.oneOff[0].date).toBe(dateStr);
  });

  it('bearbeitet einen bestehenden einmaligen Eintrag in place', () => {
    const existing: CalendarStudySession = { id: 's1', date: dateStr, topic: 'Alt', startTime: '16:00', endTime: '17:00' };
    const res = applySessionSave(
      { topic: 'Neu', startTime: '16:30', endTime: '17:30', repeat: 'once', editing: { kind: 'oneoff', id: 's1' } },
      dateStr, weekday, [], [existing], genId
    );
    expect(res.oneOff).toHaveLength(1);
    expect(res.oneOff[0].topic).toBe('Neu');
    expect(res.oneOff[0].startTime).toBe('16:30');
  });

  it('macht aus einem einmaligen Eintrag eine wöchentliche Regel, wenn beim Bearbeiten auf wöchentlich umgeschaltet wird', () => {
    const existing: CalendarStudySession = { id: 's1', date: dateStr, topic: 'Alt', startTime: '16:00', endTime: '17:00' };
    const res = applySessionSave(
      { topic: 'Alt', startTime: '16:00', endTime: '17:00', repeat: 'weekly', editing: { kind: 'oneoff', id: 's1' } },
      dateStr, weekday, [], [existing], genId
    );
    expect(res.recurring).toHaveLength(1);
    expect(res.oneOff).toHaveLength(0);
  });
});
