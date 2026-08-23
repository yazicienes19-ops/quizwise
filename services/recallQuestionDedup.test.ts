import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeQuestion, questionSimilarity, isQuestionTooSimilar,
  rememberRecallQuestion, getRecentRecallQuestions, DUPLICATE_THRESHOLD,
} from './recallQuestionDedup';

// Die zwei Fragen aus dem echten Browser-Live-Test (2026-08-22), die den
// Dedup-Bug offenbachten — nahezu identisch ausgeliefert:
const LIVE_Q1 = 'Warum ist der Fokus auf beobachtbares Verhalten im Behaviorismus entscheidend für die Ablehnung innerer mentaler Zustände, und wie lässt sich dies auf die wissenschaftliche Betrachtung von Verhaltensänderungen übertragen?';
const LIVE_Q2 = 'Warum ist die Konzentration auf beobachtbares Verhalten für das Verständnis psychologischer Prozesse laut dem Behaviorismus entscheidend und wie grenzt sich dies von der Betrachtung innerer mentaler Zustände ab?';
const OTHER_Q = 'Erkläre, was bei der operanten Konditionierung der Unterschied zwischen Verstärkung und Bestrafung ist und nenne je ein Beispiel.';

describe('normalizeQuestion', () => {
  it('macht Kleinbuchstaben, strippt Satzzeichen, kollabiert Whitespace', () => {
    expect(normalizeQuestion('  Warum, ist   das-so??   „Konditionierung!“  ')).toBe('warum ist das so konditionierung');
  });
});

describe('questionSimilarity', () => {
  it('exakte Frage → 1', () => {
    expect(questionSimilarity(LIVE_Q1, LIVE_Q1)).toBe(1);
  });

  it('LIVE-Fund: die zwei Behaviorismus-Fragen sind zu ähnlich (>= Threshold)', () => {
    const sim = questionSimilarity(LIVE_Q1, LIVE_Q2);
    expect(sim).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it('thematisch andere Frage liegt klar unter dem Threshold', () => {
    expect(questionSimilarity(LIVE_Q1, OTHER_Q)).toBeLessThan(DUPLICATE_THRESHOLD);
  });

  it('reine Umformulierung (gleiche Wörter, andere Reihenfolge) wird erkannt', () => {
    const a = 'Erkläre die klassische Konditionierung nach Pawlow mit einem Beispiel.';
    const b = 'Was ist klassische Konditionierung? Erkläre Pawlows Experiment mit Beispiel.';
    expect(questionSimilarity(a, b)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });
});

describe('isQuestionTooSimilar', () => {
  it('erkennt Duplikat in der Recent-Liste', () => {
    expect(isQuestionTooSimilar(LIVE_Q2, [LIVE_Q1])).toBe(true);
    expect(isQuestionTooSimilar(OTHER_Q, [LIVE_Q1])).toBe(false);
  });

  it('leere Eingaben sind nie "zu ähnlich"', () => {
    expect(isQuestionTooSimilar('', [LIVE_Q1])).toBe(false);
    expect(isQuestionTooSimilar(LIVE_Q1, ['   '])).toBe(false);
  });
});

describe('Recent-Questions-Ringpuffer', () => {
  beforeEach(() => localStorage.clear());

  it('speichert, liefert zurück und kappt auf 20 Einträge (neueste zuerst)', () => {
    rememberRecallQuestion('Frage A');
    rememberRecallQuestion('Frage B');
    expect(getRecentRecallQuestions()).toEqual(['Frage B', 'Frage A']);

    for (let i = 0; i < 25; i++) rememberRecallQuestion(`Frage Nummer ${i}`);
    const all = getRecentRecallQuestions();
    expect(all).toHaveLength(20);
    expect(all[0]).toBe('Frage Nummer 24');
    expect(all).not.toContain('Frage A');
  });

  it('ignoriert korruptes localStorage', () => {
    localStorage.setItem('studearc_recall_recent_questions', 'nicht json{');
    expect(getRecentRecallQuestions()).toEqual([]);
  });
});
