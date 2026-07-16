import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ProcessedDocument } from '../types';
import { generateExplanation } from '../services/geminiService';
import { downloadPdfAsBase64 } from '../services/documentService';
import { loadPdf, getPageText, renderPageToCanvas, renderPageToJpegBase64, isScannedPage, type PdfHandle } from '../services/pdfPageService';
import { markChapterDone, getDoneChapterIndices } from '../services/chapterProgressService';
import { logReaderQuestion, getReaderLog } from '../services/readerLogService';
import { buildFeynmanHandoff, pickHandoffTopic } from '../services/feynmanHandoffService';
import { extractSourceQuote, stripSourceQuoteLine } from '../services/sourceQuoteParser';
import { documentDisplayName } from '../services/libraryService';
import { resolveErrorMessage } from '../services/errorMessages';
import { renderMarkdown } from './markdownRenderer';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';

interface ChatEntry {
  concept: string;
  answer: string | null;
  loading: boolean;
  /** Wörtliches Zitat von der Seite, auf das sich die Antwort stützt. */
  quote?: string | null;
}

interface PdfSplitScreenReaderProps {
  doc: ProcessedDocument;
  userId?: string | null;
  onBack: () => void;
  onStartFeynman: (topic: string | null) => void;
}

/**
 * Split-Screen-Reader für PDFs: links das echte PDF (pdf.js, seitenweise),
 * rechts der Erklärer-Chat zur aktuell sichtbaren Seite. Fortschritt und
 * Feynman-Handoff laufen über Seiten statt Kapitel — chapterIndex = Seite-1,
 * dadurch bleiben chapterProgressService/readerLogService unverändert nutzbar.
 */
