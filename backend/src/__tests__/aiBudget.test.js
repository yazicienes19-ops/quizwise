import { describe, it, expect } from 'vitest';
import { costOfUsage, priceFor, MODEL_LITE, MODEL_HEAVY } from '../config/geminiModels.js';
import { evaluateBudget, currentMonth, DEFAULT_SETTINGS } from '../budget/aiBudget.js';

describe('costOfUsage (Kosten aus usageMetadata)', () => {
  it('rechnet Input und Output inkl. Thinking zum Listenpreis', () => {
    const usage = { promptTokenCount: 1_000_000, candidatesTokenCount: 500_000, thoughtsTokenCount: 500_000 };
    expect(costOfUsage(MODEL_LITE, usage)).toBeCloseTo(0.30 + 2.50, 6);
  });

  it('3.8 Flash verdoppelt sich zum 01.01.2027', () => {
    const usage = { promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 };
    expect(costOfUsage(MODEL_HEAVY, usage, { date: new Date('2026-12-31T12:00:00Z') })).toBeCloseTo(4.50, 6);
    expect(costOfUsage(MODEL_HEAVY, usage, { date: new Date('2027-01-01T12:00:00Z') })).toBeCloseTo(9.00, 6);
  });

  it('Google-Suche kostet pro Anfrage extra', () => {
    expect(costOfUsage(MODEL_LITE, {}, { searches: 1 })).toBeCloseTo(0.014, 6);
  });

  it('unbekanntes Modell wird zum teuersten bekannten Preis gerechnet', () => {
    const date = new Date('2026-10-01T00:00:00Z');
    expect(priceFor('gemini-9-ultra', date)).toEqual({ input: 0.75, output: 3.75 });
  });

  it('fehlende usageMetadata kostet nichts', () => {
    expect(costOfUsage(MODEL_HEAVY, undefined)).toBe(0);
  });
});

describe('evaluateBudget (Stufen je Deckel)', () => {
  const settings = { ...DEFAULT_SETTINGS }; // 20 € global, 5 € Pro, 1 € Free, 80 %

  it('unter 80 % läuft alles normal', () => {
    expect(evaluateBudget({ userCostEur: 3.99, globalCostEur: 15.99, plan: 'pro', settings }))
      .toEqual({ level: 'ok', scope: null });
  });

  it('ab 80 % des Nutzerdeckels: Sparmodus für diesen Nutzer', () => {
    expect(evaluateBudget({ userCostEur: 4, globalCostEur: 1, plan: 'pro', settings }))
      .toEqual({ level: 'soft', scope: 'user' });
  });

  it('Free-Nutzer haben ihren eigenen, kleineren Deckel', () => {
    expect(evaluateBudget({ userCostEur: 1, globalCostEur: 1, plan: 'free', settings }))
      .toEqual({ level: 'hard', scope: 'user' });
  });

  it('der globale Deckel gilt für alle und hat Vorrang, wenn er strenger ist', () => {
    expect(evaluateBudget({ userCostEur: 0, globalCostEur: 20, plan: 'pro', settings }))
      .toEqual({ level: 'hard', scope: 'global' });
    expect(evaluateBudget({ userCostEur: 4.5, globalCostEur: 20, plan: 'pro', settings }))
      .toEqual({ level: 'hard', scope: 'global' });
  });

  it('Deckel 0 € sperrt sofort', () => {
    expect(evaluateBudget({ userCostEur: 0, globalCostEur: 0, plan: 'free', settings: { ...settings, free_user_monthly_eur: 0 } }).level)
      .toBe('hard');
  });
});

describe('currentMonth (Monatswechsel nach deutscher Zeit)', () => {
  it('31.10. 23:30 UTC ist in Berlin schon November', () => {
    expect(currentMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11');
  });
  it('30.09. 21:00 UTC ist in Berlin noch September', () => {
    expect(currentMonth(new Date('2026-09-30T21:00:00Z'))).toBe('2026-09');
  });
});
