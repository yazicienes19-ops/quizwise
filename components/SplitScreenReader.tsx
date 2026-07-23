
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ProcessedDocument } from '../types';
import { generateGroundedExplanation } from '../services/geminiService';
import { getChaptersOrWhole, getTextForChapterDetection, type Chapter } from '../services/chapterService';
import { buildTocTree, type PdfTocEntry } from '../services/pdfOutlineService';
import { TocList } from './DocTocList';
import { markChapterDone, getDoneChapterIndices, isChapterDone } from '../services/chapterProgressService';
import { logReaderQuestion, getReaderLog } from '../services/readerLogService';
import { saveReaderChat, getReaderChat } from '../services/readerChatService';
import { buildFeynmanHandoff, pickHandoffTopic } from '../services/feynmanHandoffService';
import { findQuoteInChapter, type PassageMatch } from '../services/passageHighlight';
import { renderMarkdown } from './markdownRenderer';
import { resolveErrorMessage } from '../services/errorMessages';
import { toast } from '../services/toast';
import { documentDisplayName } from '../services/libraryService';
import { useTranslation } from '../i18n/I18nProvider';
import { DigestStatusBadge } from './SourceStatusBadge';

interface ChatEntry {
  concept: string;
  answer: string | null;
  loading: boolean;
  highlight?: PassageMatch | null;
  /** true, wenn dieses Kapitel allein die Frage nicht abdeckte und stattdessen
   *  im gesamten Dokument nachgesehen wurde. */
  expandedScope?: boolean;
}

interface SplitScreenReaderProps {
  doc: ProcessedDocument;
  userId?: string | null;
  onBack: () => void;
  onStartFeynman: (topic: string | null) => void;
  /** Stößt die Dokument-Analyse erneut an (nur bei Digest-Status 'error' sichtbar). */
  onRetryAnalysis?: () => void;
}

