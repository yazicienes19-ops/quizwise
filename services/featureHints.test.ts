import { describe, it, expect, beforeEach } from 'vitest';
import { pickResultHint, markHintSeen, isHintSeen } from './featureHints';
import { getFirstMomentPlan, buildLearningPath, getStartTab } from './onboardingFirstMoment';
import { ActiveTab } from '../types';

describe('pickResultHint', () => {
  beforeEach(() => localStorage.clear());

  it('schlägt nach dem ersten Fehler Karteikarten vor, genau einmal', () => {
    expect(pickResultHint(2, 1)).toBe('mistakeCards');
    markHintSeen('mistakeCards');
    expect(isHintSeen('mistakeCards')).toBe(true);
    expect(pickResultHint(2, 1)).toBeNull();
  });

  it('ohne Fehler kein Karteikarten-Hinweis', () => {
    expect(pickResultHint(0, 1)).toBeNull();
  });

  it('schlägt ab dem dritten Quiz eine Probeklausur vor, genau einmal', () => {
    expect(pickResultHint(0, 2)).toBeNull();
    expect(pickResultHint(0, 3)).toBe('practiceExam');
    markHintSeen('practiceExam');
    expect(pickResultHint(0, 5)).toBeNull();
  });

  it('Fehler-Hinweis hat Vorrang, danach kommt die Probeklausur', () => {
    expect(pickResultHint(1, 3)).toBe('mistakeCards');
    markHintSeen('mistakeCards');
    expect(pickResultHint(1, 3)).toBe('practiceExam');
  });
});

describe('getFirstMomentPlan', () => {
  it('Prüfungsangst → Mini-Klausur, Vergessen → Karten, sonst drei Fragen', () => {
    expect(getFirstMomentPlan('exam_confidence')).toEqual({ mode: 'exam', count: 5 });
    expect(getFirstMomentPlan('retention')).toEqual({ mode: 'cards', count: 5 });
    expect(getFirstMomentPlan('understanding')).toEqual({ mode: 'quiz', count: 3 });
    expect(getFirstMomentPlan(undefined)).toEqual({ mode: 'quiz', count: 3 });
  });
});

describe('buildLearningPath', () => {
  it('behält die gewählte Reihenfolge, die erste Wahl ist der Startpunkt', () => {
    const path = buildLearningPath(['retention', 'exam_confidence', 'understanding']);
    expect(path.map(p => p.tab)).toEqual([ActiveTab.CARDS, ActiveTab.EXAM, ActiveTab.RECALL]);
    expect(getStartTab(['retention', 'exam_confidence'])).toBe(ActiveTab.CARDS);
  });

  it('ignoriert alte Probleme ohne Lernweg und fällt auf Quiz zurück', () => {
    expect(buildLearningPath(['effectiveness'])).toEqual([]);
    expect(getStartTab([])).toBe(ActiveTab.QUIZ);
  });
});

describe('isRecentAccount (Onboarding pro Konto)', () => {
  it('neue Konten ja, alte und unbekannte nein', async () => {
    const { isRecentAccount } = await import('../hooks/useAuth');
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(isRecentAccount('2026-10-08T10:00:00Z', now)).toBe(true);
    expect(isRecentAccount('2026-08-01T10:00:00Z', now)).toBe(false);
    expect(isRecentAccount(undefined, now)).toBe(false);
  });
});
