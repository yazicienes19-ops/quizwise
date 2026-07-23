import { describe, it, expect, beforeEach } from 'vitest';
import { saveReaderChat, getReaderChat } from './readerChatService';

beforeEach(() => {
  localStorage.clear();
});

describe('saveReaderChat / getReaderChat', () => {
  it('liefert leeren Chat für ein unbekanntes Dokument', () => {
    expect(getReaderChat('nie-existiert')).toEqual({});
  });

  it('speichert und lädt einen Chat-Eintrag pro Seiten-/Kapitel-Index', () => {
    saveReaderChat('docA', { 0: [{ concept: 'Halo-Effekt', answer: 'Erklärung...', quote: 'Zitat' }] });
    expect(getReaderChat('docA')).toEqual({ 0: [{ concept: 'Halo-Effekt', answer: 'Erklärung...', quote: 'Zitat' }] });
  });

  it('ist zwischen Dokumenten isoliert', () => {
    saveReaderChat('docA', { 0: [{ concept: 'X', answer: 'Y' }] });
    expect(getReaderChat('docB')).toEqual({});
  });

  it('überschreibt den gesamten Chat-Zustand eines Dokuments beim erneuten Speichern', () => {
    saveReaderChat('docA', { 0: [{ concept: 'X', answer: 'Y' }] });
    saveReaderChat('docA', { 0: [{ concept: 'X', answer: 'Y' }], 3: [{ concept: 'Z', answer: 'W' }] });
    expect(getReaderChat('docA')).toEqual({
      0: [{ concept: 'X', answer: 'Y', quote: null }],
      3: [{ concept: 'Z', answer: 'W', quote: null }],
    });
  });

  it('leere Seiten-/Kapitel-Listen werden nicht gespeichert', () => {
    saveReaderChat('docA', { 0: [], 1: [{ concept: 'X', answer: 'Y' }] });
    expect(getReaderChat('docA')).toEqual({ 1: [{ concept: 'X', answer: 'Y', quote: null }] });
  });

  it('markiert expandedScope-Einträge, lässt das Flag bei normalen Antworten weg', () => {
    saveReaderChat('docA', {
      0: [
        { concept: 'X', answer: 'Y', expandedScope: true },
        { concept: 'A', answer: 'B' },
      ],
    });
    expect(getReaderChat('docA')[0]).toEqual([
      { concept: 'X', answer: 'Y', quote: null, expandedScope: true },
      { concept: 'A', answer: 'B', quote: null },
    ]);
  });

  it('kappt sehr lange Antworten auf eine Maximallänge (Schutz vor Storage-Überlastung)', () => {
    const longAnswer = 'x'.repeat(5000);
    saveReaderChat('docA', { 0: [{ concept: 'X', answer: longAnswer }] });
    expect(getReaderChat('docA')[0][0].answer.length).toBe(4000);
  });

  it('behält nur die zuletzt aktualisierten 15 Dokumente (Quota-Schutz)', () => {
    for (let i = 0; i < 20; i++) {
      saveReaderChat(`doc${i}`, { 0: [{ concept: 'X', answer: 'Y' }] });
    }
    const kept = Array.from({ length: 20 }, (_, i) => `doc${i}`).filter(id => Object.keys(getReaderChat(id)).length > 0);
    expect(kept.length).toBe(15);
    // Die zuletzt gespeicherten müssen überleben, die ältesten fliegen raus
    expect(getReaderChat('doc19')).not.toEqual({});
    expect(getReaderChat('doc0')).toEqual({});
  });
});
