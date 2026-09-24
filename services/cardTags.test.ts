import { describe, it, expect } from 'vitest';
import { parseTags, formatTags, collectTags, hasTag, MAX_TAGS } from './cardTags';

describe('cardTags', () => {
  it('zerlegt, säubert und entdoppelt Eingaben', () => {
    expect(parseTags('Halo, #Wahrnehmung;  halo ,\n  Sozial   Psychologie ,')).toEqual(['Halo', 'Wahrnehmung', 'Sozial Psychologie']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(','))).toHaveLength(MAX_TAGS);
  });

  it('formatiert für das Eingabefeld', () => {
    expect(formatTags(['a', 'b'])).toBe('a, b');
    expect(formatTags(undefined)).toBe('');
  });

  it('zählt Schlagwörter ohne Rücksicht auf Groß/Klein', () => {
    const cards = [{ tags: ['Halo', 'Asch'] }, { tags: ['halo'] }, {}];
    expect(collectTags(cards)).toEqual([{ tag: 'Halo', count: 2 }, { tag: 'Asch', count: 1 }]);
    expect(hasTag(cards[1], 'HALO')).toBe(true);
    expect(hasTag(cards[2], 'Halo')).toBe(false);
  });
});
