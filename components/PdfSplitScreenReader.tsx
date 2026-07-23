import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ProcessedDocument } from '../types';
import { generateGroundedExplanation, type GenerationSource } from '../services/geminiService';
import { downloadPdfAsBase64 } from '../services/documentService';
import { loadPdf, getPageText, getPageTextItems, renderPageToCanvas, renderPageToJpegBase64, isScannedPage, type PdfHandle, type PositionedTextItem } from '../services/pdfPageService';
import { buildPdfOutline, type PdfTocEntry } from '../services/pdfOutlineService';
import { TocList } from './DocTocList';
import { findQuoteRects, type HighlightRect } from '../services/pdfHighlightService';
import { markChapterDone, getDoneChapterIndices } from '../services/chapterProgressService';
import { logReaderQuestion, getReaderLog } from '../services/readerLogService';
import { saveReaderChat, getReaderChat } from '../services/readerChatService';
import { buildFeynmanHandoff, pickHandoffTopic } from '../services/feynmanHandoffService';
import { documentDisplayName } from '../services/libraryService';
import { resolveErrorMessage } from '../services/errorMessages';
import { renderMarkdown } from './markdownRenderer';
import { toast } from '../services/toast';
import { EmojiImage } from './EmojiImage';
import { detectSelectionAction, type SelectionAction } from '../services/selectionAction';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';

/** Ab dieser Verweildauer gilt eine Seite beim Weiterblättern automatisch als gelesen —
 *  schnelles Durchblättern zählt bewusst nicht, der Button bleibt als Abkürzung. */
const AUTO_READ_MS = 10_000;

/** Mindest-Freiraum über der Markierung, damit der Button dort noch passt —
 *  sonst rutscht er unter die Markierung (wie bei nativer macOS/iOS-Auswahl). */
const SELECTION_BUTTON_CLEARANCE = 46;

const SELECTION_ACTION_META: Record<SelectionAction, { emoji: string; labelKey: TKey }> = {
  term: { emoji: '💡', labelKey: 'rd.actionExplainTerm' },
  ask: { emoji: '🧠', labelKey: 'rd.actionAskTutor' },
  summarize: { emoji: '📝', labelKey: 'rd.actionSummarize' },
};

interface ChatEntry {
  concept: string;
  answer: string | null;
  loading: boolean;
  /** Wörtliches Zitat von der Seite, auf das sich die Antwort stützt. */
  quote?: string | null;
  /** true, wenn diese Seite allein die Frage nicht abdeckte und stattdessen
   *  im gesamten Dokument nachgesehen wurde. */
  expandedScope?: boolean;
}

interface PdfSplitScreenReaderProps {
  doc: ProcessedDocument;
  userId?: string | null;
  onBack: () => void;
  onStartFeynman: (topic: string | null) => void;
  getDocumentSource: (doc: ProcessedDocument) => GenerationSource;
}

/**
 * Split-Screen-Reader für PDFs: links das echte PDF (pdf.js, seitenweise),
 * rechts der Erklärer-Chat zur aktuell sichtbaren Seite. Fortschritt und
 * Feynman-Handoff laufen über Seiten statt Kapitel — chapterIndex = Seite-1,
 * dadurch bleiben chapterProgressService/readerLogService unverändert nutzbar.
 */
