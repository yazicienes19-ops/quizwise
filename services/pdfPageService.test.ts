import { describe, it, expect } from 'vitest';
import { joinTextItems, isScannedPage, SCANNED_PAGE_TEXT_THRESHOLD } from './pdfPageService';

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
