import { describe, it, expect } from 'vitest';
import { ActiveTab, type OnboardingChallenge } from '../types';
import { RECOMMENDATION_BY_CHALLENGE, getRecommendation, buildCombinedRecommendation, MAX_CHALLENGES } from './onboardingRecommendation';

const ALL_CHALLENGES: OnboardingChallenge[] = [
  'understanding', 'structure', 'knowledge_gaps', 'exam_confidence',
  'retention', 'effectiveness', 'motivation', 'unsure',
];

describe('RECOMMENDATION_BY_CHALLENGE', () => {
  it('deckt alle 8 Lernprobleme ab', () => {
    expect(Object.keys(RECOMMENDATION_BY_CHALLENGE).sort()).toEqual([...ALL_CHALLENGES].sort());
  });

  it('jede Empfehlung hat vollständige Keys und einen konsistenten challenge-Wert', () => {
    for (const c of ALL_CHALLENGES) {
      const rec = getRecommendation(c);
      expect(rec.challenge).toBe(c);
      expect(rec.introKey).toMatch(new RegExp(`^onboarding\\.rec\\.${c}\\.intro$`));
      expect(rec.bodyKey).toMatch(new RegExp(`^onboarding\\.rec\\.${c}\\.body$`));
      expect(rec.ctaKey).toMatch(new RegExp(`^onboarding\\.rec\\.${c}\\.cta$`));
      expect(rec.phaseLabelKey).toMatch(new RegExp(`^onboarding\\.rec\\.${c}\\.phase$`));
      expect(rec.primaryTab).toBeTruthy();
    }
  });

  it('bekannte Feature-Zuordnungen (User-bestätigt)', () => {
    expect(getRecommendation('understanding').primaryTab).toBe(ActiveTab.RECALL);
    expect(getRecommendation('structure').primaryTab).toBe(ActiveTab.PLANNER);
    expect(getRecommendation('knowledge_gaps').primaryTab).toBe(ActiveTab.RADAR);
    expect(getRecommendation('exam_confidence').primaryTab).toBe(ActiveTab.EXAM);
    expect(getRecommendation('retention').primaryTab).toBe(ActiveTab.CARDS);
    expect(getRecommendation('effectiveness').primaryTab).toBe(ActiveTab.RADAR);
    expect(getRecommendation('motivation').primaryTab).toBe(ActiveTab.RADAR);
    expect(getRecommendation('unsure').primaryTab).toBe(ActiveTab.QUIZ);
  });
});

describe('buildCombinedRecommendation — 2 Challenges', () => {
  it('Spec-Beispiel: Verstehen + Prüfungssicherheit ergibt Feynman / Quiz(Brücke) / Klausur-Simulation', () => {
    const result = buildCombinedRecommendation(['understanding', 'exam_confidence']);
    expect(result.steps.map(s => s.tab)).toEqual([ActiveTab.RECALL, ActiveTab.QUIZ, ActiveTab.EXAM]);
    expect(result.steps.every(s => s.bodyKey)).toBe(true);
    expect(result.lead.challenge).toBe('understanding');
  });

  it('umgekehrte Priorität (Prüfungssicherheit zuerst) behält dieselbe Phasen-Reihenfolge, aber lead folgt der Priorität', () => {
    const result = buildCombinedRecommendation(['exam_confidence', 'understanding']);
    expect(result.steps.map(s => s.tab)).toEqual([ActiveTab.RECALL, ActiveTab.QUIZ, ActiveTab.EXAM]);
    expect(result.lead.challenge).toBe('exam_confidence');
  });

  it('benachbarte Phasen brauchen keine Brücke (Verstehen + Einschätzen)', () => {
    const result = buildCombinedRecommendation(['understanding', 'knowledge_gaps']);
    expect(result.steps.map(s => s.tab)).toEqual([ActiveTab.RECALL, ActiveTab.RADAR]);
  });

  it('ist "assess" bereits eine der Challenges, wird keine zusätzliche Brücke eingefügt', () => {
    const result = buildCombinedRecommendation(['knowledge_gaps', 'effectiveness']);
    expect(result.steps).toHaveLength(2);
    expect(result.steps.map(s => s.tab)).toEqual([ActiveTab.RADAR, ActiveTab.RADAR]);
  });

  it('identische Phase fällt auf die Einzel-Empfehlung der ersten Challenge zurück', () => {
    const result = buildCombinedRecommendation(['knowledge_gaps', 'unsure']);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].tab).toBe(ActiveTab.RADAR);
    expect(result.lead.challenge).toBe('knowledge_gaps');
  });

  it('nie mehr als 3 Schritte bei 2 Eingaben', () => {
    for (const a of ALL_CHALLENGES) {
      for (const b of ALL_CHALLENGES) {
        if (a === b) continue;
        const result = buildCombinedRecommendation([a, b]);
        expect(result.steps.length).toBeLessThanOrEqual(3);
        expect(result.steps.length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('buildCombinedRecommendation — 3 Challenges', () => {
  it('MAX_CHALLENGES ist 3', () => {
    expect(MAX_CHALLENGES).toBe(3);
  });

  it('3 weit auseinanderliegende Phasen bekommen höchstens EINE Brücke, nicht pro Lücke', () => {
    // understand(0), retain(3), sustain(6) — zwei Lücken >1, aber nur 1 Brücke insgesamt.
    const result = buildCombinedRecommendation(['understanding', 'retention', 'motivation']);
    const bridgeCount = result.steps.filter(s => s.tab === ActiveTab.QUIZ).length;
    expect(bridgeCount).toBeLessThanOrEqual(1);
    expect(result.steps.length).toBeLessThanOrEqual(4);
  });

  it('3 benachbarte Phasen brauchen gar keine Brücke', () => {
    // understand(0), assess(1), plan(2)
    const result = buildCombinedRecommendation(['understanding', 'knowledge_gaps', 'structure']);
    expect(result.steps.map(s => s.tab)).toEqual([ActiveTab.RECALL, ActiveTab.RADAR, ActiveTab.PLANNER]);
  });

  it('3 Challenges mit einer Phasen-Kollision werden auf 2 echte Schritte reduziert', () => {
    // knowledge_gaps und unsure sind beide 'assess' — die zuerst gewählte gewinnt.
    const result = buildCombinedRecommendation(['understanding', 'knowledge_gaps', 'unsure']);
    expect(result.steps.map(s => s.tab)).toEqual([ActiveTab.RECALL, ActiveTab.RADAR]);
  });

  it('lead folgt immer der Auswahl-Priorität (erstes Element), unabhängig von der Phasen-Sortierung', () => {
    const result = buildCombinedRecommendation(['effectiveness', 'understanding', 'exam_confidence']);
    expect(result.lead.challenge).toBe('effectiveness');
  });

  it('jede beliebige 3er-Kombination bleibt zwischen 1 und 4 Schritten, jeder Schritt hat einen bodyKey', () => {
    for (let i = 0; i < ALL_CHALLENGES.length; i++) {
      for (let j = 0; j < ALL_CHALLENGES.length; j++) {
        for (let k = 0; k < ALL_CHALLENGES.length; k++) {
          if (i === j || j === k || i === k) continue;
          const result = buildCombinedRecommendation([ALL_CHALLENGES[i], ALL_CHALLENGES[j], ALL_CHALLENGES[k]]);
          expect(result.steps.length).toBeGreaterThanOrEqual(1);
          expect(result.steps.length).toBeLessThanOrEqual(4);
          expect(result.steps.every(s => !!s.bodyKey)).toBe(true);
        }
      }
    }
  });
});
