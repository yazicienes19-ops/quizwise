import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../i18n';
import { outputLangDirective, outputLanguageName, explainerHeadings } from './aiLocale';

describe('aiLocale', () => {
  beforeEach(() => setLocale('de'));

  it('gibt für Deutsch keine Direktive aus (Default-Verhalten)', () => {
    expect(outputLangDirective()).toBe('');
    expect(outputLanguageName()).toBe('Deutsch');
    expect(explainerHeadings()).toContain('Grundlagen');
  });

  it('gibt für Türkisch eine Ausgabesprachen-Direktive + türkische Überschriften aus', () => {
    setLocale('tr');
    const d = outputLangDirective();
    expect(d).toContain('Türkisch');
    expect(d.length).toBeGreaterThan(20);
    expect(outputLanguageName()).toBe('Türkisch');
    expect(explainerHeadings()).toBe('Temel Bilgiler, Derinlemesine ve Bağlam');
  });
});