export const PdfSplitScreenReader: React.FC<PdfSplitScreenReaderProps> = ({ doc, userId, onBack, onStartFeynman, getDocumentSource }) => {
  const { t } = useTranslation();
  const [pdf, setPdf] = useState<PdfHandle | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageText, setPageText] = useState<string | null>(null);
  /** 1 = an Spaltenbreite angepasst; >1 zoomt hinein (Container scrollt). */
  const [zoom, setZoom] = useState(1);
  const [doneIndices, setDoneIndices] = useState<number[]>(() => getDoneChapterIndices(doc.id));
  // Gespeicherten Chat wiederherstellen — sonst geht die komplette Konversation
  // beim Verlassen und Wiederöffnen des Readers verloren (nur die reine
  // "gefragt"-Notiz überlebte bisher über readerLogService, nicht die Antwort).
  const [chatByPage, setChatByPage] = useState<Record<number, ChatEntry[]>>(() => {
    const stored = getReaderChat(doc.id);
    return Object.fromEntries(
      Object.entries(stored).map(([idx, entries]) => [idx, entries.map(e => ({ ...e, loading: false }))])
    );
  });
  const [concept, setConcept] = useState('');
  /** Aktive Zitat-Markierung im PDF (Klick auf die Zitat-Karte). */
  const [highlight, setHighlight] = useState<{ page: number; quote: string } | null>(null);
  const [highlightRects, setHighlightRects] = useState<{ rects: HighlightRect[]; pageW: number; pageH: number } | null>(null);
  /** CSS-Größe des gerenderten Canvas — Skalierungsbasis für Overlays und Textebene. */
  const [canvasCss, setCanvasCss] = useState<{ w: number; h: number } | null>(null);
  /** Textfragmente der aktuellen Seite (scale 1) — Basis für Textebene + Zitat-Markierung. */
  const [pageItems, setPageItems] = useState<{ items: PositionedTextItem[]; pageW: number; pageH: number } | null>(null);
  /** Aktive Maus-Textauswahl auf der Seite (Position relativ zur PDF-Fläche).
   *  `placement` bestimmt, ob der schwebende Button ÜBER oder UNTER der
   *  Markierung sitzt (siehe handleTextSelection). */
  const [selection, setSelection] = useState<{ text: string; x: number; y: number; action: SelectionAction; placement: 'above' | 'below' } | null>(null);
  /** Dokument-Inhaltsverzeichnis — null = wird noch im Hintergrund ermittelt. */
  const [toc, setToc] = useState<PdfTocEntry[] | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [expandedToc, setExpandedToc] = useState<Set<string>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firstRectRef = useRef<HTMLDivElement>(null);
  const pdfAreaRef = useRef<HTMLDivElement>(null);
  const pageBoxRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);
  /** Cache für Scan-Seiten-JPEGs — ohne das würde jede weitere Frage im selben
   *  Chat dieselbe Seite erneut rendern und mitschicken (unnötige Kosten/Latenz). */
  const scanImageCache = useRef<Map<number, string>>(new Map());

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

  // Inhaltsverzeichnis im Hintergrund aufbauen — die eingebettete PDF-Gliederung
  // ist bei aus Folien exportierten Skripten meist nur "Folie 1, Folie 2, ..."
  // (siehe services/pdfOutlineService.ts), deshalb Erkennung über Schriftgröße
  // + Textmenge pro Seite. Läuft einmal, blockiert das Lesen der ersten Seite nicht.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setToc(null);
    buildPdfOutline(pdf).then(result => { if (!cancelled) setToc(result); }).catch(() => { if (!cancelled) setToc([]); });
    return () => { cancelled = true; };
  }, [pdf]);

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
        if (canvas) {
          // Bei 100% soll die ganze Seite ohne Scrollen sichtbar sein — dafür zusätzlich
          // auf die verfügbare Höhe begrenzen. Ab Zoom > 1 ist Scrollen gewollt (Nutzer
          // zoomt bewusst über die Fit-Größe hinaus), deshalb keine Höhenbegrenzung dann.
          const maxHeight = zoom === 1 ? (pageBoxRef.current?.clientHeight ?? undefined) : undefined;
          await renderPageToCanvas(pdf, pageNumber, canvas, baseWidth * zoom, maxHeight ? maxHeight - 16 : undefined);
          if (renderSeq.current === seq) setCanvasCss({ w: canvas.clientWidth, h: canvas.clientHeight });
        }
        const text = await getPageText(pdf, pageNumber);
        if (renderSeq.current === seq) setPageText(text);
      } catch {
        if (renderSeq.current === seq) setPageText('');
      }
    })();
  }, [pdf, pageNumber, zoom]);

  useEffect(() => { setConcept(''); }, [pageNumber]);

  // Auto-Gelesen: die Verweildauer wird beim Verlassen der Seite (Blättern oder
  // Reader schließen) ausgewertet — kein Timer nötig, kein Klick-Zwang mehr.
  const pageEnteredAt = useRef(Date.now());
  useEffect(() => {
    pageEnteredAt.current = Date.now();
    const idx = pageNumber - 1;
    return () => {
      if (Date.now() - pageEnteredAt.current < AUTO_READ_MS) return;
      if (getDoneChapterIndices(doc.id).includes(idx)) return;
      markChapterDone(doc.id, idx, userId);
      setDoneIndices(getDoneChapterIndices(doc.id));
    };
  }, [pageNumber, doc.id, userId]);

  // Textfragmente der Seite mit Positionen laden — einmal pro Seite, genutzt
  // von der auswählbaren Textebene UND der Zitat-Markierung.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setPageItems(null);
    setSelection(null);
    getPageTextItems(pdf, pageNumber)
      .then(r => { if (!cancelled) setPageItems({ items: r.items, pageW: r.width, pageH: r.height }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pdf, pageNumber]);

  // Zitat-Markierung: Textstelle verorten. Rechtecke liegen in Seiten-Koordinaten
  // (scale 1) und werden beim Rendern auf die Canvas-CSS-Größe skaliert —
  // Zoom-Wechsel brauchen keine Neuberechnung.
  useEffect(() => {
    if (!highlight || highlight.page !== pageNumber || !pageItems) { setHighlightRects(null); return; }
    const rects = findQuoteRects(pageItems.items, highlight.quote);
    setHighlightRects(rects ? { rects, pageW: pageItems.pageW, pageH: pageItems.pageH } : null);
    if (!rects) toast.error(t('rd.quoteNotFound'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, pageNumber, pageItems]);

  // Markierung ins Sichtfeld holen (relevant bei Zoom > 1)
  useEffect(() => {
    if (highlightRects) firstRectRef.current?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [highlightRects, canvasCss]);

  // Chat persistieren (nur abgeschlossene Antworten — Lade-/Fehlerzustände
  // sind nach einem Reload sowieso hinfällig).
  useEffect(() => {
    const persistable: Record<number, ChatEntry[]> = {};
    (Object.entries(chatByPage) as [string, ChatEntry[]][]).forEach(([idx, entries]) => {
      const done = entries.filter(e => !e.loading && e.answer !== null);
      if (done.length > 0) persistable[Number(idx)] = done;
    });
    saveReaderChat(doc.id, persistable);
  }, [chatByPage, doc.id]);

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

  const handleAsk = useCallback(async (questionOverride?: string) => {
    const trimmed = (questionOverride ?? concept).trim();
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
      // Gecacht, damit eine zweite Frage zur selben Seite nicht erneut rendert+sendet.
      let pageSource: { text: string } | { file: { data: string; mimeType: string } };
      if (isScannedPage(text)) {
        let jpeg = scanImageCache.current.get(askedPageNumber);
        if (!jpeg) {
          jpeg = await renderPageToJpegBase64(pdf, askedPageNumber);
          scanImageCache.current.set(askedPageNumber, jpeg);
        }
        pageSource = { file: { data: jpeg, mimeType: 'image/jpeg' } };
      } else {
        pageSource = { text };
      }
      // Erst nur auf DIESER Seite suchen. Deckt sie die Frage nicht ab (found=false),
      // steht der Begriff evtl. einfach auf einer anderen Seite — dann transparent
      // im GANZEN Dokument nachsehen, statt fälschlich "steht nicht im Dokument" zu
      // zeigen, nur weil die aktuelle Seite zufällig nichts dazu hergibt.
      const scoped = await generateGroundedExplanation(pageSource, trimmed);
      let finalAnswer = scoped.answer;
      let quote = scoped.sourceQuote;
      let expandedScope = false;
      if (!scoped.found) {
        // Auch hier die grounded Variante nutzen, nicht die einfache generateExplanation
        // — sonst fordert der alte Prompt weiterhin IMMER ein Zitat an und erfindet
        // eines, wenn das Dokument die Frage am Ende doch nirgends beantwortet.
        const wholeDoc = await generateGroundedExplanation(getDocumentSource(doc), trimmed);
        finalAnswer = wholeDoc.answer;
        quote = wholeDoc.sourceQuote;
        expandedScope = true;
      }
      setChatByPage(prev => ({
        ...prev,
        [askedPageIndex]: (prev[askedPageIndex] ?? []).map(e => e === entry ? { ...e, answer: finalAnswer, loading: false, quote, expandedScope } : e),
      }));
      logReaderQuestion({
        docId: doc.id, docName: documentDisplayName(doc), chapterIndex: askedPageIndex,
        chapterTitle: `Seite ${askedPageNumber}`, concept: trimmed, timestamp: Date.now(),
        answer: finalAnswer, wasEscalated: expandedScope,
      }, userId);
    } catch (e) {
      toast.error(resolveErrorMessage(e));
      setChatByPage(prev => ({
        ...prev,
        [askedPageIndex]: (prev[askedPageIndex] ?? []).filter(e => e !== entry),
      }));
    }
  }, [concept, pdf, pageNumber, doc, userId, getDocumentSource]);

  // Maus-Auswahl auf der Textebene → schwebende Aktions-Leiste, die sich wie die
  // native Textauswahl unter macOS/iOS verhält: sitzt ÜBER der Markierung (und
  // verdeckt sie damit nie), springt aber automatisch UNTER die Markierung,
  // wenn oben nicht genug Platz ist (z.B. ganz oben auf der Seite).
  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (text.length < 8 || !sel || sel.rangeCount === 0) { setSelection(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const area = pdfAreaRef.current?.getBoundingClientRect();
    if (!area) return;
    const spaceAbove = rect.top - area.top;
    const placement: 'above' | 'below' = spaceAbove >= SELECTION_BUTTON_CLEARANCE ? 'above' : 'below';
    setSelection({
      text: text.slice(0, 600),
      action: detectSelectionAction(text),
      placement,
      x: Math.max(90, Math.min(rect.left - area.left + rect.width / 2, area.width - 90)),
      y: placement === 'above' ? rect.top - area.top - 10 : rect.bottom - area.top + 10,
    });
  }, []);

  // Touch-Geräte: Selection-API ist dieselbe wie bei der Maus, aber der native
  // Auswahl-Vorgang (Long-Press + Ziehen) ist bei touchend oft noch nicht fertig
  // eingerastet — kurze Verzögerung, sonst wird eine unvollständige Auswahl gelesen.
  const handleTextSelectionTouch = useCallback(() => {
    setTimeout(handleTextSelection, 50);
  }, [handleTextSelection]);

  const handleAskSelection = useCallback(() => {
    if (!selection) return;
    const question = selection.action === 'term'
      ? t('rd.explainTermQuestion', { term: selection.text })
      : selection.action === 'summarize'
        ? t('rd.summarizeSelectionQuestion', { text: selection.text })
        : t('rd.selectionQuestion', { text: selection.text.slice(0, 300) });
    handleAsk(question);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [selection, handleAsk, t]);

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

  // Flache Liste aller TOC-Einträge in Lesereihenfolge — Basis für "aktiver Eintrag"
  // (der letzte Eintrag, dessen Seite <= der aktuell offenen Seite liegt).
  const flatToc = useMemo(() => {
    const out: PdfTocEntry[] = [];
    const walk = (entries: PdfTocEntry[]) => entries.forEach(e => { out.push(e); walk(e.children); });
    walk(toc ?? []);
    return out;
  }, [toc]);
  const activeTocPage = useMemo(() => {
    const eligible = flatToc.filter(e => e.page <= pageNumber);
    return eligible.length ? Math.max(...eligible.map(e => e.page)) : null;
  }, [flatToc, pageNumber]);
  const activeTocEntry = useMemo(
    () => (activeTocPage !== null ? flatToc.find(e => e.page === activeTocPage) ?? null : null),
    [flatToc, activeTocPage]
  );

  const tocKey = (e: PdfTocEntry) => `${e.page}-${e.title}`;
  const toggleTocEntry = (e: PdfTocEntry) => {
    setExpandedToc(prev => {
      const next = new Set(prev);
      const key = tocKey(e);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const jumpToTocEntry = (e: PdfTocEntry) => {
    goToPage(e.page);
    setTocOpen(false);
  };

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
        <button
          onClick={() => setTocOpen(v => !v)}
          aria-label={t('rd.tocToggle')}
          aria-expanded={tocOpen}
          title={t('rd.tocToggle')}
          className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all"
          style={tocOpen
            ? { background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }
            : { color: 'var(--text-main)', opacity: 0.7 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4h9l3 3v13H6z"/><path d="M15 4v3h3"/><path d="M9 12h6M9 16h6"/>
          </svg>
        </button>
        <button onClick={onBack} aria-label={t('quizSetup.backToLibrary')} className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          {t('rd.back')}
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base lg:text-lg font-black tracking-tight dark:text-white truncate leading-tight">{documentDisplayName(doc)}</h1>
          {/* Aktueller Abschnitt aus dem erkannten Inhaltsverzeichnis — echte, sich
              beim Blättern mitändernde Angabe, kein statischer Titel. */}
          {activeTocEntry && (
            <p className="text-[11px] font-medium text-slate-400 truncate leading-tight mt-0.5">{activeTocEntry.title}</p>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.round((doneIndices.length / pdf.numPages) * 100)}%`, background: 'var(--primary)' }} />
          </div>
          <p className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
            {t('rd.pagesReadOf', { done: doneIndices.length, total: pdf.numPages })}
          </p>
        </div>
        <button
          onClick={() => onStartFeynman(handoffTopic)}
          disabled={doneIndices.length === 0}
          className="shrink-0 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          {t('rd.toFeynman')}
        </button>
      </div>

      {/* Split-Screen füllt die restliche Fensterhöhe; PDF bekommt bewusst mehr Breite (7/10) —
          die Seite rendert dadurch bei 100% automatisch größer (Basisbreite kommt aus der
          Container-Breite), ohne dass Zoom nötig ist und die Gesamtseite verloren geht.
          Höhe liegt auf den Panes selbst — Grid-Zeilen dehnen sich sonst am Inhalt. */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
        {/* Links: PDF-Seite */}
        <div className="relative lg:col-span-7 rounded-[24px] p-3 lg:p-4 flex flex-col gap-3 h-[80vh] lg:h-[calc(100vh-6rem)]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
          {/* Inhaltsverzeichnis-Overlay: reine Dokument-Navigation, keine App-Funktionen
              (Bibliothek/Einstellungen/etc.) — legt sich nur über diese Spalte, der
              Tutor rechts bleibt unberührt und unabgedunkelt. */}
          <div
            onClick={() => setTocOpen(false)}
            className="absolute inset-0 rounded-[20px] transition-opacity duration-200 z-10"
            style={{ background: 'rgba(15,17,23,0.36)', opacity: tocOpen ? 1 : 0, pointerEvents: tocOpen ? 'auto' : 'none' }}
          />
          <nav
            aria-hidden={!tocOpen}
            className="absolute inset-y-0 left-0 w-[280px] max-w-[80%] rounded-l-[20px] flex flex-col z-20 shadow-2xl transition-transform duration-200"
            style={{ background: 'var(--bg-main)', borderRight: '1px solid var(--border-color)', transform: tocOpen ? 'translateX(0)' : 'translateX(-100%)' }}
          >
            <div className="shrink-0 px-5 py-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--text-main)', opacity: 0.55, borderBottom: '1px solid var(--border-color)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
              {t('rd.tocTitle')}
            </div>
            <div className="flex-1 overflow-y-auto px-2.5 py-3">
              {toc === null && (
                <p className="px-3 py-4 text-[11px] font-medium text-slate-400">{t('rd.tocLoading')}</p>
              )}
              {toc !== null && toc.length === 0 && (
                <p className="px-3 py-4 text-[11px] font-medium text-slate-400">{t('rd.tocEmpty')}</p>
              )}
              {toc !== null && toc.length > 0 && (
                <TocList entries={toc} depth={0} expanded={expandedToc} activePage={activeTocPage}
                  onToggle={toggleTocEntry} onJump={jumpToTocEntry} tocKey={tocKey} />
              )}
            </div>
          </nav>

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
                aria-label={t('rd.zoomIn')}
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
          <div ref={pdfAreaRef} className="relative flex-1 min-h-0">
            <div ref={pageBoxRef} className="h-full overflow-auto rounded-2xl" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
              {/* w-max + mx-auto zentriert horizontal, min-h-full + items-center vertikal —
                  beim Zoomen wird die Seite größer als der Container und er scrollt sauber */}
              <div className="w-max mx-auto max-w-none min-h-full flex items-center px-2">
                <div className="relative my-3">
                  <canvas ref={canvasRef} className="rounded-xl shadow-lg block" />
                  {/* Auswählbare Textebene: unsichtbare, positionsgetreue Spans über dem
                      Canvas — macht Maus-Markieren und Kopieren möglich wie in echten PDFs.
                      scaleX gleicht die Breite jedes Fragments an die PDF-Metrik an. */}
                  {canvasCss && pageItems && (
                    <div className="absolute inset-0 cursor-text" onMouseUp={handleTextSelection} onTouchEnd={handleTextSelectionTouch} style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
                      {pageItems.items.map((it, i) => {
                        const sx = canvasCss.w / pageItems.pageW;
                        const sy = canvasCss.h / pageItems.pageH;
                        return (
                          <span
                            key={`${pageNumber}-${i}`}
                            style={{
                              position: 'absolute', left: it.x * sx, top: it.y * sy,
                              fontSize: Math.max(6, it.h * sy * 0.92), lineHeight: 1.1,
                              whiteSpace: 'pre', color: 'transparent', transformOrigin: '0 0',
                              fontFamily: 'sans-serif',
                            }}
                            ref={el => {
                              if (!el) return;
                              el.style.transform = '';
                              const w = el.offsetWidth;
                              const target = it.w * sx;
                              if (w > 0 && target > 0) el.style.transform = `scaleX(${target / w})`;
                            }}
                          >{it.str}</span>
                        );
                      })}
                    </div>
                  )}
                  {canvasCss && highlightRects && highlight?.page === pageNumber && highlightRects.rects.map((r, i) => (
                    <div
                      key={i}
                      ref={i === 0 ? firstRectRef : undefined}
                      className="absolute rounded-[3px] pointer-events-none animate-in fade-in duration-500"
                      style={{
                        left: (r.x / highlightRects.pageW) * canvasCss.w - 2,
                        top: (r.y / highlightRects.pageH) * canvasCss.h - 2,
                        width: (r.w / highlightRects.pageW) * canvasCss.w + 4,
                        height: (r.h / highlightRects.pageH) * canvasCss.h + 4,
                        background: 'color-mix(in srgb, var(--primary) 28%, transparent)',
                        boxShadow: '0 0 0 1px color-mix(in srgb, var(--primary) 45%, transparent)',
                      }}
                    />
                  ))}
                </div>
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
            {/* Schwebende Aktions-Leiste an der Maus-Auswahl — Aktion richtet sich
                nach dem Umfang der Markierung (siehe detectSelectionAction), Position
                weicht wie bei nativer Textauswahl nach oben ODER unten aus, verdeckt
                den markierten Text also nie. */}
            {selection && (
              <div
                className="absolute z-20 animate-in fade-in duration-150"
                style={{
                  left: selection.x,
                  top: selection.y,
                  transform: `translate(-50%, ${selection.placement === 'above' ? '-100%' : '0'})`,
                  transformOrigin: selection.placement === 'above' ? 'bottom center' : 'top center',
                }}
              >
                <button
                  onClick={handleAskSelection}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-wide shadow-lg transition-transform hover:scale-105 active:scale-95"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                >
                  <EmojiImage emoji={SELECTION_ACTION_META[selection.action].emoji} size={13} />
                  {t(SELECTION_ACTION_META[selection.action].labelKey)}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Rechts: Erklärer-Chat */}
        <div className="lg:col-span-3 rounded-[24px] p-4 lg:p-6 gap-4 flex flex-col h-[80vh] lg:h-[calc(100vh-6rem)]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black dark:text-white break-words">{entry.concept}</p>
                  {entry.expandedScope && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest" style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}>
                      {t('rd.expandedScope')}
                    </span>
                  )}
                </div>
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
                    {entry.quote && !entry.expandedScope && (
                      <div className="rounded-2xl p-3.5" style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
                            {t('rd.quoteSourcePage', { n: pageNumber })}
                          </p>
                          <button
                            onClick={() => setHighlight(prev =>
                              prev && prev.page === pageNumber && prev.quote === entry.quote
                                ? null
                                : { page: pageNumber, quote: entry.quote! }
                            )}
                            className="shrink-0 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-all hover:scale-[1.03] active:scale-95"
                            style={highlight?.page === pageNumber && highlight?.quote === entry.quote
                              ? { background: 'var(--primary)', color: 'var(--primary-text)' }
                              : { border: '1px solid color-mix(in srgb, var(--primary) 40%, transparent)', color: 'var(--primary)' }}
                          >
                            {highlight?.page === pageNumber && highlight?.quote === entry.quote ? t('rd.unmarkInPdf') : t('rd.markInPdf')}
                          </button>
                        </div>
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
              onClick={() => handleAsk()}
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

