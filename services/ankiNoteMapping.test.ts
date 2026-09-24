import { describe, it, expect } from 'vitest';
import { htmlFieldToText, extractImageNames, noteToCard, mapAnkiTags } from './ankiNoteMapping';

describe('ankiNoteMapping', () => {
  it('macht aus Anki-HTML lesbaren Text', () => {
    expect(htmlFieldToText('Halo&nbsp;Effekt<br>Thorndike <b>1920</b><div>&auml;hnlich</div>[sound:a.mp3]'))
      .toBe('Halo Effekt\nThorndike 1920\nähnlich');
    expect(htmlFieldToText('<ul><li>eins</li><li>zwei</li></ul>')).toBe('• eins\n• zwei');
  });

  it('findet Bilder, auch mit Leerzeichen im Namen, ignoriert Web-Bilder', () => {
    expect(extractImageNames('<img src="herz%20bild.png"> x <img src=\'b.jpg\'> <img src="https://x/y.png">'))
      .toEqual(['herz bild.png', 'b.jpg']);
  });

  it('Standard-Notiz: vorne, hinten, Bilder je Seite, Schlagwörter', () => {
    const c = noteToCard(['Was zeigt das Bild?<img src="herz.png">', 'Das Herz', 'Zusatz'], 'anatomie Medizin::Kardio');
    expect(c).toEqual({
      front: 'Was zeigt das Bild?', back: 'Das Herz\n\nZusatz', tags: ['anatomie', 'Kardio'], frontImage: 'herz.png',
    });
  });

  it('Bild allein reicht als Vorderseite', () => {
    expect(noteToCard(['<img src="a.png">', 'Aorta'])).toMatchObject({ front: '', frontImage: 'a.png', back: 'Aorta' });
  });

  it('Lückentext bleibt als Lückentext, Extra wird Rückseite', () => {
    expect(noteToCard(['{{c1::Pawlow}} erforschte die {{c2::klassische}} Konditionierung', 'Hunde']))
      .toMatchObject({ front: '{{c1::Pawlow}} erforschte die {{c2::klassische}} Konditionierung', back: 'Hunde' });
    expect(noteToCard(['{{c1::Pawlow}} war Physiologe', ''])).not.toBeNull();
  });

  it('überspringt leere oder halbe Notizen', () => {
    expect(noteToCard(['', 'nur hinten'])).toBeNull();
    expect(noteToCard(['nur vorne', ''])).toBeNull();
    expect(noteToCard([])).toBeNull();
  });

  it('Schlagwörter: letzte Ebene, Unterstriche als Leerzeichen, ohne Doppelte', () => {
    expect(mapAnkiTags('  Psych::Lernen::klassische_Konditionierung  psych::Lernen ')).toEqual(['klassische Konditionierung', 'Lernen']);
  });
});
