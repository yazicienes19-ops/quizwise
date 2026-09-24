import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ProcessedDocument } from '../types';
import { generateGroundedExplanation, type GenerationSource } from '../services/geminiService';
import { downloadPdfAsBase64 } from '../services/documentService';
import { loadPdf, getPageText, getPageTextItems, renderPageToCanvas, renderPageToJpegBase64, isScannedPage, type PdfHandle, type PositionedTextItem } from '../services/pdfPageService';
import { buildPdfOutline, type PdfTocEntry } from '../services/pdfOutlineService';
import { TocList } from './DocTocList';
import { findQuoteRects, type HighlightRect } from '../services/pdfHighlightService';
import { markChapterDone, getDoneChapterIndices, getLastPage, saveLastPage } from '../services/chapterProgressService';
import { logReaderQuestion, getReaderLog } from '../services/readerLogService';
import { saveReaderChat, getReaderChat } from '../services/readerChatService';
import { buildFeynmanHandoff, pickHandoffTopic } from '../services/feynmanHandoffService';
import { documentDisplayName } from '../services/libraryService';
import { resolveErrorMessage } from '../services/errorMessages';
import { renderMarkdown } from './markdownRenderer';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';
import { ReaderTutorPane } from './ReaderTutorPane';
import { SelectionActionButton, readSelection, selectionQuestion, type ReaderSelection } from './SelectionActionButton';
import { Highlighter, StickyNote, MessageSquareText } from 'lucide-react';
import { isPinNote, getHighlights, addHighlight, updateHighlight, removeHighlight, restoreHighlight, HIGHLIGHT_HEX, type UserHighlight } from '../services/userHighlights';
import { PdfHighlightsPanel } from './PdfHighlightsPanel';
import { CLOUD_PULLED_EVENT } from '../services/syncService';
import { HighlightNotePopover, NOTE_POPOVER_WIDTH, NOTE_POPOVER_HEIGHT } from './HighlightNotePopover';

/** Sprechblasen auf dem PDF (eigene Notizen). */
const SHOW_NOTES_KEY = 'studearc_reader_show_notes';
const NOTE_BUBBLE_WIDTH = 200;

/** Ab dieser Verweildauer gilt eine Seite beim Weiterblättern automatisch als gelesen —
 *  schnelles Durchblättern zählt bewusst nicht, der Button bleibt als Abkürzung. */
const AUTO_READ_MS = 10_000;

