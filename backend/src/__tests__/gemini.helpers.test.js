import { describe, it, expect } from 'vitest';
import { selectModel, isTransient, MAX_TOTAL_STORAGE_BYTES } from '../routes/gemini.js';

describe('selectModel (Plan-basierte Modellwahl)', () => {
  it('free-Nutzer bekommen immer das Basis-Modell', () => {
    expect(selectModel('free', 'light')).toBe('gemini-2.5-flash-lite');
    expect(selectModel('free', 'heavy')).toBe('gemini-2.5-flash-lite');
  });

  it('pro bekommt bei heavy das neuere Modell, bei light das Basis-Modell', () => {
    expect(selectModel('pro', 'heavy')).toBe('gemini-3.1-flash-lite');
    expect(selectModel('pro', 'light')).toBe('gemini-2.5-flash-lite');
  });

  it('unbekannter Plan fällt auf das Basis-Modell zurück', () => {
    expect(selectModel(undefined, 'heavy')).toBe('gemini-2.5-flash-lite');
    expect(selectModel('free', undefined)).toBe('gemini-2.5-flash-lite');
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
