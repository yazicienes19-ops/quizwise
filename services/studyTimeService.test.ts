import { describe, it, expect, beforeEach } from 'vitest';
import { buildStudyDays, getDailyGoal, setDailyGoal, DAILY_GOAL_KEY } from './studyTimeService';

describe('studyTimeService', () => {
  beforeEach(() => localStorage.clear());

  it('füllt 7 Tage lückenlos auf, ältester zuerst, Minuten gerundet', () => {
    const now = new Date('2026-09-23T10:00:00Z');
    const days = buildStudyDays([
      { activity_date: '2026-09-23', active_seconds: 1500 },
      { activity_date: '2026-09-20', active_seconds: 89 },
    ], 7, now);
    expect(days.map(d => d.date)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
    expect(days[6].minutes).toBe(25);
    expect(days[3].minutes).toBe(1);
    expect(days[0].minutes).toBe(0);
  });

  it('Tagesziel: Standard 30, nur erlaubte Werte, gespeichert', () => {
    expect(getDailyGoal()).toBe(30);
    setDailyGoal(60);
    expect(getDailyGoal()).toBe(60);
    localStorage.setItem(DAILY_GOAL_KEY, '7');
    expect(getDailyGoal()).toBe(30);
  });
});
