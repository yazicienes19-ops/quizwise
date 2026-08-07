import { describe, it, expect } from 'vitest';
import { computeTopicGapState, rankTopicsForNextChallenge, SUCCESS_THRESHOLD } from './recallGaps';
import type { RecallResult } from './recallHistoryService';

let counter = 0;
const r = (topic: string, score: number, timestamp: number, missingPoints: string[] = []): RecallResult => ({
  id: `r${counter++}`, docName: topic, timestamp, score, topic, missingPoints,
});

describe('computeTopicGapState', () => {
  it('liefert einen neutralen Leerzustand für ein nie geübtes Thema', () => {
    const state = computeTopicGapState('Unbekannt', []);
    expect(state).toEqual({ attempts: 0, failedAttempts: 0, everSucceeded: false, lastAttemptAt: 0, lastSucceeded: false, missingConcepts: [] });
  });

  it('erkennt "nie erfolgreich" korrekt', () => {
    const results = [r('A', 40, 100), r('A', 50, 200)];
    const state = computeTopicGapState('A', results);
    expect(state.everSucceeded).toBe(false);
    expect(state.failedAttempts).toBe(2);
    expect(state.attempts).toBe(2);
  });

  it('erkennt Erfolg ab SUCCESS_THRESHOLD', () => {
    const results = [r('A', SUCCESS_THRESHOLD, 100)];
    expect(computeTopicGapState('A', results).everSucceeded).toBe(true);
  });

  it('lastSucceeded bezieht sich auf den zeitlich NEUESTEN Versuch, nicht Array-Reihenfolge', () => {
    const results = [r('A', 90, 100), r('A', 30, 200)]; // erfolgreich zuerst gespeichert, aber älter
    const state = computeTopicGapState('A', results);
    expect(state.lastSucceeded).toBe(false);
    expect(state.lastAttemptAt).toBe(200);
  });

  it('missingConcepts dedupliziert über mehrere Versuche', () => {
    const results = [
      r('A', 40, 200, ['X', 'Y']),
      r('A', 50, 100, ['Y', 'Z']),
    ];
    const state = computeTopicGapState('A', results);
    expect(new Set(state.missingConcepts)).toEqual(new Set(['X', 'Y', 'Z']));
  });

  it('ist case-insensitive beim Themen-Abgleich', () => {
    const results = [r('Klassische Konditionierung', 90, 100)];
    expect(computeTopicGapState('klassische konditionierung', results).everSucceeded).toBe(true);
  });
});

describe('rankTopicsForNextChallenge', () => {
  it('bevorzugt nie-erfolgreiche Themen vor allem anderen', () => {
    const results = [
      r('NieGeschafft', 30, 500),
      r('WiederholtFalsch', 90, 400), r('WiederholtFalsch', 20, 300), r('WiederholtFalsch', 20, 200),
      r('KuerzlichGescheitert', 80, 350), r('KuerzlichGescheitert', 30, 450),
    ];
    const { preferTopics } = rankTopicsForNextChallenge([], results);
    expect(preferTopics[0]).toBe('NieGeschafft');
  });

  it('stuft "häufig wiederholte Fehler" vor "kürzlich gescheitert" ein', () => {
    const results = [
      r('WiederholtFalsch', 90, 100), r('WiederholtFalsch', 20, 200), r('WiederholtFalsch', 20, 300),
      r('KuerzlichGescheitert', 90, 150), r('KuerzlichGescheitert', 30, 400),
    ];
    const { preferTopics } = rankTopicsForNextChallenge([], results);
    expect(preferTopics.indexOf('WiederholtFalsch')).toBeLessThan(preferTopics.indexOf('KuerzlichGescheitert'));
  });

  it('KERN-FIX: ein gerade schlecht erklärtes Thema wird NICHT ausgeschlossen, sondern bevorzugt', () => {
    const results = [r('SchwachesThema', 20, 1000)];
    const { preferTopics, excludeTopics } = rankTopicsForNextChallenge([], results);
    expect(excludeTopics).not.toContain('SchwachesThema');
    expect(preferTopics).toContain('SchwachesThema');
  });

  it('ein gerade ERFOLGREICH erklärtes Thema wird ausgeschlossen (Cool-down), nicht bevorzugt', () => {
    const results = [r('GemeistertesThema', 95, 1000)];
    const { preferTopics, excludeTopics } = rankTopicsForNextChallenge([], results);
    expect(excludeTopics).toContain('GemeistertesThema');
    expect(preferTopics).not.toContain('GemeistertesThema');
  });

  it('ein Thema landet nie gleichzeitig in preferTopics und excludeTopics (Konfliktfall: viele alte Fehler, aber gerade erfolgreich)', () => {
    const results = [
      r('Ambivalent', 20, 100), r('Ambivalent', 20, 200), // 2 alte Fehlversuche -> würde repeatedFailures erfüllen
      r('Ambivalent', 95, 900), // aber zuletzt erfolgreich -> Cool-down
    ];
    const { preferTopics, excludeTopics } = rankTopicsForNextChallenge([], results);
    expect(excludeTopics).toContain('Ambivalent');
    expect(preferTopics).not.toContain('Ambivalent');
  });

  it('fällt für Themen ohne Recall-Historie auf candidateTopics zurück (Stufe 4)', () => {
    const { preferTopics } = rankTopicsForNextChallenge(['SchwachesProfilThema'], []);
    expect(preferTopics).toEqual(['SchwachesProfilThema']);
  });

  it('verhält sich bei leerer Historie und leeren candidateTopics neutral', () => {
    expect(rankTopicsForNextChallenge([], [])).toEqual({ preferTopics: [], excludeTopics: [] });
  });

  it('Cool-down-Fenster begrenzt sich auf die letzten 8 unterschiedlichen Themen', () => {
    // 9 unterschiedliche, alle erfolgreich, absteigend nach Aktualität
    const results = Array.from({ length: 9 }, (_, i) => r(`T${i}`, 95, 1000 - i * 10));
    const { excludeTopics } = rankTopicsForNextChallenge([], results);
    expect(excludeTopics.length).toBe(8);
    expect(excludeTopics).not.toContain('T8'); // ältestes, außerhalb des Fensters
  });
});
