import { describe, it, expect, beforeEach } from 'vitest';
import {
  startFocus, pauseFocus, resumeFocus, stopFocus, readFocus, remainingMs,
  clampFocusMinutes, getCustomFocusMinutes, setCustomFocusMinutes, FOCUS_MAX_MINUTES,
} from './focusTimer';

describe('focusTimer', () => {
  beforeEach(() => localStorage.clear());

  it('läuft, pausiert mit gemerkter Restzeit und läuft weiter', () => {
    startFocus(25, 0);
    expect(remainingMs(readFocus()!, 60_000)).toBe(24 * 60_000);
    pauseFocus(60_000);
    expect(readFocus()).toEqual({ status: 'paused', remainingMs: 24 * 60_000, minutes: 25 });
    expect(remainingMs(readFocus()!, 999_999)).toBe(24 * 60_000);
    resumeFocus(100_000);
    expect(remainingMs(readFocus()!, 100_000)).toBe(24 * 60_000);
  });

  it('stoppt und fällt nie unter null', () => {
    startFocus(15, 0);
    expect(remainingMs(readFocus()!, 99 * 60_000)).toBe(0);
    stopFocus();
    expect(readFocus()).toBeNull();
  });

  it('eigene Dauer: begrenzt, gerundet und gemerkt', () => {
    expect(clampFocusMinutes(0)).toBe(1);
    expect(clampFocusMinutes(999)).toBe(FOCUS_MAX_MINUTES);
    expect(clampFocusMinutes(37.6)).toBe(38);
    expect(clampFocusMinutes(Number.NaN)).toBe(30);
    expect(getCustomFocusMinutes()).toBe(30);
    expect(setCustomFocusMinutes(50)).toBe(50);
    expect(getCustomFocusMinutes()).toBe(50);
    startFocus(getCustomFocusMinutes(), 0);
    expect(remainingMs(readFocus()!, 0)).toBe(50 * 60_000);
  });
});
