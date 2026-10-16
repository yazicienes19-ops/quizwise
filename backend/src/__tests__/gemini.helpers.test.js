import { describe, it, expect } from 'vitest';
import { selectModel, wantsArgon, isTransient, MAX_TOTAL_STORAGE_BYTES, outputTokenLimit, capOutputTokens } from '../routes/gemini.js';

describe('selectModel (Plan-basierte Modellwahl)', () => {
  it('free-Nutzer bekommen immer das Basis-Modell', () => {
    expect(selectModel('free', 'light')).toBe('gemini-3.5-flash-lite');
    expect(selectModel('free', 'heavy')).toBe('gemini-3.5-flash-lite');
  });

  it('pro bekommt bei heavy das neuere Modell, bei light das Basis-Modell', () => {
    expect(selectModel('pro', 'heavy')).toBe('gemini-3.8-flash');
    expect(selectModel('pro', 'light')).toBe('gemini-3.5-flash-lite');
  });

  it('unbekannter Plan fällt auf das Basis-Modell zurück', () => {
    expect(selectModel(undefined, 'heavy')).toBe('gemini-3.5-flash-lite');
    expect(selectModel('free', undefined)).toBe('gemini-3.5-flash-lite');
  });
});

describe('wantsArgon (Lernstudio-Schalter nur für Admins)', () => {
  const ADMIN = 'efb1b348-9d63-41db-848d-5b87836dd0a1';
  it('Admin mit Schalter bekommt Argon', () => {
    expect(wantsArgon(true, ADMIN)).toBe(true);
  });
  it('alle anderen nie, auch mit gesetztem Flag', () => {
    expect(wantsArgon(true, 'fremde-id')).toBe(false);
    expect(wantsArgon('true', ADMIN)).toBe(false);
    expect(wantsArgon(undefined, ADMIN)).toBe(false);
  });
});

describe('isTransient (Retry-Würdigkeit von Gemini-Fehlern)', () => {
  it('temporäre Fehler werden wiederholt', () => {
    expect(isTransient(new Error('model overloaded'))).toBe(true);
    expect(isTransient(new Error('503 Service Unavailable'))).toBe(true);
    expect(isTransient(new Error('RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isTransient(new Error('rate limit exceeded'))).toBe(true);
    expect(isTransient(new Error('DEADLINE EXCEEDED'))).toBe(true);
    expect(isTransient(new Error('fetch failed'))).toBe(true);
  });

  it('permanente Fehler werden NICHT wiederholt', () => {
    expect(isTransient(new Error('SAFETY: request blocked'))).toBe(false);
    expect(isTransient(new Error('Invalid JSON payload'))).toBe(false);
    expect(isTransient(new Error('API key not valid'))).toBe(false);
    expect(isTransient(undefined)).toBe(false);
    expect(isTransient(null)).toBe(false);
  });
});

describe('Storage-Limit', () => {
  it('liegt bei 18 MB', () => {
    expect(MAX_TOTAL_STORAGE_BYTES).toBe(18 * 1024 * 1024);
  });
});

describe('outputTokenLimit', () => {
  it('normale Aufrufe sind auf 16k Tokens begrenzt', () => {
    expect(outputTokenLimit(undefined)).toBe(16384);
    expect(outputTokenLimit(false)).toBe(16384);
    expect(outputTokenLimit('true')).toBe(16384);
  });
  it('Klausur-Aufrufe bekommen 32k Tokens', () => {
    expect(outputTokenLimit(true)).toBe(32768);
  });
});

describe('capOutputTokens (Client-Wunsch, nur senken)', () => {
  it('ein kleinerer Wunsch gilt', () => {
    expect(capOutputTokens(16384, 3000)).toBe(3000);
  });
  it('ein größerer Wunsch wird auf das Limit gekappt', () => {
    expect(capOutputTokens(16384, 100000)).toBe(16384);
  });
  it('ohne, ungültig oder winzig bleibt das Limit', () => {
    expect(capOutputTokens(16384, undefined)).toBe(16384);
    expect(capOutputTokens(16384, 'viel')).toBe(16384);
    expect(capOutputTokens(16384, 10)).toBe(16384);
  });
});

describe('selectModel mit grading (Korrektur)', () => {
  it('Korrektur läuft für Free und Pro über das große Modell', () => {
    expect(selectModel('free', 'heavy', true)).toBe('gemini-3.8-flash');
    expect(selectModel('pro', 'heavy', true)).toBe('gemini-3.8-flash');
  });
  it('nur echtes true zählt, sonst bleibt es bei der Planregel', () => {
    expect(selectModel('free', 'heavy', 'true')).toBe('gemini-3.5-flash-lite');
    expect(selectModel('free', 'heavy')).toBe('gemini-3.5-flash-lite');
  });
});
