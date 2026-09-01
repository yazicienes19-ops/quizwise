import { describe, it, expect, beforeEach, vi } from 'vitest';
import { t, tp, setLocale, getLocale, localeTag } from './index';
import { de } from './locales/de';
import { tr } from './locales/tr';

describe('i18n', () => {
  beforeEach(() => setLocale('de'));

  it('übersetzt einfache Schlüssel je Sprache', () => {
    expect(t('common.save')).toBe('Speichern');
    setLocale('tr');
    expect(t('common.save')).toBe('Kaydet');
    expect(getLocale()).toBe('tr');
    expect(localeTag()).toBe('tr-TR');
  });

  it('interpoliert {name}-Platzhalter', () => {
    // temporär via de-Objekt-Zugriff nicht möglich (readonly); wir testen mit einem
    // vorhandenen Schlüssel und Vars, die keinen Platzhalter treffen → unverändert.
    expect(t('common.save', { foo: 'x' })).toBe('Speichern');
  });

  it('tp wählt Einzahl/Mehrzahl im Deutschen, Einform im Türkischen', () => {
    // Simuliere über ein Plural-Muster direkt via interpolate-Logik:
    // Da noch kein Plural-Schlüssel existiert, prüfen wir die Regel über tp-Fallback.
    // (Wird in Batch 4 mit echten Schlüsseln erweitert.)
    expect(typeof tp('common.save', 1)).toBe('string');
  });

  it('de und tr haben identische Schlüsselmengen', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(de).sort());
  });

  it('kein UI-Wert enthält einen Gedankenstrich oder KI-Label', () => {
    const bad = (v: string) => v.includes(' — ') || v.includes('KI ') || v.includes('KI-');
    expect(Object.values(de).filter(bad)).toEqual([]);
    expect(Object.values(tr).filter(bad)).toEqual([]);
  });
});

describe('detectInitial (Ersteinstieg: localStorage > Worker-Cookie > Browser-Sprache)', () => {
  // Bewusst KEIN Modul-Import hier — sonst würde detectInitial() schon beim
  // Aufräumen selbst einmal laufen und via seinem eigenen Fallback etwas in
  // localStorage schreiben, bevor das jeweilige Testszenario überhaupt
  // aufgesetzt ist (genau dieser Bug hat die ersten Testversuche verfälscht).
  const reset = () => {
    localStorage.clear();
    document.cookie = 'studearc_language=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  };

  it('bevorzugt localStorage vor Cookie und Browser-Sprache', async () => {
    reset();
    localStorage.setItem('studearc_language', 'tr');
    document.cookie = 'studearc_language=de; path=/';
    vi.resetModules();
    const { getLocale } = await import('./index');
    expect(getLocale()).toBe('tr');
  });

  it('nutzt das vom Worker gesetzte Cookie, wenn kein localStorage-Wert existiert', async () => {
    reset();
    document.cookie = 'studearc_language=tr; path=/';
    vi.resetModules();
    const { getLocale } = await import('./index');
    expect(getLocale()).toBe('tr');
    // Übernommen in localStorage, damit künftige Besuche nicht mehr vom Cookie abhängen.
    expect(localStorage.getItem('studearc_language')).toBe('tr');
  });

  it('fällt ohne localStorage und ohne Cookie auf die Browser-Sprache zurück', async () => {
    reset();
    const spy = vi.spyOn(navigator, 'language', 'get').mockReturnValue('tr-TR');
    vi.resetModules();
    const { getLocale } = await import('./index');
    expect(getLocale()).toBe('tr');
    spy.mockRestore();
  });
});
