import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordActivity, getStreak } from './streakService';

beforeEach(() => {
  localStorage.clear();
});

describe('recordActivity', () => {
  it('startet Streak bei erster Aktivität', () => {
    const result = recordActivity();
    expect(result.current).toBe(1);
    expect(result.best).toBe(1);
    expect(result.lastDay).toBeTruthy();
  });

  it('ist idempotent am gleichen Tag', () => {
    recordActivity();
    const result = recordActivity();
    expect(result.current).toBe(1);
  });

  it('erhöht Streak bei aufeinanderfolgenden Tagen', () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    localStorage.setItem('quizwise_streak', JSON.stringify({
      current: 3, best: 5, lastDay: yStr,
    }));

    const result = recordActivity();
    expect(result.current).toBe(4);
    expect(result.best).toBe(5);
  });

  it('resettet Streak nach Lücke', () => {
    localStorage.setItem('quizwise_streak', JSON.stringify({
      current: 10, best: 10, lastDay: '2020-01-01',
    }));

    const result = recordActivity();
    expect(result.current).toBe(1);
    expect(result.best).toBe(10);
  });
});

describe('getStreak', () => {
  it('gibt todayDone=false wenn heute nichts passiert ist', () => {
    const result = getStreak();
    expect(result.todayDone).toBe(false);
    expect(result.current).toBe(0);
  });

  it('gibt todayDone=true nach recordActivity', () => {
    recordActivity();
    const result = getStreak();
    expect(result.todayDone).toBe(true);
    expect(result.current).toBe(1);
  });

  it('setzt Streak auf 0 bei gebrochener Streak', () => {
    localStorage.setItem('quizwise_streak', JSON.stringify({
      current: 5, best: 5, lastDay: '2020-01-01',
    }));
    const result = getStreak();
    expect(result.current).toBe(0);
    expect(result.best).toBe(5);
  });
});
