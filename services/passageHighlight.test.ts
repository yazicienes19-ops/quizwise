import { describe, it, expect } from 'vitest';
import { findQuoteInChapter } from './passageHighlight';

describe('findQuoteInChapter', () => {
  it('exakter Substring-Match', () => {
    const text = 'Die Mitose ist ein Prozess der Zellteilung, der in mehreren Phasen abläuft.';
    const result = findQuoteInChapter('Prozess der Zellteilung', text);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Prozess der Zellteilung');
    expect(text.slice(result!.start, result!.end)).toBe('Prozess der Zellteilung');
  });

  it('whitespace-toleranter Fallback bei reflowten Zeilenumbrüchen', () => {
    const text = 'Die Mitose ist ein\nProzess   der\n  Zellteilung, der abläuft.';
    const result = findQuoteInChapter('Prozess der Zellteilung', text);
    expect(result).not.toBeNull();
    expect(result!.text.replace(/\s+/g, ' ')).toBe('Prozess der\n  Zellteilung'.replace(/\s+/g, ' '));
  });

  it('kein Treffer → null, kein Crash', () => {
    const text = 'Ein völlig anderer Text ohne jede Übereinstimmung.';
    expect(findQuoteInChapter('Nicht vorhanden im Text', text)).toBeNull();
  });

  it('Regex-Sonderzeichen im Zitat werden escaped, kein Crash und kein Fehlverhalten', () => {
    const text = 'Die Formel lautet: E=mc^2 (nach Einstein) und ist bekannt.';
    const result = findQuoteInChapter('E=mc^2 (nach Einstein)', text);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('E=mc^2 (nach Einstein)');
  });

  it('mehrere mögliche Treffer → der erste im Text gewinnt', () => {
    const text = 'Wiederholung: Konzept X ist wichtig. Später nochmal: Konzept X ist wichtig.';
    const result = findQuoteInChapter('Konzept X ist wichtig', text);
    expect(result).not.toBeNull();
    expect(result!.start).toBe(text.indexOf('Konzept X ist wichtig'));
  });

  it('leeres Zitat oder leerer Text → null', () => {
    expect(findQuoteInChapter('', 'Ein Text.')).toBeNull();
    expect(findQuoteInChapter('Zitat', '')).toBeNull();
  });
});
