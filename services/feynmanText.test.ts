import { describe, it, expect } from 'vitest';
import { stripFeynmanMeta, filterLeakyGapCards, frontLeaksAnswer } from './feynmanText';

describe('stripFeynmanMeta', () => {
  it('entfernt die Einleitung aus dem User-Screenshot (ohne Komma)', () => {
    expect(stripFeynmanMeta('Erkläre nach der Feynman-Technik in einfachen Worten das Zustandekommen und die Wirkweise des Halo-Effekts.'))
      .toBe('Erkläre das Zustandekommen und die Wirkweise des Halo-Effekts.');
  });

  it('entfernt die Einleitung vor einem Nebensatz und behält das Komma', () => {
    expect(stripFeynmanMeta('Erkläre nach der Feynman-Technik in einfachen Worten, wie der Halo-Effekt und sein Gegenstück, der Horn-Effekt, die Urteilsbildung verzerren.'))
      .toBe('Erkläre, wie der Halo-Effekt und sein Gegenstück, der Horn-Effekt, die Urteilsbildung verzerren.');
  });

  it('entfernt auch "so, dass ein Kind es versteht" und englische Varianten', () => {
    expect(stripFeynmanMeta('Erkläre den Primacy-Effekt so, dass ein Kind es versteht.')).toBe('Erkläre den Primacy-Effekt.');
    expect(stripFeynmanMeta('Explain using the Feynman technique in simple terms how the halo effect works.'))
      .toBe('Explain how the halo effect works.');
  });

  it('lässt normale Fragen unverändert', () => {
    const q = 'Warum führt der Halo-Effekt bei Bewerbungsgesprächen zu Fehlurteilen?';
    expect(stripFeynmanMeta(q)).toBe(q);
  });
});

describe('filterLeakyGapCards', () => {
  it('verwirft Karten, deren Vorderseite die Antwort verrät (Muster aus dem User-Screenshot)', () => {
    const point = 'Einordnung des Halo-Effekts in die Kategorie der Kontexteffekte';
    expect(frontLeaksAnswer(`Der Halo-Effekt: Was fehlte hier? „${point}"`, point)).toBe(true);
    expect(frontLeaksAnswer(`Wie wird die Einordnung des Halo-Effekts in die Kategorie der Kontexteffekte beschrieben?`, point)).toBe(true);
  });

  it('behält echte Frage-Antwort-Karten und entfernt Duplikate und leere Einträge', () => {
    const cards = filterLeakyGapCards([
      { front: 'Zu welcher Gruppe von Urteilseffekten gehört der Halo-Effekt?', back: 'Er zählt zu den Kontexteffekten: ein einzelnes Merkmal färbt das Gesamturteil.' },
      { front: 'Zu welcher Gruppe von Urteilseffekten gehört der Halo-Effekt?', back: 'Duplikat' },
      { front: '', back: 'ohne Vorderseite' },
      { front: 'Was fehlte hier?', back: 'irgendwas' },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toMatch(/^Zu welcher Gruppe/);
  });
});
