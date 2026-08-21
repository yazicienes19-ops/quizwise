import { describe, it, expect, beforeEach } from 'vitest';
import { track, getAnalyticsEvents, trackSessionStart } from './analyticsService';

describe('analyticsService', () => {
  beforeEach(() => localStorage.clear());

  it('nimmt Events mit Zeitstempel auf', () => {
    track('paywall_view', { source: 'sidebar' });
    const all = getAnalyticsEvents();
    expect(all).toHaveLength(1);
    expect(all[0].event).toBe('paywall_view');
    expect(all[0].props).toEqual({ source: 'sidebar' });
    expect(all[0].timestamp).toBeGreaterThan(0);
  });

  it('once-Events feuern nur einmal, normale jedes Mal', () => {
    track('first_quiz', undefined, true);
    track('first_quiz', undefined, true);
    expect(getAnalyticsEvents().filter(e => e.event === 'first_quiz')).toHaveLength(1);
    track('quiz_complete');
    track('quiz_complete');
    expect(getAnalyticsEvents().filter(e => e.event === 'quiz_complete')).toHaveLength(2);
  });

  it('day_1_return nur ab 24h nach Erstnutzung und nur einmal', () => {
    trackSessionStart(); // Erstnutzung jetzt
    expect(getAnalyticsEvents().some(e => e.event === 'day_1_return')).toBe(false);

    localStorage.clear();
    const yesterday = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem('studearc_analytics_first_seen', String(yesterday));
    trackSessionStart();
    trackSessionStart();
    const returns = getAnalyticsEvents().filter(e => e.event === 'day_1_return');
    expect(returns).toHaveLength(1);
    expect(returns[0].props?.days).toBeGreaterThanOrEqual(1);
  });

  it('day_7_return feuert zusammen mit day_1_return bei 8 Tagen Abstinenz', () => {
    localStorage.setItem('studearc_analytics_first_seen', String(Date.now() - 8 * 24 * 60 * 60 * 1000));
    trackSessionStart();
    expect(getAnalyticsEvents().some(e => e.event === 'day_7_return')).toBe(true);
  });
});
