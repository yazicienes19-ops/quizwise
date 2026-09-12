import { describe, it, expect } from 'vitest';
import { mapSmartPlanToCalendarSessions, replaceSmartPlanSessions } from './calendarSessions';
import type { CalendarStudySession } from '../types';

const session = (id: string, date: string, fromSmartPlan?: boolean): CalendarStudySession => ({
  id, date, topic: 'T', startTime: '10:00', endTime: '11:00', ...(fromSmartPlan ? { fromSmartPlan } : {}),
});

describe('Smart-Plan: ersetzen statt verdoppeln', () => {
  it('markiert Sessions aus dem Smart-Plan', () => {
    let n = 0;
    const mapped = mapSmartPlanToCalendarSessions(
      [{ day: 'Montag', subject: 'Psychologie', topic: 'Lernen', startTime: '10:00', endTime: '11:00' } as any],
      new Date(2026, 8, 12), [], [], () => `id${n++}`,
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0].fromSmartPlan).toBe(true);
  });

  it('ersetzt künftige Smart-Plan-Sessions, behält manuelle und vergangene', () => {
    const existing = [
      session('alt-zukunft', '2026-09-14', true),
      session('alt-heute', '2026-09-12', true),
      session('alt-vergangen', '2026-09-01', true),
      session('manuell', '2026-09-14'),
    ];
    const planned = [session('neu', '2026-09-14', true)];
    const { sessions, replaced } = replaceSmartPlanSessions(existing, planned, '2026-09-12');
    expect(replaced).toBe(2);
    expect(sessions.map(s => s.id).sort()).toEqual(['alt-vergangen', 'manuell', 'neu']);
  });

  it('zweimal hintereinander planen ergibt keine Duplikate', () => {
    const plan = [session('a', '2026-09-14', true), session('b', '2026-09-15', true)];
    const first = replaceSmartPlanSessions([], plan, '2026-09-12').sessions;
    const second = replaceSmartPlanSessions(first, plan.map(s => ({ ...s, id: s.id + '2' })), '2026-09-12').sessions;
    expect(second).toHaveLength(2);
  });
});
