import { describe, it, expect } from 'vitest';
import { buildFeynmanHandoff, pickHandoffTopic } from './feynmanHandoffService';
import type { Chapter } from './chapterService';
import type { ReaderLogEntry } from './readerLogService';

const chapter = (index: number, title: string): Chapter => ({ index, title, content: `Inhalt ${index}`, charCount: 20 });
const logEntry = (over: Partial<ReaderLogEntry> & { chapterIndex: number; concept: string }): ReaderLogEntry => ({
  id: Math.random().toString(36).slice(2), docId: 'docA', chapterTitle: '', timestamp: Date.now(),
  ...over,
});

describe('buildFeynmanHandoff', () => {
  it('leerer Input → beide Listen leer', () => {
    const result = buildFeynmanHandoff({ doneChapterIndices: [], chapters: [], readerLog: [] });
    expect(result).toEqual({ primary: [], fallback: [] });
  });

  it('Fragen in NICHT fertig gelesenen Kapiteln zählen nicht als primary', () => {
    const chapters = [chapter(0, 'Kap 1'), chapter(1, 'Kap 2')];
    const readerLog = [logEntry({ chapterIndex: 1, concept: 'Operante Konditionierung' })];
    // Kapitel 1 (mit Frage) ist NICHT in doneChapterIndices — nur Kapitel 0 ist fertig
    const result = buildFeynmanHandoff({ doneChapterIndices: [0], chapters, readerLog });
    expect(result.primary).toEqual([]);
  });

  it('Kapitel mit Frage taucht nicht zusätzlich im fallback auf', () => {
    const chapters = [chapter(0, 'Kap 1'), chapter(1, 'Kap 2')];
    const readerLog = [logEntry({ chapterIndex: 0, concept: 'Mitose' })];
    const result = buildFeynmanHandoff({ doneChapterIndices: [0, 1], chapters, readerLog });
    expect(result.primary).toEqual(['Mitose']);
    expect(result.fallback).toEqual(['Kap 2']); // Kap 1 (= index 0) NICHT im fallback
  });

  it('fallback: fertig gelesene Kapitel ganz ohne Fragen, aufsteigend nach Kapitel-Reihenfolge', () => {
    const chapters = [chapter(0, 'Kap 1'), chapter(1, 'Kap 2'), chapter(2, 'Kap 3')];
    const result = buildFeynmanHandoff({ doneChapterIndices: [2, 0, 1], chapters, readerLog: [] });
    expect(result.primary).toEqual([]);
    expect(result.fallback).toEqual(['Kap 1', 'Kap 2', 'Kap 3']);
  });

  it('primary ist nach Aktualität sortiert (neueste Frage zuerst)', () => {
    const chapters = [chapter(0, 'Kap 1')];
    const readerLog = [
      logEntry({ chapterIndex: 0, concept: 'Alt', timestamp: 1000 }),
      logEntry({ chapterIndex: 0, concept: 'Neu', timestamp: 5000 }),
      logEntry({ chapterIndex: 0, concept: 'Mittel', timestamp: 3000 }),
    ];
    const result = buildFeynmanHandoff({ doneChapterIndices: [0], chapters, readerLog });
    expect(result.primary).toEqual(['Neu', 'Mittel', 'Alt']);
  });

  it('Dedupe in primary: gleiches Thema (case-insensitive) über mehrere Einträge → nur einmal, an Position der neuesten Nennung', () => {
    const chapters = [chapter(0, 'Kap 1')];
    const readerLog = [
      logEntry({ chapterIndex: 0, concept: 'mitose', timestamp: 1000 }),
      logEntry({ chapterIndex: 0, concept: 'Meiose', timestamp: 2000 }),
      logEntry({ chapterIndex: 0, concept: 'Mitose', timestamp: 3000 }),
    ];
    const result = buildFeynmanHandoff({ doneChapterIndices: [0], chapters, readerLog });
    expect(result.primary).toEqual(['Mitose', 'Meiose']);
  });

  it('gemischtes Szenario: primary aus mehreren fertigen Kapiteln, fallback nur für die ohne Fragen', () => {
    const chapters = [chapter(0, 'Kap 1'), chapter(1, 'Kap 2'), chapter(2, 'Kap 3')];
    const readerLog = [
      logEntry({ chapterIndex: 0, concept: 'Thema A', timestamp: 1000 }),
      logEntry({ chapterIndex: 2, concept: 'Thema B', timestamp: 2000 }),
    ];
    const result = buildFeynmanHandoff({ doneChapterIndices: [0, 1, 2], chapters, readerLog });
    expect(result.primary).toEqual(['Thema B', 'Thema A']);
    expect(result.fallback).toEqual(['Kap 2']);
  });
});

describe('pickHandoffTopic', () => {
  it('bevorzugt primary[0], wenn primary nicht leer ist', () => {
    expect(pickHandoffTopic({ primary: ['X', 'Y'], fallback: ['Z'] })).toBe('X');
  });

  it('fällt auf fallback[0] zurück, wenn primary leer ist', () => {
    expect(pickHandoffTopic({ primary: [], fallback: ['Z'] })).toBe('Z');
  });

  it('liefert null, wenn beide Listen leer sind', () => {
    expect(pickHandoffTopic({ primary: [], fallback: [] })).toBeNull();
  });
});
