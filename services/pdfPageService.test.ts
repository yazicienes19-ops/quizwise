import { describe, it, expect } from 'vitest';
import { joinTextItems, isScannedPage, SCANNED_PAGE_TEXT_THRESHOLD, constrainWidthToHeight } from './pdfPageService';

describe('joinTextItems', () => {
  it('fügt Fragmente mit Leerzeichen zusammen', () => {
    expect(joinTextItems([{ str: 'Die' }, { str: 'Feynman-Methode' }, { str: 'hilft.' }]))
      .toBe('Die Feynman-Methode hilft.');
  });

  it('setzt Zeilenumbrüche bei hasEOL', () => {
    expect(joinTextItems([
      { str: 'Kapitel 1', hasEOL: true },
      { str: 'Erster Satz.' },
    ])).toBe('Kapitel 1\nErster Satz.');
  });

  it('verdoppelt keine Leerzeichen, wenn Fragmente bereits welche tragen', () => {
    expect(joinTextItems([{ str: 'Hallo ' }, { str: 'Welt' }])).toBe('Hallo Welt');
    expect(joinTextItems([{ str: 'Hallo' }, { str: ' Welt' }])).toBe('Hallo Welt');
  });

  it('ignoriert leere Fragmente, übernimmt aber deren Zeilenumbruch', () => {
    expect(joinTextItems([
      { str: 'Zeile 1' },
      { str: '', hasEOL: true },
      { str: 'Zeile 2' },
    ])).toBe('Zeile 1\nZeile 2');
  });

  it('erzeugt keine doppelten Zeilenumbrüche bei aufeinanderfolgenden EOL-Markern', () => {
    expect(joinTextItems([
      { str: 'Zeile 1', hasEOL: true },
      { str: '', hasEOL: true },
    ])).toBe('Zeile 1');
  });

  it('liefert leeren String für leere Eingabe', () => {
    expect(joinTextItems([])).toBe('');
  });
});

describe('isScannedPage', () => {
  it('erkennt Seiten ohne Textebene als Scan', () => {
    expect(isScannedPage('')).toBe(true);
    expect(isScannedPage('   \n  ')).toBe(true);
    expect(isScannedPage('S. 12')).toBe(true);
  });

  it('erkennt Seiten mit echtem Text nicht als Scan', () => {
    expect(isScannedPage('A'.repeat(SCANNED_PAGE_TEXT_THRESHOLD))).toBe(false);
    expect(isScannedPage('Die klassische Konditionierung nach Pawlow beschreibt Lernen durch Reizkopplung.')).toBe(false);
  });

  it('zählt umgebenden Whitespace nicht mit', () => {
    const short = '  kurz  ';
    expect(isScannedPage(short)).toBe(true);
  });
});

describe('constrainWidthToHeight', () => {
  it('gibt targetWidth unverändert zurück, wenn kein maxHeight übergeben wird', () => {
    expect(constrainWidthToHeight(1000, 600, 800, undefined)).toBe(1000);
  });

  it('lässt targetWidth unangetastet, wenn die Seite bei dieser Breite ohnehin in maxHeight passt', () => {
    // A4-artiges Seitenverhältnis (600x848 bei Breite 600) — bei Breite 500 ist die
    // resultierende Höhe ~707, passt locker in maxHeight=900
    expect(constrainWidthToHeight(500, 600, 848, 900)).toBe(500);
  });

  it('begrenzt die Breite, wenn die Seite bei targetWidth höher als maxHeight würde', () => {
    // Breites Spalten-Layout (targetWidth groß), aber wenig Höhe verfügbar —
    // genau das Szenario aus dem Live-Bug-Report (70/30-Split ohne Höhenbegrenzung)
    const result = constrainWidthToHeight(1000, 600, 848, 500);
    // Bei maxHeight=500 und Verhältnis 600/848 darf die Breite höchstens ~354 sein
    expect(result).toBeCloseTo(500 * (600 / 848), 5);
    expect(result).toBeLessThan(1000);
  });

  it('behandelt querformatige Seiten genauso (Breite kann das limitierende Maß sein)', () => {
    // Querformat: baseWidth > baseHeight — bei sehr wenig Höhe limitiert weiterhin die Höhe
    const result = constrainWidthToHeight(2000, 1200, 800, 300);
    expect(result).toBeCloseTo(300 * (1200 / 800), 5);
  });

  it('liefert targetWidth unverändert bei baseHeight <= 0 (defekte Seitenmaße, kein Crash)', () => {
    expect(constrainWidthToHeight(1000, 600, 0, 500)).toBe(1000);
  });
});
