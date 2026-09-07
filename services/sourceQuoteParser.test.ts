import { describe, it, expect } from 'vitest';
import { extractSourceQuote, stripSourceQuoteLine } from './sourceQuoteParser';

describe('extractSourceQuote', () => {
  it('extrahiert das Zitat aus der letzten Zeile', () => {
    const md = `Grundlagen\nMitose ist die Zellteilung.\n\n**Quelle:** "Die Mitose ist ein Prozess der Zellteilung."`;
    expect(extractSourceQuote(md)).toBe('Die Mitose ist ein Prozess der Zellteilung.');
  });

  it('kein Marker vorhanden → null', () => {
    const md = `Grundlagen\nMitose ist die Zellteilung ohne jeden Marker am Ende.`;
    expect(extractSourceQuote(md)).toBeNull();
  });

  it('"Quelle:" mitten im Fließtext wird NICHT fälschlich als Marker erkannt', () => {
    const md = `Die Quelle: dieses Dokuments beschreibt die Mitose ausführlich.\nEin weiterer Absatz ohne Marker am Ende der Antwort.`;
    expect(extractSourceQuote(md)).toBeNull();
  });

  it('funktioniert auch ohne Anführungszeichen um das Zitat', () => {
    const md = `Text davor.\n**Quelle:** Zitat ohne Anführungszeichen`;
    expect(extractSourceQuote(md)).toBe('Zitat ohne Anführungszeichen');
  });

  it('ignoriert trailing Leerzeilen nach dem Marker', () => {
    const md = `Text davor.\n**Quelle:** "Das Zitat."\n\n\n`;
    expect(extractSourceQuote(md)).toBe('Das Zitat.');
  });

  it('leerer String → null', () => {
    expect(extractSourceQuote('')).toBeNull();
  });

  it('Marker mit leerem Zitat → null', () => {
    const md = `Text davor.\n**Quelle:** `;
    expect(extractSourceQuote(md)).toBeNull();
  });

  it('akzeptiert "Quelle:" ganz ohne Markdown-Formatierung', () => {
    const md = `Text davor.\nQuelle: "Das Zitat."`;
    expect(extractSourceQuote(md)).toBe('Das Zitat.');
  });

  it('akzeptiert "*Quelle:*" (kursiv, ein Stern)', () => {
    const md = `Text davor.\n*Quelle:* "Das Zitat."`;
    expect(extractSourceQuote(md)).toBe('Das Zitat.');
  });

  it('erkennt die Zeile auch wenn sie NICHT die letzte ist (z.B. Weiterfragen danach)', () => {
    const md = `Text davor.\n**Quelle:** "Das Zitat."\n**Weiterfragen:** a? | b? | c?`;
    expect(extractSourceQuote(md)).toBe('Das Zitat.');
  });

  it('behält Markdown-Formatierung INNERHALB des Zitats bei', () => {
    const md = `Text davor.\n**Quelle:** "Das **wichtige** Zitat mit *Betonung*."`;
    expect(extractSourceQuote(md)).toBe('Das **wichtige** Zitat mit *Betonung*.');
  });
});

describe('stripSourceQuoteLine', () => {
  it('entfernt die Quelle-Schlusszeile', () => {
    const md = `Grundlagen\nMitose ist die Zellteilung.\n\n**Quelle:** "Die Mitose ist ein Prozess."`;
    expect(stripSourceQuoteLine(md)).toBe('Grundlagen\nMitose ist die Zellteilung.');
  });

  it('lässt Antworten ohne Marker unverändert', () => {
    const md = `Grundlagen\nMitose ist die Zellteilung ohne Marker.`;
    expect(stripSourceQuoteLine(md)).toBe(md);
  });

  it('entfernt auch trailing Leerzeilen nach dem Marker', () => {
    const md = `Text davor.\n**Quelle:** "Das Zitat."\n\n\n`;
    expect(stripSourceQuoteLine(md)).toBe('Text davor.');
  });

  it('lässt "Quelle:" mitten im Fließtext stehen', () => {
    const md = `Die Quelle: dieses Dokuments beschreibt die Mitose.\nLetzter Absatz ohne Marker.`;
    expect(stripSourceQuoteLine(md)).toBe(md);
  });

  it('entfernt die Quelle-Zeile auch wenn danach noch ein weiterer Absatz folgt', () => {
    const md = `Antwort.\n\n**Quelle:** "Das Zitat."\n\nPS: Das war noch wichtig.`;
    expect(stripSourceQuoteLine(md)).toBe('Antwort.\n\nPS: Das war noch wichtig.');
  });

  it('entfernt die Quelle-Zeile auch VOR den Weiterfragen (untypische Reihenfolge)', () => {
    const md = `Antwort.\n\n**Quelle:** "Das Zitat."\n**Weiterfragen:** a? | b? | c?`;
    expect(stripSourceQuoteLine(md)).toBe('Antwort.\n\n**Weiterfragen:** a? | b? | c?');
  });
});
