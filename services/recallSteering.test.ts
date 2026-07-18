import { describe, it, expect } from 'vitest';
import { recentRecallTopics } from './recallSteering';
import type { RecallResult } from './recallHistoryService';

const mk = (topic: string, timestamp: number): RecallResult => ({
  id: Math.random().toString(36).slice(2, 9),
  docName: topic,
  timestamp,
  score: 50,
  topic,
  missingPoints: [],
});

describe('recentRecallTopics', () => {
  it('liefert Themen neueste zuerst, unabhängig von der Array-Reihenfolge', () => {
    const results = [mk('Alt', 100), mk('Neu', 300), mk('Mittel', 200)];
    expect(recentRecallTopics(results)).toEqual(['Neu', 'Mittel', 'Alt']);
  });

  it('dedupliziert case-insensitiv, neuester Eintrag gewinnt', () => {
    const results = [mk('konditionierung', 100), mk('Konditionierung', 200), mk('Gedächtnis', 150)];
    expect(recentRecallTopics(results)).toEqual(['Konditionierung', 'Gedächtnis']);
  });

  it('respektiert das Limit', () => {
    const results = Array.from({ length: 12 }, (_, i) => mk(`Thema ${i}`, i));
    expect(recentRecallTopics(results, { limit: 3 })).toHaveLength(3);
    expect(recentRecallTopics(results)).toHaveLength(8);
  });

  it('filtert dropNames (Quell-/Dateinamen als Alt-Themen) heraus', () => {
    const results = [mk('Biopsychologie.pdf', 300), mk('Neurotransmitter', 200)];
    const out = recentRecallTopics(results, { dropNames: ['biopsychologie.pdf', 'Anderes Skript.docx'] });
    expect(out).toEqual(['Neurotransmitter']);
  });

  it('überspringt leere Themen und leere dropNames sauber', () => {
    const results = [mk('  ', 300), mk('Synapsen', 200)];
    expect(recentRecallTopics(results, { dropNames: [' '] })).toEqual(['Synapsen']);
  });

  it('leere History ergibt leere Liste', () => {
    expect(recentRecallTopics([])).toEqual([]);
  });
});
