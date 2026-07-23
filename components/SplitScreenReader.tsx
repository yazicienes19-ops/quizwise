
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ProcessedDocument } from '../types';
import { generateExplanation, generateGroundedExplanation } from '../services/geminiService';
import { getChaptersOrWhole, getTextForChapterDetection, type Chapter } from '../services/chapterService';
import { markChapterDone, getDoneChapterIndices, isChapterDone } from '../services/chapterProgressService';
import { logReaderQuestion, getReaderLog } from '../services/readerLogService';
import { saveReaderChat, getReaderChat } from '../services/readerChatService';
import { buildFeynmanHandoff, pickHandoffTopic } from '../services/feynmanHandoffService';
import { extractSourceQuote } from '../services/sourceQuoteParser';
import { findQuoteInChapter, type PassageMatch } from '../services/passageHighlight';
import { renderMarkdown } from './markdownRenderer';
import { resolveErrorMessage } from '../services/errorMessages';
import { toast } from '../services/toast';
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
  const [askedConcepts, setAskedConcepts] = useState<Record<number, string[]>>(() => {
    const map: Record<number, string[]> = {};
    getReaderLog(doc.id).forEach(e => {
      map[e.chapterIndex] = [...(map[e.chapterIndex] ?? []), e.concept];
    });
    return map;
  });
  const [concept, setConcept] = useState('');

  const activeChapter: Chapter | undefined = chapters[activeIndex];
  const activeChat = activeChapter ? (chatByChapter[activeChapter.index] ?? []) : [];
  const activeDone = activeChapter ? doneIndices.includes(activeChapter.index) : false;

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
        finalAnswer = await generateExplanation({ text: fullText }, trimmed, false, false);
        quote = null;
        expandedScope = true;
      }
      const highlight = quote ? findQuoteInChapter(quote, chapterContent) : null;
      setChatByChapter(prev => ({
        ...prev,
        [chapterIndex]: (prev[chapterIndex] ?? []).map(e => e === entry ? { ...e, answer: finalAnswer, loading: false, highlight, expandedScope } : e),
      }));
      logReaderQuestion({ docId: doc.id, chapterIndex, chapterTitle: activeChapter.title, concept: trimmed, timestamp: Date.now() }, userId);
      setAskedConcepts(prev => ({ ...prev, [chapterIndex]: [...(prev[chapterIndex] ?? []), trimmed] }));
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
  }), [doneIndices, chapters, doc.id, askedConcepts]);

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
    <div className="max-w-7xl mx-auto py-6 lg:py-10 px-4 space-y-6 animate-in fade-in duration-700 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <button onClick={onBack} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mb-1">
            {t('rd.back')}
          </button>
          <h1 className="text-2xl lg:text-4xl font-black tracking-tight dark:text-white break-words">{t('rd.readScript')}</h1>
          {usesDigest && (
            <p className="text-[10px] font-medium text-slate-400 mt-1">
              {t('rd.digestSourceHint')}
            </p>
          )}
        </div>
        <button
          onClick={handleStartFeynman}
          disabled={doneIndices.length === 0}
          className="shrink-0 px-5 py-3 lg:px-6 lg:py-4 rounded-2xl text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          {t('rd.toFeynman')}
        </button>
      </div>

      {/* Kapitel-Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {chapters.map((c, idx) => (
          <button
            key={c.index}
            onClick={() => setActiveIndex(idx)}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
            style={activeIndex === idx
              ? { background: 'var(--primary)', color: 'var(--primary-text)' }
              : { background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
          >
            {doneIndices.includes(c.index) && <span>✓</span>}
            <span className="max-w-[160px] truncate">{c.title}</span>
          </button>
        ))}
      </div>

      {/* Split-Screen */}
      {activeChapter && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Links: Lesen */}
          <div className="rounded-[32px] p-6 lg:p-8 space-y-5" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black dark:text-white break-words">{activeChapter.title}</h2>
              {activeDone && (
                <span className="shrink-0 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                  {t('rd.read')}
                </span>
              )}
            </div>
            <div className="max-h-[55vh] overflow-y-auto pr-2 space-y-4">
              <p className="text-sm lg:text-base font-medium text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
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
            </div>
            <button
              onClick={handleMarkDone}
              disabled={activeDone}
              className="w-full py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: activeDone ? 'var(--bg-main)' : 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
            >
              {activeDone ? t('rd.chapterDoneRead') : t('rd.markChapterDone')}
            </button>
          </div>

          {/* Rechts: Erklärer-Chat */}
          <div className="rounded-[32px] p-6 lg:p-8 space-y-5 flex flex-col" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>{t('nav.explainer')}</p>
              <p className="text-xs text-slate-400 font-medium">{t('rd.askChapter')}</p>
            </div>

            <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-2">
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

            <div className="mt-auto pt-2 flex gap-2">
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
      )}

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
