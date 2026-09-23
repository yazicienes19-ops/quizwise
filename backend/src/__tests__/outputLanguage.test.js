import { describe, it, expect } from 'vitest';
import { normalizeLanguage, languageLine } from '../utils/outputLanguage';

describe('outputLanguage', () => {
  it('kennt alle drei App-Sprachen', () => {
    expect(languageLine('de')).toBe('auf Deutsch');
    expect(languageLine('en')).toBe('auf Englisch');
    expect(languageLine('tr')).toBe('auf Türkisch');
  });

  it('fällt bei unbekannten oder fehlenden Werten auf Deutsch zurück', () => {
    expect(normalizeLanguage(undefined)).toBe('de');
    expect(normalizeLanguage('fr')).toBe('de');
    expect(normalizeLanguage('__proto__')).toBe('de');
  });
});
