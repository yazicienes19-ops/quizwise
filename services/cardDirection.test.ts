import { describe, it, expect, beforeEach } from 'vitest';
import { getCardDirection, setCardDirection, isReversed } from './cardDirection';

describe('cardDirection', () => {
  beforeEach(() => localStorage.clear());

  it('startet normal und merkt sich die Wahl', () => {
    expect(getCardDirection()).toBe('normal');
    setCardDirection('mixed');
    expect(getCardDirection()).toBe('mixed');
  });

  it('dreht bei normal nie, bei umgekehrt immer', () => {
    expect(isReversed('abc', 'normal')).toBe(false);
    expect(isReversed('abc', 'reverse')).toBe(true);
  });

  it('mischt stabil je Karte und etwa zur Hälfte', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `card-${i}-${i * 7}`);
    expect(ids.map(id => isReversed(id, 'mixed'))).toEqual(ids.map(id => isReversed(id, 'mixed')));
    const share = ids.filter(id => isReversed(id, 'mixed')).length / ids.length;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
  });
});