interface ChatEntry {
  concept: string;
  answer: string | null;
  loading: boolean;
  /** Wörtliches Zitat von der Seite, auf das sich die Antwort stützt. */
  quote?: string | null;
  /** true, wenn diese Seite allein die Frage nicht abdeckte und stattdessen
   *  im gesamten Dokument nachgesehen wurde. */
  expandedScope?: boolean;
  /** Klickbare Weiterfragen aus der Antwort (nur am jüngsten Eintrag aktiv). */
  followUps?: string[] | null;
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
  // Beim erneuten Öffnen dort weiterlesen, wo zuletzt aufgehört wurde, statt
  // immer bei Seite 1 zu starten (s. saveLastPage-Effekt weiter unten).
  const [pageNumber, setPageNumber] = useState(() => (getLastPage(doc.id) ?? 0) + 1);
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
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  /** Dokument-Inhaltsverzeichnis — null = wird noch im Hintergrund ermittelt. */
  const [toc, setToc] = useState<PdfTocEntry[] | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [expandedToc, setExpandedToc] = useState<Set<string>>(new Set());
  /** Eigene Markierungen (services/userHighlights.ts) und ob die Liste offen ist. */
  const [myHighlights, setMyHighlights] = useState<UserHighlight[]>(() => getHighlights(doc.id));
  const [hlOpen, setHlOpen] = useState(false);
  /** Offene Notiz-Blase an einer Markierung im PDF. */
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null);
  /** Nächster Tipp aufs PDF setzt eine freie Notiz (ohne Markierung). */
  const [placingNote, setPlacingNote] = useState(false);
  /** Notizen als Sprechblasen direkt auf dem PDF zeigen (gemerkt pro Gerät). */
  const [showNoteBubbles, setShowNoteBubbles] = useState(() => {
    try { return localStorage.getItem(SHOW_NOTES_KEY) !== '0'; } catch { return true; }
  });
  const toggleNoteBubbles = () => setShowNoteBubbles(v => {
    try { localStorage.setItem(SHOW_NOTES_KEY, v ? '0' : '1'); } catch { /* Speicher gesperrt */ }
    return !v;
  });

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
  // Index der jüngsten abgeschlossenen Antwort — nur dort Weiterfragen-Chips
  let lastAnsweredChatIdx = -1;
  for (let i = activeChat.length - 1; i >= 0; i--) {
    if (!activeChat[i].loading && activeChat[i].answer !== null) { lastAnsweredChatIdx = i; break; }
  }

  // PDF einmalig laden (Storage bevorzugt, sonst lokales Base64)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base64 = doc.storagePath ? await downloadPdfAsBase64(doc.storagePath) : doc.content;
        if (!base64) throw new Error(t('rd.noPdfContent'));
        const handle = await loadPdf(base64);
        if (!cancelled) {
          setPdf(handle);
          // Gespeicherte Seite kann außerhalb liegen (z.B. Datei seither ersetzt) —
          // dann lieber vorne beginnen als in einen ungültigen Zustand rendern.
          setPageNumber(p => (p > handle.numPages ? 1 : p));
        }
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

  // Zuletzt besuchte Seite merken — sofort bei jedem Seitenwechsel, nicht erst
  // ab der Auto-Gelesen-Schwelle (auch kurzes Reinschauen soll beim nächsten
  // Öffnen an dieser Stelle fortsetzen). Erst nach PDF-Laden aktiv, damit der
  // initiale Wert (aus dem Speicher gelesen) nicht sofort mit sich selbst
  // überschrieben wird, bevor ein etwaiges Clamping greifen konnte.
  useEffect(() => {
    if (!pdf) return;
    saveLastPage(doc.id, pageNumber - 1, userId);
  }, [pdf, pageNumber, doc.id, userId]);

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
    // Abgeschlossene Runden dieser Seite als Dialog-Historie mitgeben —
    // Nachfragen ("und der zweite Punkt?") brauchen den Verlauf.
    const history = (chatByPage[askedPageIndex] ?? [])
      .filter(e => !e.loading && e.answer !== null)
      .map(e => ({ question: e.concept, answer: e.answer! }));
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
      const context = { subject: doc.subject, chapterTitle: `Seite ${askedPageNumber}`, page: askedPageNumber };
      const scoped = await generateGroundedExplanation(pageSource, trimmed, context, history);
      let finalAnswer = scoped.answer;
      let quote = scoped.sourceQuote;
      let followUps = scoped.followUps;
      let expandedScope = false;
      if (!scoped.found) {
        // Auch hier die grounded Variante nutzen, nicht die einfache generateExplanation
        // — sonst fordert der alte Prompt weiterhin IMMER ein Zitat an und erfindet
        // eines, wenn das Dokument die Frage am Ende doch nirgends beantwortet.
        const wholeDoc = await generateGroundedExplanation(getDocumentSource(doc), trimmed, context, history);
        finalAnswer = wholeDoc.answer;
        quote = wholeDoc.sourceQuote;
        followUps = wholeDoc.followUps;
        expandedScope = true;
      }
      setChatByPage(prev => ({
        ...prev,
        [askedPageIndex]: (prev[askedPageIndex] ?? []).map(e => e === entry ? { ...e, answer: finalAnswer, loading: false, quote, expandedScope, followUps } : e),
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
  }, [concept, chatByPage, pdf, pageNumber, doc, userId, getDocumentSource]);

  // Maus-Auswahl auf der Textebene → schwebende Aktions-Leiste, die sich wie die
  // native Textauswahl unter macOS/iOS verhält: sitzt ÜBER der Markierung (und
  // verdeckt sie damit nie), springt aber automatisch UNTER die Markierung,
  // wenn oben nicht genug Platz ist (z.B. ganz oben auf der Seite).
  const handleTextSelection = useCallback(() => {
    setSelection(readSelection(pdfAreaRef.current, { joinLines: true }));
  }, []);

  // Touch-Geräte: Selection-API ist dieselbe wie bei der Maus, aber der native
  // Auswahl-Vorgang (Long-Press + Ziehen) ist bei touchend oft noch nicht fertig
  // eingerastet — kurze Verzögerung, sonst wird eine unvollständige Auswahl gelesen.
  const handleTextSelectionTouch = useCallback(() => {
    setTimeout(handleTextSelection, 50);
  }, [handleTextSelection]);

  const handleAskSelection = useCallback(() => {
    if (!selection) return;
    handleAsk(selectionQuestion(selection, t));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [selection, handleAsk, t]);

  const refreshHighlights = useCallback(() => setMyHighlights(getHighlights(doc.id)), [doc.id]);
  useEffect(() => {
    window.addEventListener(CLOUD_PULLED_EVENT, refreshHighlights);
    return () => window.removeEventListener(CLOUD_PULLED_EVENT, refreshHighlights);
  }, [refreshHighlights]);

  const handleHighlightSelection = useCallback((withNote = false) => {
    if (!selection) return;
    const h = addHighlight(doc.id, { page: pageNumber, quote: selection.text }, userId);
    refreshHighlights();
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    // Mit Notiz: Blase direkt an der neuen Markierung öffnen statt einer Meldung.
    if (withNote) setNoteOpenId(h.id);
    else toast.success(t('hl.added'));
  }, [selection, doc.id, pageNumber, userId, refreshHighlights, t]);

  const handleDeleteHighlight = useCallback((id: string) => {
    setNoteOpenId(open => (open === id ? null : open));
    removeHighlight(doc.id, id, userId);
    refreshHighlights();
    toast.withAction(t('hl.deleted'), {
      label: t('common.undo'),
      onClick: () => { restoreHighlight(doc.id, id, userId); refreshHighlights(); },
    }, 8000);
  }, [doc.id, userId, refreshHighlights, t]);

  // Eigene Markierungen der aktuellen Seite verorten (gleiche Textsuche wie Tutor-Zitate).
  const pageHighlightRects = useMemo(() => {
    if (!pageItems) return [];
    return myHighlights
      .filter(h => h.page === pageNumber)
      .map(h => ({ h, rects: findQuoteRects(pageItems.items, h.quote) ?? [] }))
      .filter(x => x.rects.length > 0);
  }, [myHighlights, pageNumber, pageItems]);

  // Notiz-Symbol: am Ende der letzten Zeile einer Markierung (CSS-Pixel auf der Seite).
  const noteAnchors = useMemo(() => {
    if (!pageItems || !canvasCss) return [];
    const sx = canvasCss.w / pageItems.pageW;
    const sy = canvasCss.h / pageItems.pageH;
    const marked = pageHighlightRects.map(({ h, rects }) => {
      const last = rects.reduce((a, b) => (b.y > a.y + 1 || (Math.abs(b.y - a.y) <= 1 && b.x > a.x) ? b : a));
      return { h, x: Math.min((last.x + last.w) * sx + 2, canvasCss.w - 22), y: Math.max(0, last.y * sy - 12) };
    });
    // Frei gesetzte Notizen: Symbol mittig auf der gespeicherten Position.
    const pins = myHighlights
      .filter(h => h.page === pageNumber && isPinNote(h))
      .map(h => ({ h, x: Math.min(Math.max(0, h.pos!.x * canvasCss.w - 10), canvasCss.w - 22), y: Math.max(0, h.pos!.y * canvasCss.h - 10) }));
    return [...marked, ...pins];
  }, [pageHighlightRects, pageItems, canvasCss, myHighlights, pageNumber]);

  const placeNoteAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const h = addHighlight(doc.id, {
      page: pageNumber,
      pos: { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height },
    }, userId);
    refreshHighlights();
    setPlacingNote(false);
    setNoteOpenId(h.id);
  };

  // Eine neu gesetzte, leer geschlossene freie Notiz wieder entfernen.
  const closeNote = (id: string) => {
    setNoteOpenId(null);
    const h = getHighlights(doc.id).find(x => x.id === id);
    if (h && isPinNote(h) && !h.note?.trim()) { removeHighlight(doc.id, id, userId); refreshHighlights(); }
  };
  const openNote = noteOpenId ? noteAnchors.find(a => a.h.id === noteOpenId) : undefined;

  // Seitenwechsel schließt eine offene Blase.
  useEffect(() => { setNoteOpenId(null); setPlacingNote(false); }, [pageNumber]);

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
        <button onClick={onBack} className="px-6 py-3 rounded-2xl text-[13px] font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
          {t('rd.backToLibrary')}
        </button>
      </div>
    );
  }

  if (!pdf) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 rounded-full animate-spin" style={{ borderTopColor: 'var(--primary)' }} />
        <p className="text-xs font-semibold text-slate-400">{t('rd.pdfLoading')}</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 animate-in fade-in duration-700">
      {/* Schlanker Kopf — eine Zeile, damit der Split-Screen die Fläche bekommt */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          onClick={() => setTocOpen(v => !v)}
          aria-label={t('rd.tocToggle')}
          aria-expanded={tocOpen}
          title={t('rd.tocToggle')}
          className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all"
          style={tocOpen
            ? { background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary-ink)' }
            : { color: 'var(--text-main)', opacity: 0.7 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4h9l3 3v13H6z"/><path d="M15 4v3h3"/><path d="M9 12h6M9 16h6"/>
          </svg>
        </button>
        <button onClick={onBack} aria-label={t('quizSetup.backToLibrary')} className="shrink-0 text-[13px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
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
          <p className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
            {t('rd.pagesReadOf', { done: doneIndices.length, total: pdf.numPages })}
          </p>
        </div>
        <button
          onClick={() => onStartFeynman(handoffTopic)}
          disabled={doneIndices.length === 0}
          className="w-full sm:w-auto shrink-0 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
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
        <div className="relative lg:col-span-7 rounded-[24px] p-3 lg:p-4 flex flex-col gap-3 h-[calc(100vh-21rem)] min-h-[300px] lg:h-[calc(100vh-6rem)]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
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
            <div className="shrink-0 px-5 py-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-main)', opacity: 0.55, borderBottom: '1px solid var(--border-color)' }}>
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
            <div className="flex items-center gap-1.5 text-[11px] font-semibold dark:text-white">
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
            <button
              onClick={() => { setPlacingNote(p => !p); setNoteOpenId(null); }}
              aria-pressed={placingNote}
              title={t('hl.placeHint')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all"
              style={placingNote
                ? { background: 'var(--primary)', color: 'var(--primary-text)', border: '1px solid var(--primary)' }
                : { background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
            >
              <StickyNote className="w-3.5 h-3.5" aria-hidden="true" />
              {placingNote ? t('hl.placeCancel') : t('hl.placeNote')}
            </button>
            {myHighlights.some(h => h.note?.trim()) && (
              <button
                onClick={toggleNoteBubbles}
                aria-pressed={showNoteBubbles}
                aria-label={showNoteBubbles ? t('hl.bubblesHide') : t('hl.bubblesShow')}
                title={showNoteBubbles ? t('hl.bubblesHide') : t('hl.bubblesShow')}
                className="w-9 h-9 flex items-center justify-center rounded-xl transition-all"
                style={showNoteBubbles
                  ? { background: 'color-mix(in srgb, var(--primary) 16%, var(--bg-main))', border: '1px solid color-mix(in srgb, var(--primary) 45%, transparent)', color: 'var(--primary-ink)' }
                  : { background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              >
                <MessageSquareText className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            <button
              onClick={() => setHlOpen(o => !o)}
              aria-expanded={hlOpen}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all"
              style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
            >
              <Highlighter className="w-3.5 h-3.5" aria-hidden="true" />
              {t('hl.title')}
              {myHighlights.length > 0 && <span style={{ color: 'var(--primary-ink)' }}>{myHighlights.length}</span>}
            </button>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setZoom(z => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                disabled={zoom <= 1}
                aria-label={t('rd.zoomOut')}
                className="w-9 h-9 rounded-xl text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                −
              </button>
              <span className="text-xs font-semibold text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom(z => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
                disabled={zoom >= 3}
                aria-label={t('rd.zoomIn')}
                className="w-9 h-9 rounded-xl text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                +
              </button>
            </div>
            <button
              onClick={handleMarkDone}
              disabled={activeDone}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:scale-[1.02] disabled:cursor-not-allowed"
              style={activeDone
                ? { background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)', opacity: 0.7 }
                : { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary-ink)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
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
                  {canvasCss && pageItems && pageHighlightRects.flatMap(({ h, rects }) => rects.map((r, i) => (
                    <div
                      key={`${h.id}-${i}`}
                      className="absolute pointer-events-none rounded-[2px]"
                      title={h.note || undefined}
                      style={{
                        left: (r.x / pageItems.pageW) * canvasCss.w - 1,
                        top: (r.y / pageItems.pageH) * canvasCss.h - 1,
                        width: (r.w / pageItems.pageW) * canvasCss.w + 2,
                        height: (r.h / pageItems.pageH) * canvasCss.h + 2,
                        background: HIGHLIGHT_HEX[h.color],
                        opacity: 0.42,
                        mixBlendMode: 'multiply',
                      }}
                    />
                  )))}
                  {/* Notiz setzen: Fläche über der Seite fängt den nächsten Tipp ab. */}
                  {canvasCss && placingNote && (
                    <div
                      onClick={placeNoteAt}
                      onMouseUp={e => e.stopPropagation()}
                      className="absolute inset-0 z-[15] cursor-crosshair rounded-xl"
                      style={{ boxShadow: 'inset 0 0 0 2px var(--primary)', background: 'color-mix(in srgb, var(--primary) 6%, transparent)' }}
                      aria-label={t('hl.placeHint')}
                      role="button"
                    />
                  )}
                  {/* Notiz-Symbole: gefüllt mit Notiz, blass ohne. Ein Tipp öffnet die Blase. */}
                  {canvasCss && noteAnchors.map(({ h, x, y }) => (
                    <button
                      key={`note-${h.id}`}
                      onClick={e => { e.stopPropagation(); setNoteOpenId(open => (open === h.id ? null : h.id)); }}
                      onMouseUp={e => e.stopPropagation()}
                      aria-label={h.note ? t('hl.showNote') : t('hl.addNote')}
                      title={h.note || t('hl.addNote')}
                      className="absolute z-20 w-5 h-5 rounded-full flex items-center justify-center shadow transition-transform hover:scale-110"
                      style={{
                        left: x, top: y,
                        background: h.note ? HIGHLIGHT_HEX[h.color] : 'var(--bg-sidebar)',
                        border: `1.5px solid ${HIGHLIGHT_HEX[h.color]}`,
                        color: h.note ? '#1f1b14' : 'var(--text-secondary)',
                        opacity: h.note ? 1 : 0.75,
                      }}
                    >
                      <StickyNote className="w-3 h-3" aria-hidden="true" />
                    </button>
                  ))}
                  {/* Sprechblasen: Notiztext direkt neben dem Symbol, Tipp öffnet die Bearbeitung. */}
                  {canvasCss && showNoteBubbles && noteAnchors
                    .filter(({ h }) => h.note?.trim() && h.id !== noteOpenId)
                    .map(({ h, x, y }) => {
                      const flip = x + 26 + NOTE_BUBBLE_WIDTH > canvasCss.w;
                      return (
                        <button
                          key={`bubble-${h.id}`}
                          onClick={e => { e.stopPropagation(); setNoteOpenId(h.id); }}
                          onMouseUp={e => e.stopPropagation()}
                          aria-label={`${t('hl.showNote')}: ${h.note}`}
                          className="absolute z-20 text-left rounded-xl px-2.5 py-1.5 shadow-md transition-transform hover:scale-[1.02] animate-in fade-in duration-200"
                          style={{
                            left: flip ? Math.max(0, x - NOTE_BUBBLE_WIDTH - 6) : x + 26,
                            top: Math.max(0, y - 4),
                            maxWidth: NOTE_BUBBLE_WIDTH,
                            // Fest auf hellem Papier-Ton: das PDF ist in beiden Modi hell.
                            background: `color-mix(in srgb, ${HIGHLIGHT_HEX[h.color]} 22%, #ffffff)`,
                            border: `1px solid ${HIGHLIGHT_HEX[h.color]}`,
                            color: '#1f1b14',
                          }}
                        >
                          {/* Spitze zeigt zum Notiz-Symbol */}
                          <span
                            aria-hidden="true"
                            className="absolute top-2 w-2 h-2 rotate-45"
                            style={{
                              [flip ? 'right' : 'left']: -5,
                              background: `color-mix(in srgb, ${HIGHLIGHT_HEX[h.color]} 22%, #ffffff)`,
                              borderLeft: flip ? 'none' : `1px solid ${HIGHLIGHT_HEX[h.color]}`,
                              borderBottom: flip ? 'none' : `1px solid ${HIGHLIGHT_HEX[h.color]}`,
                              borderRight: flip ? `1px solid ${HIGHLIGHT_HEX[h.color]}` : 'none',
                              borderTop: flip ? `1px solid ${HIGHLIGHT_HEX[h.color]}` : 'none',
                            }}
                          />
                          <span className="block text-[12px] leading-snug line-clamp-3 whitespace-pre-line">{h.note}</span>
                        </button>
                      );
                    })}
                  {canvasCss && openNote && (
                    <HighlightNotePopover
                      key={openNote.h.id}
                      highlight={openNote.h}
                      x={Math.max(0, Math.min(openNote.x - NOTE_POPOVER_WIDTH / 2, canvasCss.w - NOTE_POPOVER_WIDTH))}
                      // Unten auf der Seite nach oben aufklappen, sonst ragt die Blase aus dem Bild.
                      y={openNote.y + 26 + NOTE_POPOVER_HEIGHT > canvasCss.h ? Math.max(0, openNote.y - NOTE_POPOVER_HEIGHT - 6) : openNote.y + 26}
                      onSave={note => { updateHighlight(doc.id, openNote.h.id, { note }, userId); refreshHighlights(); }}
                      onColor={color => { updateHighlight(doc.id, openNote.h.id, { color }, userId); refreshHighlights(); }}
                      onDelete={() => handleDeleteHighlight(openNote.h.id)}
                      onClose={() => closeNote(openNote.h.id)}
                    />
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
                className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-xl font-black shadow-lg transition-all hover:scale-110"
                style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                ‹
              </button>
            )}
            {pageNumber < pdf.numPages && (
              <button
                onClick={() => goToPage(pageNumber + 1)}
                aria-label={t('rd.nextPage')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-xl font-black shadow-lg transition-all hover:scale-110"
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
              <SelectionActionButton
                selection={selection}
                onClick={handleAskSelection}
                extra={
                  <>
                  <button
                    onClick={() => handleHighlightSelection(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold shadow-lg transition-transform hover:scale-105 animate-in fade-in duration-150"
                    style={{ background: 'var(--bg-sidebar)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                  >
                    <StickyNote className="w-3.5 h-3.5" style={{ color: HIGHLIGHT_HEX.yellow }} aria-hidden="true" />
                    {t('hl.markWithNote')}
                  </button>
                  <button
                    onClick={() => handleHighlightSelection()}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold shadow-lg transition-transform hover:scale-105 animate-in fade-in duration-150"
                    style={{ background: 'var(--bg-sidebar)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                  >
                    <Highlighter className="w-3.5 h-3.5" style={{ color: HIGHLIGHT_HEX.yellow }} aria-hidden="true" />
                    {t('hl.mark')}
                  </button>
                  </>
                }
              />
            )}
            <PdfHighlightsPanel
              open={hlOpen}
              highlights={myHighlights}
              currentPage={pageNumber}
              onClose={() => setHlOpen(false)}
              onJump={p => { goToPage(p); }}
              onNote={(id, note) => { updateHighlight(doc.id, id, { note }, userId); refreshHighlights(); }}
              onColor={(id, color) => { updateHighlight(doc.id, id, { color }, userId); refreshHighlights(); }}
              onDelete={handleDeleteHighlight}
            />
          </div>
        </div>

        {/* Rechts: Tutor-Spalte (ab lg), sonst Bottom Sheet über dem PDF */}
        <ReaderTutorPane
          hint={`${t('rd.askPage', { n: pageNumber })}${pageText !== null && isScannedPage(pageText) ? t('rd.scanDetected') : ''}`}
          placeholder={t('rd.askPagePlaceholder', { n: pageNumber })}
          emptyText={t('rd.noQuestionsPage')}
          entryCount={activeChat.length}
          value={concept}
          onChange={setConcept}
          onAsk={() => handleAsk()}
        >
            {activeChat.map((entry, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black dark:text-white break-words">{entry.concept}</p>
                  {entry.expandedScope && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary-ink)' }}>
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
                    {entry.quote && (
                      <div className="rounded-2xl p-3.5" style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-xs font-semibold" style={{ color: 'var(--primary-ink)' }}>
                            {entry.expandedScope ? t('rd.quoteSourceDoc') : t('rd.quoteSourcePage', { n: pageNumber })}
                          </p>
                          {/* Zitate aus dem Gesamtdokument stehen nicht auf dieser Seite, dafür gibt es keine Markierung */}
                          {!entry.expandedScope && <button
                            onClick={() => setHighlight(prev =>
                              prev && prev.page === pageNumber && prev.quote === entry.quote
                                ? null
                                : { page: pageNumber, quote: entry.quote! }
                            )}
                            className="shrink-0 text-[13px] font-semibold px-2 py-1 rounded-lg transition-all hover:scale-[1.03]"
                            style={highlight?.page === pageNumber && highlight?.quote === entry.quote
                              ? { background: 'var(--primary)', color: 'var(--primary-text)' }
                              : { border: '1px solid color-mix(in srgb, var(--primary) 40%, transparent)', color: 'var(--primary-ink)' }}
                          >
                            {highlight?.page === pageNumber && highlight?.quote === entry.quote ? t('rd.unmarkInPdf') : t('rd.markInPdf')}
                          </button>}
                        </div>
                        <p className="text-xs font-medium italic text-slate-600 dark:text-slate-300 break-words">„{entry.quote}"</p>
                      </div>
                    )}
                    {entry.followUps && entry.followUps.length > 0 && i === lastAnsweredChatIdx && (
                      <div className="flex flex-wrap gap-2">
                        {entry.followUps.map(q => (
                          <button
                            key={q}
                            onClick={() => handleAsk(q)}
                            className="px-3 py-1.5 rounded-xl text-[13px] font-semibold transition-all hover:scale-[1.03] text-left"
                            style={{
                              background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                              color: 'var(--primary-ink)',
                              border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
        </ReaderTutorPane>
      </div>
      {/* Platz für das eingeklappte Tutor-Sheet auf kleinen Bildschirmen */}
      <div className="h-36 lg:hidden" />

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

