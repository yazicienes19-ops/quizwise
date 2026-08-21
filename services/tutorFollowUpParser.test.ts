import { describe, it, expect } from 'vitest';
import { extractFollowUps, stripFollowUpLine, parseTutorResponse } from './tutorFollowUpParser';

describe('extractFollowUps', () => {
  it('extrahiert bis zu drei Fragen aus der Marker-Zeile', () => {
    const md = 'Das ist die Antwort.\n\n**Weiterfragen:** Was ist Falsifikation? | Wie hängt das mit Popper zusammen? | Nenne ein Beispiel';
    expect(extractFollowUps(md)).toEqual([
      'Was ist Falsifikation?',
      'Wie hängt das mit Popper zusammen?',
      'Nenne ein Beispiel',
    ]);
  });

  it('kappt auf maximal drei Fragen', () => {
    const md = '**Weiterfragen:** a? | b? | c? | d?';
    expect(extractFollowUps(md)).toEqual(['a?', 'b?', 'c?']);
  });

  it('erkennt den Marker nur an der letzten nicht-leeren Zeile', () => {
    const md = '**Weiterfragen:** mitten im Text? | soll nicht zählen?\n\nLetzte Zeile der Antwort.';
    expect(extractFollowUps(md)).toBeNull();
  });

  it('akzeptiert übersetzte Marker (Follow-ups, Devam)', () => {
    expect(extractFollowUps('Antwort.\n**Follow-ups:** one? | two?')).toEqual(['one?', 'two?']);
    expect(extractFollowUps('Antwort.\n**Devam:** bir? | iki?')).toEqual(['bir?', 'iki?']);
  });

  it('leere Fragen werden verworfen', () => {
    expect(extractFollowUps('Antwort.\n**Weiterfragen:** | |')).toBeNull();
    expect(extractFollowUps('Antwort.\n**Weiterfragen:**   ')).toBeNull();
  });

  it('ohne Marker gibt es null', () => {
    expect(extractFollowUps('Ganz normale Antwort ohne Marker.')).toBeNull();
    expect(extractFollowUps('')).toBeNull();
  });
});

describe('stripFollowUpLine', () => {
  it('entfernt die Marker-Zeile und schneidet Leerzeilen ab', () => {
    const md = 'Antwort.\n\n**Weiterfragen:** a? | b?\n\n';
    expect(stripFollowUpLine(md)).toBe('Antwort.');
  });

  it('lässt Text ohne Marker unangetastet', () => {
    expect(stripFollowUpLine('Antwort.')).toBe('Antwort.');
  });
});

describe('parseTutorResponse', () => {
  it('liefert Inhalt und Follow-ups getrennt', () => {
    const md = 'Erste Zeile.\nZweite Zeile.\n\n**Weiterfragen:** q1? | q2?';
    const { content, followUps } = parseTutorResponse(md);
    expect(content).toBe('Erste Zeile.\nZweite Zeile.');
    expect(followUps).toEqual(['q1?', 'q2?']);
  });

  it('ohne Marker ist der Inhalt unverändert und followUps null', () => {
    const { content, followUps } = parseTutorResponse('  Nur Text.  ');
    expect(content).toBe('Nur Text.');
    expect(followUps).toBeNull();
  });
});
