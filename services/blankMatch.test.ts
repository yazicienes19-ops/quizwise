import { describe, it, expect } from 'vitest';
import { matchBlank } from './blankMatch';

// Volle Testabdeckung der Toleranzregel liegt bereits in examScoring.test.ts
// (matchBlank wird von dort re-exportiert) — hier nur ein direkter Smoke-Test
// des Moduls selbst, damit die Utility auch unabhängig von examScoring geprüft ist.
describe('matchBlank (direkt, für QuizPlayer.tsx-Nutzung)', () => {
  it('exakte Übereinstimmung', () => {
    expect(matchBlank('Reiz', 'Reiz')).toBe('exact');
  });

  it('ein Tippfehler in einem längeren Wort wird toleriert', () => {
    expect(matchBlank('Konditionirung', 'Konditionierung')).toBe('tolerant');
  });

  it('komplett falsches Wort zählt als none', () => {
    expect(matchBlank('Apfel', 'Konditionierung')).toBe('none');
  });
});
