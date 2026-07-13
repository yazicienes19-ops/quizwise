import { describe, it, expect } from 'vitest';
import { detectChapters, getChaptersOrWhole, extractChapterText, getTextForChapterDetection } from './chapterService';

const withHeadings = `Kapitel 1: Einleitung
${'Ein einleitender Absatz mit ausreichend Zeichen, damit der Kapitelinhalt die Mindestlänge von achtzig Zeichen übersteigt und nicht verworfen wird.'}

Kapitel 2: Vertiefung
${'Ein zweiter Absatz, ebenfalls lang genug, um als eigenständiges Kapitel erkannt und nicht beim Zusammenfassen verworfen zu werden, da er die Mindestlänge erreicht.'}`;

describe('getChaptersOrWhole', () => {
  it('gibt erkannte Kapitel unverändert durch, wenn welche gefunden werden', () => {
    const detected = detectChapters(withHeadings);
    expect(detected.length).toBe(2);
    const result = getChaptersOrWhole(withHeadings);
    expect(result).toEqual(detected);
  });

  it('degradiert auf ein synthetisches Ganzdokument-Kapitel, wenn keine Überschriften erkannt werden', () => {
    const flatText = 'Nur ein durchgehender Fließtext ganz ohne jede erkennbare Überschriftenstruktur oder Nummerierung, der lang genug ist.';
    expect(detectChapters(flatText)).toEqual([]);
    const result = getChaptersOrWhole(flatText);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ index: 0, title: 'Gesamtes Dokument', content: flatText, charCount: flatText.length });
  });

  it('leerer Text ergibt leeres Array, kein synthetisches Kapitel', () => {
    expect(getChaptersOrWhole('')).toEqual([]);
    expect(getChaptersOrWhole('   ')).toEqual([]);
  });

  it('sehr kurzer Text (< 200 Zeichen, keine Kapitel-Erkennung möglich) wird trotzdem zum Ganzdokument-Kapitel', () => {
    const short = 'Kurzer Text.';
    expect(detectChapters(short)).toEqual([]);
    const result = getChaptersOrWhole(short);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(short);
  });
});

describe('extractChapterText / getTextForChapterDetection (Regressionsschutz, unverändert)', () => {
  it('extractChapterText verkettet Titel + Inhalt', () => {
    const chapters = detectChapters(withHeadings);
    const out = extractChapterText(chapters);
    expect(out).toContain('Kapitel 1: Einleitung');
    expect(out).toContain('Kapitel 2: Vertiefung');
  });

  it('getTextForChapterDetection nutzt content bei text/docx, digestText sonst', () => {
    expect(getTextForChapterDetection({ content: 'ABC', type: 'text' })).toBe('ABC');
    expect(getTextForChapterDetection({ content: 'ABC', type: 'docx' })).toBe('ABC');
    expect(getTextForChapterDetection({ content: 'base64...', type: 'pdf', digestText: 'Zusammenfassung' })).toBe('Zusammenfassung');
    expect(getTextForChapterDetection({ content: 'base64...', type: 'pdf' })).toBe('');
  });
});
