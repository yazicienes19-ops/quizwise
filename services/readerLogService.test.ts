import { describe, it, expect, beforeEach } from 'vitest';
import { logReaderQuestion, getReaderLog, getAskedChaptersForDoc } from './readerLogService';

beforeEach(() => {
  localStorage.clear();
});

const mk = (over: Partial<Parameters<typeof logReaderQuestion>[0]> = {}) => ({
  docId: 'docA', chapterIndex: 0, chapterTitle: 'Kapitel 1', concept: 'Mitose', timestamp: Date.now(),
  ...over,
});

describe('logReaderQuestion / getReaderLog', () => {
  it('leeres Log für unbekanntes Dokument', () => {
    expect(getReaderLog('docA')).toEqual([]);
  });

  it('speichert einen Eintrag mit generierter id', () => {
    const entry = logReaderQuestion(mk());
    expect(entry.id).toBeTruthy();
    expect(getReaderLog('docA')).toHaveLength(1);
  });

  it('neueste zuerst', () => {
    logReaderQuestion(mk({ concept: 'A', timestamp: 1000 }));
    logReaderQuestion(mk({ concept: 'B', timestamp: 3000 }));
    logReaderQuestion(mk({ concept: 'C', timestamp: 2000 }));
    const log = getReaderLog('docA');
    expect(log.map(e => e.concept)).toEqual(['B', 'C', 'A']);
  });

  it('Log ist zwischen Dokumenten isoliert', () => {
    logReaderQuestion(mk({ docId: 'docA' }));
    logReaderQuestion(mk({ docId: 'docB' }));
    expect(getReaderLog('docA')).toHaveLength(1);
    expect(getReaderLog('docB')).toHaveLength(1);
  });

  it('Dedupe: gleiches Konzept im gleichen Kapitel (case-insensitive) ersetzt den alten Eintrag statt zu duplizieren', () => {
    logReaderQuestion(mk({ concept: 'Mitose', chapterIndex: 0, timestamp: 1000 }));
    logReaderQuestion(mk({ concept: 'mitose', chapterIndex: 0, timestamp: 2000 }));
    const log = getReaderLog('docA');
    expect(log).toHaveLength(1);
    expect(log[0].timestamp).toBe(2000);
  });

  it('gleiches Konzept in unterschiedlichen Kapiteln bleibt getrennt (kein Dedupe über Kapitelgrenzen)', () => {
    logReaderQuestion(mk({ concept: 'Mitose', chapterIndex: 0 }));
    logReaderQuestion(mk({ concept: 'Mitose', chapterIndex: 1 }));
    expect(getReaderLog('docA')).toHaveLength(2);
  });
});

describe('getAskedChaptersForDoc', () => {
  it('liefert die eindeutigen, aufsteigend sortierten Kapitel-Indizes mit Fragen', () => {
    logReaderQuestion(mk({ chapterIndex: 2 }));
    logReaderQuestion(mk({ chapterIndex: 0, concept: 'X' }));
    logReaderQuestion(mk({ chapterIndex: 2, concept: 'Y' }));
    expect(getAskedChaptersForDoc('docA')).toEqual([0, 2]);
  });

  it('leer, wenn nie gefragt wurde', () => {
    expect(getAskedChaptersForDoc('docA')).toEqual([]);
  });
});
