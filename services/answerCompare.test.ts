import { describe, it, expect } from 'vitest';
import { compareAnswer } from './answerCompare';

describe('compareAnswer', () => {
  it('ignoriert Groß/Klein, Satzzeichen und Akzente', () => {
    const r = compareAnswer('der hippocampus', 'Der Hippocampus.');
    expect(r.score).toBe(1);
    expect(r.suggestion).toBe('good');
    expect(r.extra).toEqual([]);
  });

  it('markiert fehlende und zusätzliche Wörter', () => {
    const r = compareAnswer('Abnahme der Reaktion bei Reiz immer', 'Abnahme der Reaktion bei wiederholtem Reiz');
    expect(r.expected.filter(s => s.kind === 'missing').map(s => s.text)).toEqual(['wiederholtem']);
    expect(r.extra).toEqual(['immer']);
    expect(r.score).toBeCloseTo(5 / 6);
    expect(r.suggestion).toBe('hard');
  });

  it('schlägt Nochmal vor, wenn wenig stimmt', () => {
    expect(compareAnswer('keine Ahnung', 'Klassische Konditionierung nach Pawlow').suggestion).toBe('again');
    expect(compareAnswer('', 'Pawlow').score).toBe(0);
  });

  it('Reihenfolge zählt über die längste gemeinsame Folge', () => {
    const r = compareAnswer('Pawlow Hund Glocke', 'Glocke Hund Pawlow');
    expect(r.score).toBeCloseTo(1 / 3);
  });
});
