import { describe, it, expect } from 'vitest';
import {
  sessionsForDate,
  applySessionSave,
  resolveModuleColor,
  toDateStr,
  nextDateForWeekday,
  mapSmartPlanToCalendarSessions,
  buildPlanAvailability,
  normalizeSubjectName,
  matchSubjectToCollection,
  daysUntilDate,
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

  it('zeigt eine wiederkehrende Session NICHT vor ihrem startDate (verhindert rückwirkende Vorkommen)', () => {
    const pastMonday = new Date(2026, 6, 27); // Montag, vor dem startDate
    const rule: RecurringStudySession = {
      id: 'r1', weekday: 1, topic: 'Wahrnehmung', startTime: '16:00', endTime: '17:30',
      startDate: '2026-08-03',
    };
    expect(sessionsForDate(pastMonday, [rule], [], collections)).toHaveLength(0);
  });

  it('zeigt eine wiederkehrende Session AB ihrem startDate (inklusive)', () => {
    const startMonday = new Date(2026, 7, 3);
    const rule: RecurringStudySession = {
      id: 'r1', weekday: 1, topic: 'Wahrnehmung', startTime: '16:00', endTime: '17:30',
      startDate: '2026-08-03',
    };
    expect(sessionsForDate(startMonday, [rule], [], collections)).toHaveLength(1);
  });

  it('zeigt eine wiederkehrende Session OHNE startDate weiterhin für jeden passenden Wochentag (Rückwärtskompatibilität für Altbestand)', () => {
    const pastMonday = new Date(2026, 6, 27);
    const rule: RecurringStudySession = { id: 'r1', weekday: 1, topic: 'Wahrnehmung', startTime: '16:00', endTime: '17:30' };
    expect(sessionsForDate(pastMonday, [rule], [], collections)).toHaveLength(1);
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

  it('setzt startDate der neuen wöchentlichen Regel auf den angeklickten Tag (verhindert rückwirkende Vorkommen)', () => {
    const res = applySessionSave(
      { topic: 'Wahrnehmung', startTime: '16:00', endTime: '17:00', repeat: 'weekly', moduleId: 'psych' },
      dateStr, weekday, [], [], genId
    );
    expect(res.recurring[0].startDate).toBe(dateStr);
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

describe('nextDateForWeekday', () => {
  it('gibt heute zurück, wenn heute schon der gesuchte Wochentag ist', () => {
    const monday = new Date(2026, 7, 3); // Montag
    expect(toDateStr(nextDateForWeekday(monday, 1))).toBe('2026-08-03');
  });
  it('springt auf den nächsten passenden Wochentag in dieser Woche', () => {
    const monday = new Date(2026, 7, 3);
    expect(toDateStr(nextDateForWeekday(monday, 3))).toBe('2026-08-05'); // Mittwoch derselben Woche
  });
  it('springt in die nächste Woche, wenn der Wochentag diese Woche schon vorbei ist', () => {
    const wednesday = new Date(2026, 7, 5);
    expect(toDateStr(nextDateForWeekday(wednesday, 1))).toBe('2026-08-10'); // nächster Montag
  });
});

describe('buildPlanAvailability', () => {
  // Montag, 03.08.2026
  const mondayMorning = new Date(2026, 7, 3, 6, 0);

  it('liefert 7 Tage mit 08 bis 20 Uhr, wenn nichts belegt ist', () => {
    const av = buildPlanAvailability(mondayMorning, [], [], collections);
    expect(av).toHaveLength(7);
    expect(av[0]).toEqual({ date: '2026-08-03', day: 'Montag', free: [{ start: 480, end: 1200 }] });
    expect(av[6].day).toBe('Sonntag');
  });

  it('beginnt heute frühestens 30 Minuten nach jetzt, auf die Viertelstunde gerundet', () => {
    const av = buildPlanAvailability(new Date(2026, 7, 3, 14, 5), [], [], collections);
    expect(av[0].free).toEqual([{ start: 14 * 60 + 45, end: 1200 }]);
    expect(av[1].free).toEqual([{ start: 480, end: 1200 }]);
  });

  it('hat heute keinen Platz mehr, wenn es schon 19:30 ist', () => {
    const av = buildPlanAvailability(new Date(2026, 7, 3, 19, 30), [], [], collections);
    expect(av[0].free).toEqual([]);
  });

  it('sperrt nur die Zeit der festen Einheit samt 15 Minuten Abstand, nicht den ganzen Tag', () => {
    const rule: RecurringStudySession = { id: 'r1', weekday: 1, moduleId: 'psych', topic: 'x', startTime: '17:00', endTime: '18:00' };
    const av = buildPlanAvailability(mondayMorning, [rule], [], collections);
    expect(av[0].free).toEqual([{ start: 480, end: 16 * 60 + 45 }, { start: 18 * 60 + 15, end: 1200 }]);
  });

  it('sperrt manuelle Einträge, aber nicht alte Smart-Plan-Einträge (die werden ersetzt)', () => {
    const manual: CalendarStudySession = { id: 'm', date: '2026-08-04', topic: 't', startTime: '12:30', endTime: '14:00' };
    const oldPlan: CalendarStudySession = { id: 'p', date: '2026-08-04', topic: 't', startTime: '09:00', endTime: '10:00', fromSmartPlan: true };
    const av = buildPlanAvailability(mondayMorning, [], [manual, oldPlan], collections);
    expect(av[1].free).toEqual([{ start: 480, end: 12 * 60 + 15 }, { start: 14 * 60 + 15, end: 1200 }]);
  });
});

describe('Fächer zuordnen', () => {
  it('normalisiert römische Zahlen, Satzzeichen und Groß-/Kleinschreibung', () => {
    expect(normalizeSubjectName('Statistik I')).toBe(normalizeSubjectName('statistik 1'));
    expect(normalizeSubjectName('Statistik-II.')).toBe('statistik 2');
    expect(normalizeSubjectName('Statistik I')).not.toBe(normalizeSubjectName('Statistik II'));
  });

  it('findet das Modul trotz anderer Schreibweise, verwechselt aber I und II nicht', () => {
    const stat1: Collection = { id: 's1', name: 'Statistik I', emoji: '', color: '' };
    const stat2: Collection = { id: 's2', name: 'Statistik II', emoji: '', color: '' };
    expect(matchSubjectToCollection('statistik 1', [stat1, stat2])?.id).toBe('s1');
    expect(matchSubjectToCollection('Statistik 2', [stat1, stat2])?.id).toBe('s2');
    expect(matchSubjectToCollection('Statistik', [stat1, stat2])).toBeUndefined();
  });

  it('nimmt bei mehrdeutigem Treffer kein Modul', () => {
    const a: Collection = { id: 'a', name: 'Statistik 1', emoji: '', color: '' };
    const b: Collection = { id: 'b', name: 'Statistik I', emoji: '', color: '' };
    expect(matchSubjectToCollection('Statistik-1', [a, b])).toBeUndefined();
    expect(matchSubjectToCollection('STATISTIK 1', [a, b])?.id).toBe('a');
  });
});

describe('mapSmartPlanToCalendarSessions', () => {
  const mondayMorning = new Date(2026, 7, 3, 6, 0);
  const genId = (() => { let n = 0; return () => `id-${n++}`; })();
  const free = () => buildPlanAvailability(mondayMorning, [], [], collections);

  it('bildet Wochentag-Namen auf konkrete Daten ab und gleicht das Fach gegen ein Modul ab', () => {
    const result = mapSmartPlanToCalendarSessions(
      [{ day: 'Mittwoch', subject: 'Allgemeine Psychologie 1', topic: 'Wahrnehmung', startTime: '10:00', endTime: '11:00' }],
      free(), collections, genId
    );
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-08-05');
    expect(result[0].moduleId).toBe('psych');
    expect(result[0].customSubject).toBeUndefined();
    expect(result[0].fromSmartPlan).toBe(true);
  });

  it('nutzt das mitgelieferte Datum, wenn es im Planungszeitraum liegt', () => {
    const result = mapSmartPlanToCalendarSessions(
      [{ day: 'Montag', date: '2026-08-06', subject: 'x', topic: 'x', startTime: '10:00', endTime: '11:00' }],
      free(), collections, genId
    );
    expect(result[0].date).toBe('2026-08-06');
  });

  it('nutzt customSubject, wenn kein Modul mit passendem Namen existiert', () => {
    const result = mapSmartPlanToCalendarSessions(
      [{ day: 'Freitag', subject: 'Unbekanntes Fach', topic: 'x', startTime: '10:00', endTime: '11:00' }],
      free(), collections, genId
    );
    expect(result[0].moduleId).toBeUndefined();
    expect(result[0].customSubject).toBe('Unbekanntes Fach');
  });

  it('verschiebt einen Block, der in eine feste Einheit fällt, statt den Tag zu sperren', () => {
    const rule: RecurringStudySession = { id: 'r1', weekday: 1, moduleId: 'psych', topic: 'x', startTime: '17:00', endTime: '18:00' };
    const av = buildPlanAvailability(mondayMorning, [rule], [], collections);
    const result = mapSmartPlanToCalendarSessions(
      [{ day: 'Montag', subject: 'Statistik', topic: 'y', startTime: '16:30', endTime: '18:00' }],
      av, collections, genId
    );
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-08-03');
    expect([result[0].startTime, result[0].endTime]).toEqual(['18:15', '19:45']);
  });

  it('legt Blöcke von heute nicht in die Vergangenheit', () => {
    const av = buildPlanAvailability(new Date(2026, 7, 3, 15, 0), [], [], collections);
    const result = mapSmartPlanToCalendarSessions(
      [{ day: 'Montag', subject: 'x', topic: 'x', startTime: '08:00', endTime: '10:00' }],
      av, collections, genId
    );
    expect(result[0].date).toBe('2026-08-03');
    expect(result[0].startTime).toBe('15:30');
  });

  it('verwirft einen Block, wenn der Tag voll ist', () => {
    const av = buildPlanAvailability(new Date(2026, 7, 3, 19, 30), [], [], collections);
    const result = mapSmartPlanToCalendarSessions(
      [{ day: 'Montag', subject: 'x', topic: 'x', startTime: '19:00', endTime: '20:00' }],
      av, collections, genId
    );
    expect(result).toEqual([]);
  });

  it('bringt die Dauer auf 60 bis 120 Minuten und verhindert Überschneidungen der eigenen Blöcke', () => {
    const result = mapSmartPlanToCalendarSessions(
      [
        { day: 'Dienstag', subject: 'a', topic: 'a', startTime: '09:00', endTime: '09:20' },
        { day: 'Dienstag', subject: 'b', topic: 'b', startTime: '09:30', endTime: '13:00' },
      ],
      free(), collections, genId
    );
    expect(result.map(r => [r.startTime, r.endTime])).toEqual([['09:00', '10:00'], ['10:15', '12:15']]);
  });

  it('plant höchstens 3 Blöcke pro Tag und ignoriert unbekannte Tage', () => {
    const entries = ['08:00', '10:30', '13:00', '15:30'].map(t => ({ day: 'Dienstag', subject: 's', topic: 't', startTime: t, endTime: t.replace(/^(\d+)/, h => String(Number(h) + 1).padStart(2, '0')) }));
    const result = mapSmartPlanToCalendarSessions([...entries, { day: 'Feiertag', subject: 's', topic: 't', startTime: '10:00', endTime: '11:00' }], free(), collections, genId);
    expect(result).toHaveLength(3);
  });
});

describe('daysUntilDate (Liste-Ansicht Off-by-one-Fix)', () => {
  it('Termin HEUTE ergibt 0, egal ob vormittags oder abends geöffnet', () => {
    const morning = new Date(2026, 6, 25, 8, 0, 0);
    const evening = new Date(2026, 6, 25, 20, 0, 0);
    expect(daysUntilDate('2026-07-25', morning)).toBe(0);
    expect(daysUntilDate('2026-07-25', evening)).toBe(0);
  });

  it('Termin MORGEN ergibt 1, egal ob vormittags oder abends geöffnet (alte Formel lieferte hier 2 am Vormittag)', () => {
    const morning = new Date(2026, 6, 25, 8, 0, 0);
    const evening = new Date(2026, 6, 25, 20, 0, 0);
    expect(daysUntilDate('2026-07-26', morning)).toBe(1);
    expect(daysUntilDate('2026-07-26', evening)).toBe(1);
  });

  it('ein vergangenes Datum ergibt einen negativen Wert', () => {
    const now = new Date(2026, 6, 25, 12, 0, 0);
    expect(daysUntilDate('2026-07-24', now)).toBe(-1);
  });
});
