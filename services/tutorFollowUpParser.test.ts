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

  it('erkennt den Marker auch wenn danach noch weiterer Text/eine Quelle-Zeile folgt (Fix 2026-09-07)', () => {
    const md = '**Weiterfragen:** a? | b? | c?\n\nLetzte Zeile der Antwort.';
    expect(extractFollowUps(md)).toEqual(['a?', 'b?', 'c?']);
  });

  it('ignoriert "Weiterfragen:" mitten in einer Fließtext-Zeile (kein eigener Zeilen-Marker)', () => {
    const md = 'Wenn du auf Weiterfragen: klickst, siehst du mehr.\nLetzte Zeile ohne Marker.';
    expect(extractFollowUps(md)).toBeNull();
  });

  it('nimmt bei mehreren Marker-Zeilen die UNTERSTE (echte) statt eine verwaiste Platzhalter-Zeile (realer Bug, Free-Tier-Test 2026-09-07)', () => {
    const md = 'Antwort.\n\n**Weiterfragen:** frage1 | frage2 | frage3\n**Weiterfragen:** a? | b? | c?';
    expect(extractFollowUps(md)).toEqual(['a?', 'b?', 'c?']);
  });

  it('erkennt Quelle vor statt nach den Weiterfragen (untypische Reihenfolge)', () => {
    const md = 'Antwort.\n\n**Quelle:** "Das Zitat."\n**Weiterfragen:** a? | b? | c?';
    expect(extractFollowUps(md)).toEqual(['a?', 'b?', 'c?']);
  });

  it('akzeptiert Marker ohne oder mit nur teilweiser Fett-Formatierung', () => {
    expect(extractFollowUps('Antwort.\nWeiterfragen: a? | b? | c?')).toEqual(['a?', 'b?', 'c?']);
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

  it('entfernt eine verwaiste Platzhalter-Marker-Zeile zusätzlich zur echten (realer Bug, Free-Tier-Test 2026-09-07)', () => {
    const md = 'Antwort.\n\n**Weiterfragen:** frage1 | frage2 | frage3\n**Weiterfragen:** a? | b? | c?';
    expect(stripFollowUpLine(md)).toBe('Antwort.');
  });
});

describe('GraphLearningOverlay-Regression (Bug vom 2026-09-07)', () => {
  it('parseTutorResponse entfernt eine Quelle-Zeile auch wenn der Aufrufer sie NICHT vorher selbst strippt', () => {
    // components/GraphLearningOverlay.tsx ruft parseTutorResponse(raw) direkt auf, ohne
    // vorher extractSourceQuote/stripSourceQuoteLine aufzurufen — obwohl includeSourceQuote
    // dort immer false ist, hängt das Modell manchmal trotzdem eine Quelle-Zeile an.
    const raw = 'Grundlagen\nErklärung des Konzepts.\n\n**Weiterfragen:** a? | b? | c?\nQuelle: Operante Konditionierung';
    const { content, followUps } = parseTutorResponse(raw);
    expect(content).toBe('Grundlagen\nErklärung des Konzepts.');
    expect(followUps).toEqual(['a?', 'b?', 'c?']);
    expect(content).not.toMatch(/Quelle/);
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
