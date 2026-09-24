import { describe, it, expect } from 'vitest';
import { buildEmail, buildSubject, EMAIL_TYPE_IDS } from '../notifications/emailDigest';

describe('emailDigest', () => {
  const a = { title: 'Dein Lernplan heute', body: 'Du hast heute noch 2 Lernblöcke offen.' };
  const b = { title: 'Zeit zum Wiederholen', body: '5 Karteikarten warten.' };

  it('nimmt bei einer Meldung deren Titel als Betreff', () => {
    expect(buildSubject([a])).toBe('Dein Lernplan heute');
  });

  it('bündelt mehrere Meldungen in einem Betreff', () => {
    expect(buildSubject([a, b])).toBe('Dein Lernplan heute und 1 weiterer Hinweis');
    expect(buildSubject([a, b, b])).toBe('Dein Lernplan heute und 2 weitere Hinweise');
  });

  it('escaped Nutzerinhalte im HTML', () => {
    const { html, text } = buildEmail([{ title: 'Klausur heute', body: 'Heute schreibst du <script>x</script>.' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(text).toContain('<script>');
  });

  it('enthält den Abschalt-Hinweis und keine Gedankenstriche', () => {
    const { html, text } = buildEmail([a, b]);
    expect(text).toContain('Einstellungen');
    expect(html + text).not.toMatch(/[–—]/);
  });

  it('schickt nur planbare Typen per Mail', () => {
    expect(EMAIL_TYPE_IDS.has('daily-reminder')).toBe(true);
    expect(EMAIL_TYPE_IDS.has('motivation')).toBe(false);
    expect(EMAIL_TYPE_IDS.has('block-lead-time')).toBe(false);
  });
});