export const SplitScreenReader: React.FC<SplitScreenReaderProps> = ({ doc, userId, onBack, onStartFeynman, onRetryAnalysis }) => {
  const { t } = useTranslation();
  // Text/DOCX: Originaltext direkt lesbar. PDF/Bild: kein Volltext im Browser
  // verfügbar — der KI-Lerndigest ersetzt das Original hier genau wie überall
  // sonst in der App (Quiz, Karteikarten, Erklärer nutzen ihn ebenfalls als
  // Textquelle für PDFs/Bilder, siehe getDocumentSource in useDocuments.ts).
  const hasDirectText = doc.type === 'text' || doc.type === 'docx';
  const fullText = getTextForChapterDetection(doc);
  const usesDigest = !hasDirectText && !!fullText;
  const digestStatus = doc.digestStatus ?? ((doc.type === 'pdf' || doc.type === 'image') ? 'pending' : undefined);
  const isSupported = hasDirectText || !!fullText;
  const chapters = useMemo(() => (isSupported ? getChaptersOrWhole(fullText) : []), [isSupported, fullText]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [doneIndices, setDoneIndices] = useState<number[]>(() => getDoneChapterIndices(doc.id));
  // Gespeicherten Chat wiederherstellen — sonst geht die komplette Konversation
  // beim Verlassen und Wiederöffnen des Readers verloren (nur die reine
  // "gefragt"-Notiz überlebte bisher über readerLogService, nicht die Antwort).
  const [chatByChapter, setChatByChapter] = useState<Record<number, ChatEntry[]>>(() => {
    const stored = getReaderChat(doc.id);
    return Object.fromEntries(
      Object.entries(stored).map(([idx, entries]) => {
        const chapterContent = chapters.find(c => c.index === Number(idx))?.content;
        return [idx, entries.map(e => ({
          ...e,
          loading: false,
          highlight: e.quote && chapterContent ? findQuoteInChapter(e.quote, chapterContent) : null,
        }))];
      })
    );
  });
  // Reiner Recompute-Trigger für den Feynman-Handoff unten (getReaderLog() liest
  // frisch von localStorage, useMemo braucht aber einen sich ändernden Wert in
  // den Dependencies, um nach jeder neuen Frage neu zu berechnen) — bewusst kein
  // Speicher der Fragen selbst, das übernimmt bereits readerLogService.
  const [handoffVersion, setHandoffVersion] = useState(0);
  const [concept, setConcept] = useState('');
  const [tocOpen, setTocOpen] = useState(false);

  const activeChapter: Chapter | undefined = chapters[activeIndex];
  const activeChat = activeChapter ? (chatByChapter[activeChapter.index] ?? []) : [];
  const activeDone = activeChapter ? doneIndices.includes(activeChapter.index) : false;

  // Verschachteltes Inhaltsverzeichnis aus den Kapiteln — dieselbe Baumlogik wie
  // beim PDF-Reader (services/pdfOutlineService.ts), da echte Skripte oft
  // dieselbe Nummerierung ("1.1 Titel", "2.1 Titel") verwenden. `page` trägt
  // hier den Kapitel-Index, nicht eine echte Seitenzahl (showPageLabel=false).
  const [expandedToc, setExpandedToc] = useState<Set<string>>(new Set());
  const tocTree = useMemo(
    () => buildTocTree(chapters.map(c => ({ page: c.index, title: c.title }))),
    [chapters]
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
    const idx = chapters.findIndex(c => c.index === e.page);
    if (idx >= 0) setActiveIndex(idx);
    setTocOpen(false);
  };

  // Zeigt immer den zuletzt gefundenen Beleg für das aktuell offene Kapitel —
  // rein aus chatByChapter abgeleitet, dadurch automatisch korrekt beim
  // Kapitelwechsel (kein zusätzlicher State, keine Racebedingung möglich).
  const displayedHighlight: PassageMatch | null = useMemo(() => {
    for (let i = activeChat.length - 1; i >= 0; i--) {
      if (activeChat[i].highlight) return activeChat[i].highlight!;
    }
    return null;
  }, [activeChat]);
  const highlightRef = useRef<HTMLSpanElement>(null);

  useEffect(() => { setConcept(''); }, [activeIndex]);

  useEffect(() => {
    if (displayedHighlight && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [displayedHighlight]);

  // Chat persistieren (nur abgeschlossene Antworten — Lade-/Fehlerzustände
  // sind nach einem Reload sowieso hinfällig).
  useEffect(() => {
    const persistable: Record<number, { concept: string; answer: string; quote: string | null; expandedScope?: boolean }[]> = {};
    (Object.entries(chatByChapter) as [string, ChatEntry[]][]).forEach(([idx, entries]) => {
      const done = entries.filter(e => !e.loading && e.answer !== null);
      if (done.length > 0) {
        persistable[Number(idx)] = done.map(e => ({
          concept: e.concept, answer: e.answer!, quote: e.highlight?.text ?? null, expandedScope: e.expandedScope,
        }));
      }
    });
    saveReaderChat(doc.id, persistable);
  }, [chatByChapter, doc.id]);

  const handleAsk = useCallback(async () => {
    const trimmed = concept.trim();
    if (trimmed.length <= 2 || !activeChapter) { toast.error(t('rd.enterQuestion')); return; }
    const chapterIndex = activeChapter.index;
    const chapterContent = activeChapter.content;
    const entry: ChatEntry = { concept: trimmed, answer: null, loading: true };
    setChatByChapter(prev => ({ ...prev, [chapterIndex]: [...(prev[chapterIndex] ?? []), entry] }));
    setConcept('');
    try {
      // Erst nur in DIESEM Kapitel suchen. Deckt es die Frage nicht ab
      // (found=false), steht der Begriff evtl. in einem anderen Kapitel —
      // dann transparent im GANZEN Dokument nachsehen, statt fälschlich
      // "steht nicht im Dokument" zu zeigen.
      const scoped = await generateGroundedExplanation({ text: chapterContent }, trimmed);
      let finalAnswer = scoped.answer;
      let quote = scoped.sourceQuote;
      let expandedScope = false;
      if (!scoped.found) {
        // Auch hier die grounded Variante nutzen — sonst könnte ein erfundenes
        // Zitat als Beleg für eine Nicht-Antwort auftauchen (s. Audit-Fund 3).
        const wholeDoc = await generateGroundedExplanation({ text: fullText }, trimmed);
        finalAnswer = wholeDoc.answer;
        quote = wholeDoc.sourceQuote;
        expandedScope = true;
      }
      const highlight = quote ? findQuoteInChapter(quote, chapterContent) : null;
      setChatByChapter(prev => ({
        ...prev,
        [chapterIndex]: (prev[chapterIndex] ?? []).map(e => e === entry ? { ...e, answer: finalAnswer, loading: false, highlight, expandedScope } : e),
      }));
      logReaderQuestion({
        docId: doc.id, docName: documentDisplayName(doc), chapterIndex,
        chapterTitle: activeChapter.title, concept: trimmed, timestamp: Date.now(),
        answer: finalAnswer, wasEscalated: expandedScope,
      }, userId);
      setHandoffVersion(v => v + 1);
    } catch (e) {
      toast.error(resolveErrorMessage(e));
      setChatByChapter(prev => ({
        ...prev,
        [chapterIndex]: (prev[chapterIndex] ?? []).filter(e => e !== entry),
      }));
    }
  }, [concept, activeChapter, doc.id, userId, fullText]);

  const handleMarkDone = () => {
    if (!activeChapter) return;
    markChapterDone(doc.id, activeChapter.index, userId);
    setDoneIndices(getDoneChapterIndices(doc.id));
    toast.success(t('rd.chapterMarkedRead'));
  };

  const handoff = useMemo(() => buildFeynmanHandoff({
    doneChapterIndices: doneIndices,
    chapters,
    readerLog: getReaderLog(doc.id),
  }), [doneIndices, chapters, doc.id, handoffVersion]);

  const handoffTopic = pickHandoffTopic(handoff);
  const handoffFromInteraction = handoff.primary.length > 0;

  const handleStartFeynman = () => {
    onStartFeynman(handoffTopic);
  };

  if (!isSupported) {
    // PDF/Bild ohne fertigen Digest — Grund klar benennen statt generisch "nicht verfügbar"
    if (digestStatus === 'pending') {
      return (
        <div className="max-w-3xl mx-auto py-20 px-4 text-center space-y-4">
          <DigestStatusBadge status="pending" />
          <p className="text-lg font-black dark:text-white">{t('rd.stillAnalyzing')}</p>
          <p className="text-sm text-slate-400 font-medium">{t('rd.digestHint')}</p>
          <button onClick={onBack} className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
            Zurück
          </button>
        </div>
      );
    }
    if (digestStatus === 'error') {
      return (
        <div className="max-w-3xl mx-auto py-20 px-4 text-center space-y-4">
          <DigestStatusBadge status="error" />
          <p className="text-lg font-black dark:text-white">{t('rd.analysisFailed')}</p>
          <p className="text-sm text-slate-400 font-medium">{t('rd.noDigestHint')}</p>
          <div className="flex gap-3 justify-center">
            {onRetryAnalysis && (
              <button onClick={onRetryAnalysis} className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
                Erneut versuchen
              </button>
            )}
            <button onClick={onBack} className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-main)' }}>
              Zurück
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-3xl mx-auto py-20 px-4 text-center space-y-4">
        <p className="text-lg font-black dark:text-white">{t('rd.noReadableText')}</p>
        <button onClick={onBack} className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
          Zurück
        </button>
      </div>
    );
  }

  if (chapters.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-20 px-4 text-center space-y-4">
        <p className="text-lg font-black dark:text-white">{t('dvm.noTextContent')}</p>
        <button onClick={onBack} className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
          Zurück
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 animate-in fade-in duration-700">
      {/* Schlanker Kopf — Dokument-Symbol öffnet das Inhaltsverzeichnis-Overlay
          statt einer permanenten Kapitel-Leiste (analog zum PDF-Reader). */}
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
            <path d="M6 4h9l3 3v13H6z" /><path d="M15 4v3h3" /><path d="M9 12h6M9 16h6" />
          </svg>
        </button>
        <button onClick={onBack} className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          {t('rd.back')}
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base lg:text-lg font-black tracking-tight dark:text-white truncate leading-tight">{t('rd.readScript')}</h1>
          {activeChapter && (
            <p className="text-[11px] font-medium text-slate-400 truncate leading-tight mt-0.5">{activeChapter.title}</p>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.round((doneIndices.length / chapters.length) * 100)}%`, background: 'var(--primary)' }} />
          </div>
          <p className="text-[10px] font-medium text-slate-400 whitespace-nowrap">{doneIndices.length} / {chapters.length}</p>
        </div>
        <button
          onClick={handleStartFeynman}
          disabled={doneIndices.length === 0}
          className="shrink-0 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          {t('rd.toFeynman')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
        {/* Links: Lesen — "Papier"-Hintergrund mit einem "Blatt" darauf (echter,
            selbst gerenderter HTML-Text — anders als beim PDF-Reader kann hier
            eine eigene Lese-Typografie (Serif) verwendet werden). */}
        <div className="relative lg:col-span-7 rounded-[24px] flex flex-col h-[80vh] lg:h-[calc(100vh-6rem)] overflow-hidden" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
          <div
            onClick={() => setTocOpen(false)}
            className="absolute inset-0 rounded-[20px] transition-opacity duration-200 z-10"
            style={{ background: 'rgba(15,17,23,0.36)', opacity: tocOpen ? 1 : 0, pointerEvents: tocOpen ? 'auto' : 'none' }}
          />
          <nav
            aria-hidden={!tocOpen}
            className="absolute inset-y-0 left-0 w-[280px] max-w-[80%] rounded-l-[20px] flex flex-col z-20 shadow-2xl transition-transform duration-200"
            style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-color)', transform: tocOpen ? 'translateX(0)' : 'translateX(-100%)' }}
          >
            <div className="shrink-0 px-5 py-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--text-main)', opacity: 0.55, borderBottom: '1px solid var(--border-color)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
              {t('rd.tocTitle')}
            </div>
            <div className="flex-1 overflow-y-auto px-2.5 py-3">
              <TocList entries={tocTree} depth={0} expanded={expandedToc} activePage={activeChapter?.index ?? null}
                onToggle={toggleTocEntry} onJump={jumpToTocEntry} tocKey={tocKey} showPageLabel={false}
                isDone={idx => doneIndices.includes(idx)} />
            </div>
          </nav>

          {activeChapter && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">
                <article className="max-w-[660px] mx-auto rounded-2xl p-8 lg:p-12" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', boxShadow: '0 1px 2px rgba(20,22,30,0.04), 0 12px 28px -12px rgba(20,22,30,0.14)' }}>
                  <div className="flex items-center justify-between gap-3 mb-6">
                    <h2 className="text-2xl font-semibold tracking-tight break-words" style={{ fontFamily: 'ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif', color: 'var(--text-main)' }}>
                      {activeChapter.title}
                    </h2>
                    {activeDone && (
                      <span className="shrink-0 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                        {t('rd.read')}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[16.5px] leading-[1.75] whitespace-pre-wrap break-words max-w-[62ch]"
                    style={{ fontFamily: 'ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif', color: 'var(--ink2)' }}
                  >
                    {displayedHighlight ? (
                      <>
                        {activeChapter.content.slice(0, displayedHighlight.start)}
                        <span
                          ref={highlightRef}
                          className="rounded px-0.5"
                          style={{ background: 'color-mix(in srgb, var(--primary) 30%, transparent)' }}
                        >
                          {activeChapter.content.slice(displayedHighlight.start, displayedHighlight.end)}
                        </span>
                        {activeChapter.content.slice(displayedHighlight.end)}
                      </>
                    ) : activeChapter.content}
                  </p>
                </article>
              </div>
              <div className="shrink-0 px-4 pb-4 lg:px-8 lg:pb-6">
                <button
                  onClick={handleMarkDone}
                  disabled={activeDone}
                  className="w-full max-w-[660px] mx-auto block py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: activeDone ? 'var(--bg-sidebar)' : 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
                >
                  {activeDone ? t('rd.chapterDoneRead') : t('rd.markChapterDone')}
                </button>
              </div>
            </>
          )}
          {usesDigest && (
            <p className="shrink-0 px-4 pb-2 lg:px-8 text-[10px] font-medium text-slate-400 text-center">{t('rd.digestSourceHint')}</p>
          )}
        </div>

        {/* Rechts: Tutor-Chat */}
        <div className="lg:col-span-3 rounded-[24px] p-4 lg:p-6 gap-4 flex flex-col h-[80vh] lg:h-[calc(100vh-6rem)]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>{t('nav.explainer')}</p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">{t('rd.askChapter')}</p>
          </div>

          <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-2">
            {activeChat.length === 0 && (
              <p className="text-xs text-slate-400 italic">{t('rd.noQuestionsChapter')}</p>
            )}
            {activeChat.map((entry, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black dark:text-white break-words">{entry.concept}</p>
                  {entry.highlight && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest" style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}>
                      {t('rd.textMarked')}
                    </span>
                  )}
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
                  <div className="rounded-2xl p-4" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
                    {renderMarkdown(entry.answer)}
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
              placeholder={t('rd.askPlaceholder')}
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
          {handoffFromInteraction ? (
            <p className="text-xs font-bold dark:text-white">
              {t('rd.feynmanFromInteraction', { topic: handoffTopic })}
            </p>
          ) : handoffTopic ? (
            <p className="text-xs font-bold dark:text-white">
              {t('rd.feynmanSuggest', { topic: handoffTopic })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
};
