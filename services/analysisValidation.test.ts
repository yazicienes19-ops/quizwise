import { describe, it, expect } from 'vitest';
import { validateLearningAnalysis, RECOMMENDED_ACTION_BY_CAUSE, EMPTY_ANALYSIS } from './analysisValidation';
import type { RawLearningAnalysis } from './analysisValidation';

const realIds = new Set(['e1', 'e2', 'e3', 'e4']);
const sessionOf = new Map([['e1', 's1'], ['e2', 's2'], ['e3', 's1'], ['e4', 's3']]);

const basePattern = {
  pattern: 'Konzeptuelle Lücken', description: 'desc', concepts: ['Halo-Effekt'],
  probableCause: 'weil', causeType: 'concept', sourceErrorIds: ['e1', 'e2'],
  recommendedAction: { type: 'kurze Erklärung', reasoning: 'r' },
};

describe('validateLearningAnalysis', () => {
  it('behält ein Muster mit ≥2 Belegen aus ≥2 verschiedenen Sessions', () => {
    const raw: RawLearningAnalysis = { overallHealth: 'ok', overallHealthErrorIds: ['e1'], errorPatterns: [basePattern] };
    const result = validateLearningAnalysis(raw, realIds, sessionOf);
    expect(result.errorPatterns).toHaveLength(1);
    expect(result.errorPatterns[0].count).toBe(2);
  });

  it('verwirft ein Muster mit nur 1 Beleg, auch wenn das Modell eine höhere Zahl behauptet', () => {
    const raw: RawLearningAnalysis = {
      overallHealth: 'ok', overallHealthErrorIds: [],
      errorPatterns: [{ ...basePattern, sourceErrorIds: ['e1'] }],
    };
    expect(validateLearningAnalysis(raw, realIds, sessionOf).errorPatterns).toEqual([]);
  });

  it('verwirft ein Muster mit 2 Belegen aus DERSELBEN Session (Mindest-Sessions-Regel)', () => {
    // e1 und e3 stammen beide aus s1
    const raw: RawLearningAnalysis = {
      overallHealth: 'ok', overallHealthErrorIds: [],
      errorPatterns: [{ ...basePattern, sourceErrorIds: ['e1', 'e3'] }],
    };
    expect(validateLearningAnalysis(raw, realIds, sessionOf).errorPatterns).toEqual([]);
  });

  it('filtert erfundene/nicht existierende Fehler-IDs heraus, statt sie zu übernehmen', () => {
    const raw: RawLearningAnalysis = {
      overallHealth: 'ok', overallHealthErrorIds: [],
      errorPatterns: [{ ...basePattern, sourceErrorIds: ['e1', 'e2', 'erfunden-999'] }],
    };
    const result = validateLearningAnalysis(raw, realIds, sessionOf);
    expect(result.errorPatterns[0].sourceErrorIds).toEqual(['e1', 'e2']);
    expect(result.errorPatterns[0].count).toBe(2); // NICHT 3 — erfundene ID zählt nicht mit
  });

  it('dedupliziert doppelt aufgeführte IDs vor dem Zählen', () => {
    const raw: RawLearningAnalysis = {
      overallHealth: 'ok', overallHealthErrorIds: [],
      errorPatterns: [{ ...basePattern, sourceErrorIds: ['e1', 'e1', 'e2'] }],
    };
    expect(validateLearningAnalysis(raw, realIds, sessionOf).errorPatterns[0].count).toBe(2);
  });

  it('count wird NIE aus einem Modellfeld übernommen — auch wenn die KI ein count-Feld mitschickt, wird es ignoriert', () => {
    const raw = {
      overallHealth: 'ok', overallHealthErrorIds: [],
      errorPatterns: [{ ...basePattern, count: 999, sourceErrorIds: ['e1', 'e2'] }],
    } as unknown as RawLearningAnalysis;
    expect(validateLearningAnalysis(raw, realIds, sessionOf).errorPatterns[0].count).toBe(2);
  });

  it('Mapping gewinnt: type kommt immer aus causeType, nie aus der Modellwahl', () => {
    const raw: RawLearningAnalysis = {
      overallHealth: 'ok', overallHealthErrorIds: [],
      errorPatterns: [{ ...basePattern, causeType: 'recall', recommendedAction: { type: 'kurze Erklärung', reasoning: 'r' } }],
    };
    const p = validateLearningAnalysis(raw, realIds, sessionOf).errorPatterns[0];
    expect(p.recommendedAction.type).toBe(RECOMMENDED_ACTION_BY_CAUSE.recall);
    expect(p.recommendedAction.type).toBe('Erstellung von Karteikarten');
  });

  it('weicht die Modellwahl vom Mapping ab, bleibt sie als secondaryType erhalten', () => {
    const raw: RawLearningAnalysis = {
      overallHealth: 'ok', overallHealthErrorIds: [],
      errorPatterns: [{ ...basePattern, causeType: 'structure', recommendedAction: { type: 'kurze Erklärung', reasoning: 'r' } }],
    };
    const p = validateLearningAnalysis(raw, realIds, sessionOf).errorPatterns[0];
    expect(p.recommendedAction.type).toBe('Start einer geführten Study-Session');
    expect(p.recommendedAction.secondaryType).toBe('kurze Erklärung');
  });

  it('stimmt Modellwahl mit Mapping überein, bleibt secondaryType leer', () => {
    const raw: RawLearningAnalysis = {
      overallHealth: 'ok', overallHealthErrorIds: [],
      errorPatterns: [{ ...basePattern, causeType: 'concept', recommendedAction: { type: 'kurze Erklärung', reasoning: 'r' } }],
    };
    expect(validateLearningAnalysis(raw, realIds, sessionOf).errorPatterns[0].recommendedAction.secondaryType).toBeUndefined();
  });

  it('unbekannter causeType fällt sicher auf "concept" zurück statt zu crashen', () => {
    const raw: RawLearningAnalysis = {
      overallHealth: 'ok', overallHealthErrorIds: [],
      errorPatterns: [{ ...basePattern, causeType: 'irgendwas-erfundenes' }],
    };
    const p = validateLearningAnalysis(raw, realIds, sessionOf).errorPatterns[0];
    expect(p.causeType).toBe('concept');
    expect(p.recommendedAction.type).toBe('kurze Erklärung');
  });

  it('overallHealth ohne gültige Belege wird durch einen ehrlichen Hinweis ersetzt', () => {
    const raw: RawLearningAnalysis = {
      overallHealth: 'Eine erfundene, unbelegte Behauptung.', overallHealthErrorIds: ['nicht-real'],
      errorPatterns: [],
    };
    const result = validateLearningAnalysis(raw, realIds, sessionOf);
    expect(result.overallHealth).not.toBe('Eine erfundene, unbelegte Behauptung.');
    expect(result.overallHealth).toMatch(/noch nicht genug/i);
  });

  it('overallHealth mit gültigen Belegen bleibt erhalten', () => {
    const raw: RawLearningAnalysis = { overallHealth: 'Belegte Aussage.', overallHealthErrorIds: ['e1'], errorPatterns: [] };
    expect(validateLearningAnalysis(raw, realIds, sessionOf).overallHealth).toBe('Belegte Aussage.');
  });

  it('bei komplett leerem realErrorIds-Set (kein Fehler im Pool) bleibt overallHealth unangetastet', () => {
    const raw: RawLearningAnalysis = { overallHealth: 'Nur Konfidenz-Aussage, keine Fehler vorhanden.', overallHealthErrorIds: [], errorPatterns: [] };
    expect(validateLearningAnalysis(raw, new Set(), new Map()).overallHealth).toBe('Nur Konfidenz-Aussage, keine Fehler vorhanden.');
  });

  it('EMPTY_ANALYSIS ist strukturell eine gültige, leere LearningAnalysis', () => {
    expect(EMPTY_ANALYSIS.errorPatterns).toEqual([]);
    expect(typeof EMPTY_ANALYSIS.overallHealth).toBe('string');
  });
});