export const PdfSplitScreenReader: React.FC<PdfSplitScreenReaderProps> = ({ doc, userId, onBack, onStartFeynman }) => {
  const { t } = useTranslation();
  const [pdf, setPdf] = useState<PdfHandle | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageText, setPageText] = useState<string | null>(null);
  /** 1 = an Spaltenbreite angepasst; >1 zoomt hinein (Container scrollt). */
  const [zoom, setZoom] = useState(1);
  const [doneIndices, setDoneIndices] = useState<number[]>(() => getDoneChapterIndices(doc.id));
  const [chatByPage, setChatByPage] = useState<Record<number, ChatEntry[]>>({});
  const [concept, setConcept] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageBoxRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);

  const pageIndex = pageNumber - 1;
  const activeChat = chatByPage[pageIndex] ?? [];
  const activeDone = doneIndices.includes(pageIndex);

  // PDF einmalig laden (Storage bevorzugt, sonst lokales Base64)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base64 = doc.storagePath ? await downloadPdfAsBase64(doc.storagePath) : doc.content;
        if (!base64) throw new Error(t('rd.noPdfContent'));
        const handle = await loadPdf(base64);
        if (!cancelled) setPdf(handle);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // Aktuelle Seite rendern + Text extrahieren; renderSeq verwirft veraltete
  // Ergebnisse bei schnellem Blättern oder Zoom-Wechsel.
  useEffect(() => {
    if (!pdf) return;
    const seq = ++renderSeq.current;
    setPageText(null);
    (async () => {
      try {
        const canvas = canvasRef.current;
        const baseWidth = (pageBoxRef.current?.clientWidth ?? 600) - 16;
        if (canvas) await renderPageToCanvas(pdf, pageNumber, canvas, baseWidth * zoom);
        const text = await getPageText(pdf, pageNumber);
        if (renderSeq.current === seq) setPageText(text);
      } catch {
        if (renderSeq.current === seq) setPageText('');
      }
    })();
  }, [pdf, pageNumber, zoom]);

  useEffect(() => { setConcept(''); }, [pageNumber]);

  const goToPage = useCallback((n: number) => {
    if (!pdf) return;
    setPageNumber(Math.min(Math.max(1, n), pdf.numPages));
  }, [pdf]);

  // Pfeiltasten blättern — außer wenn gerade in ein Eingabefeld getippt wird
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'ArrowRight') goToPage(pageNumber + 1);
      if (e.key === 'ArrowLeft') goToPage(pageNumber - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goToPage, pageNumber]);

  const handleAsk = useCallback(async () => {
    const trimmed = concept.trim();
    if (trimmed.length <= 2 || !pdf) { toast.error(t('rd.enterQuestion')); return; }
    const askedPageNumber = pageNumber;
    const askedPageIndex = askedPageNumber - 1;
    const entry: ChatEntry = { concept: trimmed, answer: null, loading: true };
    setChatByPage(prev => ({ ...prev, [askedPageIndex]: [...(prev[askedPageIndex] ?? []), entry] }));
    setConcept('');
    try {
      const text = await getPageText(pdf, askedPageNumber);
      // Scan-Seite ohne Textebene: Seitenbild statt Text mitschicken —
      // der Chat bleibt seitengenau, auch bei abfotografierten Skripten.
      const source = isScannedPage(text)
        ? { file: { data: await renderPageToJpegBase64(pdf, askedPageNumber), mimeType: 'image/jpeg' } }
        : { text };
      const answer = await generateExplanation(source, trimmed, false, true);
      const quote = extractSourceQuote(answer);
      setChatByPage(prev => ({
        ...prev,
        [askedPageIndex]: (prev[askedPageIndex] ?? []).map(e => e === entry ? { ...e, answer: stripSourceQuoteLine(answer), loading: false, quote } : e),
      }));
      logReaderQuestion({ docId: doc.id, chapterIndex: askedPageIndex, chapterTitle: `Seite ${askedPageNumber}`, concept: trimmed, timestamp: Date.now() }, userId);
    } catch (e) {
      toast.error(resolveErrorMessage(e));
      setChatByPage(prev => ({
        ...prev,
        [askedPageIndex]: (prev[askedPageIndex] ?? []).filter(e => e !== entry),
      }));
    }
  }, [concept, pdf, pageNumber, doc.id, userId]);

  const handleMarkDone = () => {
    markChapterDone(doc.id, pageIndex, userId);
    setDoneIndices(getDoneChapterIndices(doc.id));
    toast.success(t('rd.pageMarkedRead'));
  };

  // Seiten-Titel ("Seite 12") taugen nicht als Feynman-Thema — chapters bleibt
  // leer, damit nur echte Nachfragen (primary) als Handoff-Thema kandidieren.
  const handoff = useMemo(() => buildFeynmanHandoff({
    doneChapterIndices: doneIndices,
    chapters: [],
    readerLog: getReaderLog(doc.id),
  }), [doneIndices, doc.id, chatByPage]);

  const handoffTopic = pickHandoffTopic(handoff);

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto py-20 px-4 text-center space-y-4">
        <p className="text-lg font-black dark:text-white">{t('rd.pdfLoadFailed')}</p>
        <button onClick={onBack} className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
          Zurück
        </button>
      </div>
    );
  }

  if (!pdf) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 rounded-full animate-spin" style={{ borderTopColor: 'var(--primary)' }} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('rd.pdfLoading')}</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 animate-in fade-in duration-700">
      {/* Schlanker Kopf — eine Zeile, damit der Split-Screen die Fläche bekommt */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} aria-label={t('quizSetup.backToLibrary')} className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          {t('rd.back')}
        </button>
        <h1 className="min-w-0 flex-1 text-base lg:text-lg font-black tracking-tight dark:text-white truncate">{documentDisplayName(doc)}</h1>
        <p className="shrink-0 hidden sm:block text-[10px] font-medium text-slate-400">
          {t('rd.pagesReadOf', { done: doneIndices.length, total: pdf.numPages })}
        </p>
        <button
          onClick={() => onStartFeynman(handoffTopic)}
          disabled={doneIndices.length === 0}
          className="shrink-0 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          {t('rd.toFeynman')}
        </button>
      </div>

      {/* Split-Screen füllt die restliche Fensterhöhe; PDF bekommt bewusst mehr Breite (3/5).
          Höhe liegt auf den Panes selbst — Grid-Zeilen dehnen sich sonst am Inhalt. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Links: PDF-Seite */}
        <div className="lg:col-span-3 rounded-[24px] p-3 lg:p-4 flex flex-col gap-3 h-[75vh] lg:h-[calc(100vh-7.5rem)]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
          {/* Kompakte Werkzeugleiste: Seite, Zoom, Gelesen-Status */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-[11px] font-black dark:text-white">
              <input
                type="number"
                min={1}
                max={pdf.numPages}
                value={pageNumber}
                onChange={e => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) goToPage(n); }}
                className="w-14 px-2 py-1.5 rounded-lg text-center outline-none"
                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                aria-label={t('rd.page')}
              />
              <span className="text-slate-400">/ {pdf.numPages}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setZoom(z => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                disabled={zoom <= 1}
                aria-label={t('rd.zoomOut')}
                className="w-9 h-9 rounded-xl text-sm font-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                −
              </button>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom(z => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
                disabled={zoom >= 3}
                aria-label="Vergrößern"
                className="w-9 h-9 rounded-xl text-sm font-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                +
              </button>
            </div>
            <button
              onClick={handleMarkDone}
              disabled={activeDone}
              className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed"
              style={activeDone
                ? { background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)', opacity: 0.7 }
                : { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
            >
              {activeDone ? t('rd.pageDoneRead') : t('rd.markPageDone')}
            </button>
          </div>

          {/* PDF-Fläche mit Blätter-Pfeilen an den Seiten */}
          <div className="relative flex-1 min-h-0">
            <div ref={pageBoxRef} className="h-full overflow-auto rounded-2xl" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
              {/* w-max + mx-auto zentriert horizontal, min-h-full + items-center vertikal —
                  beim Zoomen wird die Seite größer als der Container und er scrollt sauber */}
              <div className="w-max mx-auto max-w-none min-h-full flex items-center px-2">
                <canvas ref={canvasRef} className="rounded-xl my-3 shadow-lg" />
              </div>
            </div>
            {pageNumber > 1 && (
              <button
                onClick={() => goToPage(pageNumber - 1)}
                aria-label={t('rd.prevPage')}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-xl font-black shadow-lg transition-all hover:scale-110 active:scale-95"
                style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                ‹
              </button>
            )}
            {pageNumber < pdf.numPages && (
              <button
                onClick={() => goToPage(pageNumber + 1)}
                aria-label={t('rd.nextPage')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-xl font-black shadow-lg transition-all hover:scale-110 active:scale-95"
                style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                ›
              </button>
            )}
          </div>
        </div>

        {/* Rechts: Erklärer-Chat */}
        <div className="lg:col-span-2 rounded-[24px] p-4 lg:p-6 gap-4 flex flex-col h-[70vh] lg:h-[calc(100vh-7.5rem)]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>{t('nav.explainer')}</p>
            <p className="text-xs text-slate-400 font-medium">
              {t('rd.askPage', { n: pageNumber })}
              {pageText !== null && isScannedPage(pageText) && t('rd.scanDetected')}
            </p>
          </div>

          <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-2">
            {activeChat.length === 0 && (
              <p className="text-xs text-slate-400 italic">{t('rd.noQuestionsPage')}</p>
            )}
            {activeChat.map((entry, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-black dark:text-white break-words">{entry.concept}</p>
                {entry.loading ? (
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-medium">{t('rd.loadingAnswer')}</span>
                  </div>
                ) : entry.answer ? (
                  <div className="space-y-2">
                    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
                      {renderMarkdown(entry.answer)}
                    </div>
                    {entry.quote && (
                      <div className="rounded-2xl p-3.5" style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}>
                        <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>
                          {t('rd.quoteSourcePage', { n: pageNumber })}
                        </p>
                        <p className="text-xs font-medium italic text-slate-600 dark:text-slate-300 break-words">„{entry.quote}"</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="pt-1 flex gap-2">
            <input
              type="text"
              value={concept}
              onChange={e => setConcept(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAsk(); }}
              placeholder={t('rd.askPagePlaceholder', { n: pageNumber })}
              className="flex-1 px-4 py-3 rounded-2xl text-sm font-bold outline-none transition-all min-w-0"
              style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
            />
            <button
              onClick={handleAsk}
              disabled={concept.trim().length <= 2}
              className="shrink-0 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              {t('rd.ask')}
            </button>
          </div>
        </div>
      </div>

      {/* Feynman-Hinweis */}
      {doneIndices.length > 0 && (
        <div className="rounded-2xl p-5 text-center" style={{ background: 'color-mix(in srgb, var(--primary) 6%, transparent)', border: '1px dashed color-mix(in srgb, var(--primary) 25%, transparent)' }}>
          {handoffTopic ? (
            <p className="text-xs font-bold dark:text-white">
              {t('rd.feynmanFromInteraction', { topic: handoffTopic })}
            </p>
          ) : (
            <p className="text-xs font-bold dark:text-white">
              {t('rd.feynmanHintAsk')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
