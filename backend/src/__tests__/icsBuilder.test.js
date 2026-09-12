import { describe, it, expect } from 'vitest';
import { buildIcsFeed } from '../utils/icsBuilder.js';

describe('buildIcsFeed', () => {
  it('baut einen leeren, aber gültigen Feed ohne Daten', () => {
    const ics = buildIcsFeed({});
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('Klausurtermine werden als ganztägige Events mit exklusivem DTEND kodiert', () => {
    const ics = buildIcsFeed({ examTerms: [{ id: 'e1', title: 'Statistik', date: '2026-09-20' }] });
    expect(ics).toContain('UID:exam-e1@studearc.com');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260920');
    expect(ics).toContain('DTEND;VALUE=DATE:20260921');
    expect(ics).toContain('SUMMARY:📝 Statistik');
  });

  it('wiederkehrende Sessions bekommen eine wöchentliche RRULE auf dem richtigen Wochentag', () => {
    const ics = buildIcsFeed({
      recurringSessions: [{ id: 'r1', weekday: 3, startTime: '14:00', endTime: '15:30', topic: 'Wiederholung' }],
    });
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE');
    const dtstartLine = ics.split('\r\n').find(l => l.startsWith('DTSTART:'));
    expect(dtstartLine.endsWith('T140000')).toBe(true);
    expect(new Date(
      `${dtstartLine.slice(8, 12)}-${dtstartLine.slice(12, 14)}-${dtstartLine.slice(14, 16)}`,
    ).getUTCDay()).toBe(3);
  });

  it('skipDates vor dem Referenzdatum werden nicht als EXDATE übernommen, spätere schon', () => {
    const ics = buildIcsFeed({
      recurringSessions: [{
        id: 'r1', weekday: 1, startTime: '10:00', endTime: '11:00', topic: 'X',
        startDate: '2026-09-01', skipDates: ['2026-08-01', '2026-09-08'],
      }],
    });
    expect(ics).toContain('EXDATE:20260908T100000');
    expect(ics).not.toContain('20260801');
  });

  it('Fachname wird vorangestellt, wenn moduleId einer Collection entspricht', () => {
    const ics = buildIcsFeed({
      calendarSessions: [{ id: 's1', date: '2026-09-15', startTime: '09:00', endTime: '10:00', topic: 'Ableitungen', moduleId: 'm1' }],
      collections: [{ id: 'm1', name: 'Mathe' }],
    });
    expect(ics).toContain('SUMMARY:Mathe: Ableitungen');
  });

  it('customSubject hat Vorrang vor dem Collection-Namen', () => {
    const ics = buildIcsFeed({
      calendarSessions: [{ id: 's1', date: '2026-09-15', startTime: '09:00', endTime: '10:00', topic: 'X', moduleId: 'm1', customSubject: 'Eigenes Fach' }],
      collections: [{ id: 'm1', name: 'Mathe' }],
    });
    expect(ics).toContain('SUMMARY:Eigenes Fach: X');
  });

  it('escaped RFC-5545-Sonderzeichen in SUMMARY korrekt', () => {
    const ics = buildIcsFeed({
      calendarSessions: [{ id: 's1', date: '2026-09-15', startTime: '09:00', endTime: '10:00', topic: 'A; B, C\\D\nE' }],
    });
    expect(ics).toContain('SUMMARY:A\\; B\\, C\\\\D\\nE');
  });

  it('faltet Zeilen über 75 Oktetten nach RFC 5545', () => {
    const longTopic = 'X'.repeat(120);
    const ics = buildIcsFeed({
      calendarSessions: [{ id: 's1', date: '2026-09-15', startTime: '09:00', endTime: '10:00', topic: longTopic }],
    });
    const lines = ics.split('\r\n');
    const summaryLineIdx = lines.findIndex(l => l.startsWith('SUMMARY:'));
    expect(lines[summaryLineIdx + 1].startsWith(' ')).toBe(true);
    for (const line of lines) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});
