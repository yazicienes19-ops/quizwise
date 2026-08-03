import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectChapters, getChaptersOrWhole, extractChapterText, getTextForChapterDetection, detectChaptersForDoc } from './chapterService';
import * as pdfPageService from './pdfPageService';
import * as pdfOutlineService from './pdfOutlineService';
import * as documentService from './documentService';

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

describe('detectChaptersForDoc', () => {
  afterEach(() => vi.restoreAllMocks());

  const fakePdfHandle: any = { doc: {}, numPages: 3, pageTextCache: new Map() };

  it('nutzt bei PDFs mit direktem content die echte Layout-Erkennung statt den Digest', async () => {
    vi.spyOn(pdfPageService, 'loadPdf').mockResolvedValue(fakePdfHandle);
    vi.spyOn(pdfOutlineService, 'getPdfChaptersOrWhole').mockResolvedValue([
      { index: 0, title: 'Layout-Kapitel', content: 'X', charCount: 1 },
    ]);
    const result = await detectChaptersForDoc({ type: 'pdf', content: 'base64pdf', digestText: withHeadings });
    expect(pdfPageService.loadPdf).toHaveBeenCalledWith('base64pdf');
    expect(result).toEqual([{ index: 0, title: 'Layout-Kapitel', content: 'X', charCount: 1 }]);
  });

  it('lädt bei storagePath erst die echten Bytes herunter, statt den (leeren) content zu nutzen', async () => {
    vi.spyOn(documentService, 'downloadPdfAsBase64').mockResolvedValue('downloaded-base64');
    vi.spyOn(pdfPageService, 'loadPdf').mockResolvedValue(fakePdfHandle);
    vi.spyOn(pdfOutlineService, 'getPdfChaptersOrWhole').mockResolvedValue([
      { index: 0, title: 'Storage-Kapitel', content: 'Y', charCount: 1 },
    ]);
    const result = await detectChaptersForDoc({ type: 'pdf', content: '', storagePath: 'docs/abc.pdf' });
    expect(documentService.downloadPdfAsBase64).toHaveBeenCalledWith('docs/abc.pdf');
    expect(pdfPageService.loadPdf).toHaveBeenCalledWith('downloaded-base64');
    expect(result[0].title).toBe('Storage-Kapitel');
  });

  it('fällt bei einem Fehler in der Layout-Erkennung auf den bisherigen Digest-Pfad zurück, statt 0 Kapitel zu liefern', async () => {
    vi.spyOn(pdfPageService, 'loadPdf').mockRejectedValue(new Error('kaputtes PDF'));
    const result = await detectChaptersForDoc({ type: 'pdf', content: 'base64pdf', digestText: withHeadings });
    expect(result).toEqual(detectChapters(withHeadings));
  });

  it('fällt auf den Digest-Pfad zurück, wenn die Layout-Erkennung 0 Kapitel liefert', async () => {
    vi.spyOn(pdfPageService, 'loadPdf').mockResolvedValue(fakePdfHandle);
    vi.spyOn(pdfOutlineService, 'getPdfChaptersOrWhole').mockResolvedValue([]);
    const result = await detectChaptersForDoc({ type: 'pdf', content: 'base64pdf', digestText: withHeadings });
    expect(result).toEqual(detectChapters(withHeadings));
  });

  it('geht bei Text/DOCX gar nicht erst über die PDF-Module, sondern nutzt direkt den Inhalt', async () => {
    const loadPdfSpy = vi.spyOn(pdfPageService, 'loadPdf');
    const result = await detectChaptersForDoc({ type: 'text', content: withHeadings });
    expect(loadPdfSpy).not.toHaveBeenCalled();
    expect(result).toEqual(detectChapters(withHeadings));
  });
});
