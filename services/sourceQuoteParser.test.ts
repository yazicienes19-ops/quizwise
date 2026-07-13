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
});
