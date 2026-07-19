
import React, { useState, useEffect, useMemo } from 'react';
import { ProcessedDocument, Collection, TopicMetric, FlashcardDeck } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { generateExplanation } from '../services/geminiService';
import { extractSourceQuote, stripSourceQuoteLine } from '../services/sourceQuoteParser';
import { SourceSelector } from './SourceSelector';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';
import type { TKey } from '../i18n';
import { documentDisplayName } from '../services/libraryService';
import { buildCollectionSource } from '../services/collectionSource';
import { toast } from '../services/toast';
import { buildLearningProfile } from '../services/learningProfileService';
import { getAllResults } from '../services/quizHistoryService';
import { getAllRecallResults } from '../services/recallHistoryService';
import { getAllExamResults } from '../services/examHistoryService';
import { getStreak } from '../services/streakService';
import { renderMarkdown } from './markdownRenderer';

// ─── Verlauf (lokal) ──────────────────────────────────────────────────────────

const HISTORY_KEY = 'quizwise_explainer_history_v2';
const HISTORY_MAX = 8;

interface HistoryEntry { concept: string; docName: string; timestamp: number; }

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function pushHistory(entry: HistoryEntry): HistoryEntry[] {
  const rest = loadHistory().filter(h => h.concept.toLowerCase() !== entry.concept.toLowerCase());
  const next = [entry, ...rest].slice(0, HISTORY_MAX);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  return next;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'setup' | 'loading' | 'explanation';

interface ExplainerSystemProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  initialDoc?: ProcessedDocument;
  metrics: TopicMetric[];
  decks: FlashcardDeck[];
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export const ExplainerSystem: React.FC<ExplainerSystemProps> = ({
  availableDocuments, collections, getDocumentSource, onSaveToLibrary, initialDoc, metrics, decks,
}) => {
  const { t } = useTranslation();
  const [step, setStep]                   = useState<Step>('setup');
  const [activeSource, setActiveSource]   = useState<GenerationSource | null>(null);
  const [activeSourceName, setActiveSourceName] = useState('');
  const [concept, setConcept]             = useState('');
  const [useExternal, setUseExternal]     = useState(false);
  const [explanation, setExplanation]     = useState<string | null>(null);
  const [explainedConcept, setExplainedConcept] = useState('');
  /** Wörtliches Zitat aus der Quelle, auf das sich die Erklärung stützt. */
  const [sourceQuote, setSourceQuote]     = useState<string | null>(null);
  const [history, setHistory]             = useState<HistoryEntry[]>(loadHistory);

  // ── Lernprofil: schwache Themen als Vorschläge ──
  const profile = useMemo(() => buildLearningProfile({
    metrics, decks,
    quizResults: getAllResults(),
    recallResults: getAllRecallResults(),
    examResults: getAllExamResults(),
    streak: getStreak(),
  }), [metrics, decks]);
  const suggestions = useMemo(() =>
    profile.topicMastery.filter(t => t.security !== 'sicher').slice(0, 5),
  [profile.topicMastery]);

  useEffect(() => {
    if (initialDoc && getDocumentSource) {
      try {
        setActiveSource(getDocumentSource(initialDoc));
        setActiveSourceName(documentDisplayName(initialDoc));
      } catch (_) {}
      return;
    }
    // Aktives Fach: Quelle direkt vorbelegen — kein Quellen-Klick nötig
    const moduleId = localStorage.getItem('quizwise_active_module');
    const col = moduleId ? collections.find(c => c.id === moduleId) : null;
    if (col) {
      const result = buildCollectionSource(col, availableDocuments);
      if (result && result.includedCount > 0) {
        setActiveSource(result.source);
        setActiveSourceName(result.name);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectDocument = (doc: ProcessedDocument) => {
    const source = getDocumentSource ? getDocumentSource(doc) : doc.type === 'pdf' ? { file: { data: doc.content, mimeType: 'application/pdf' } } : { text: doc.content };
    setActiveSource(source);
    setActiveSourceName(documentDisplayName(doc));
  };

  const canStart = concept.trim().length > 2 && (!!activeSource || useExternal);

  // ── Erklärung generieren ──

  const handleExplain = async (overrideConcept?: string) => {
    const trimmed = (overrideConcept ?? concept).trim();
    if (trimmed.length <= 2) { toast.error(t('ex.pleaseEnterConcept')); return; }
    if (!activeSource && !useExternal) { toast.error(t('ex.pleaseChooseDoc')); return; }
    setConcept(trimmed);
    setStep('loading');
    try {
      // Quellen-Zitat nur anfordern, wenn eine echte Quelle da ist — bei reinem
      // Allgemeinwissen gibt es nichts zu zitieren.
      const result = await generateExplanation(activeSource, trimmed, useExternal, !!activeSource);
      setExplanation(stripSourceQuoteLine(result));
      setSourceQuote(activeSource ? extractSourceQuote(result) : null);
      setExplainedConcept(trimmed);
      setHistory(pushHistory({ concept: trimmed, docName: activeSourceName || 'Allgemeinwissen', timestamp: Date.now() }));
      setStep('explanation');
    } catch {
      toast.error(t('ex.explFailed'));
      setStep('setup');
    }
  };

  const handleNewConcept = () => {
    setConcept('');
    setExplanation(null);
    setExplainedConcept('');
    setSourceQuote(null);
    setStep('setup');
  };

  // ── Render ──

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-6 lg:py-10 px-4 animate-in fade-in duration-700 pb-32">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-4xl lg:text-6xl font-black tracking-tighter dark:text-white">
          {t('nav.explainer')}
        </h1>
        <p className="text-sm text-slate-400 font-medium">
          {t('ex.subtitle')}
        </p>
      </div>

      {/* ── SETUP ── */}
      {step === 'setup' && (
        <div className="space-y-5">

          {/* Dokument */}
          {activeSource ? (
            <div className="flex items-center justify-between px-5 py-4 rounded-2xl" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
                <span className="text-sm font-black break-words max-w-[260px]" style={{ color: 'var(--primary)' }}>{activeSourceName}</span>
              </div>
              <button onClick={() => { setActiveSource(null); setActiveSourceName(''); }} className="text-slate-400 hover:text-rose-500 transition-colors font-black text-xs shrink-0 ml-3">{t('ex.remove')}</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('ex.chooseMaterial')}</p>
              <SourceSelector
                documents={availableDocuments} collections={collections}
                onSelectDocument={handleSelectDocument}
                onSelectSource={(source, name) => { setActiveSource(source); setActiveSourceName(name); }}
                onSaveToLibrary={onSaveToLibrary} isLoading={false}
              />
            </div>
          )}

          {/* Vorschläge aus dem Lernprofil */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('ex.unsureTopics')}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map(s => (
                  <button
                    key={s.topic}
                    onClick={() => setConcept(s.topic)}
                    className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${s.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 10%, var(--bg-sidebar))`,
                      color: s.security === 'kritisch' ? '#f43f5e' : '#f59e0b',
                      border: `1px solid color-mix(in srgb, ${s.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 25%, transparent)`,
                    }}
                  >
                    {s.topic} · {t((`sec.${s.security}`) as TKey)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Konzept */}
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('ex.whatUnderstand')}</p>
            <input
              type="text"
              value={concept}
              onChange={e => setConcept(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canStart) handleExplain(); }}
              placeholder={t('ex.conceptPlaceholder')}
              className="w-full px-5 py-4 rounded-2xl text-base font-bold outline-none transition-all"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              autoFocus
            />
          </div>

          {/* Wissensquelle */}
          <button
            onClick={() => setUseExternal(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all hover:opacity-90"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
          >
            <div className="text-left space-y-0.5 min-w-0 pr-3">
              <p className="text-[10px] font-black uppercase tracking-widest dark:text-white">{t('ex.supplementGeneral')}</p>
              <p className="text-[10px] font-medium text-slate-400">
                {useExternal
                  ? t('ex.supplementOn')
                  : t('ex.supplementOff')}
              </p>
            </div>
            <div
              className="w-11 h-6 rounded-full p-0.5 shrink-0 transition-all"
              style={{ background: useExternal ? 'var(--primary)' : 'var(--border-color)' }}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${useExternal ? 'translate-x-5' : ''}`} />
            </div>
          </button>

          <button
            onClick={() => handleExplain()}
            disabled={!canStart}
            className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {t('ex.explainThis')}
          </button>

          {/* Hinweis warum Dokument fehlt */}
          {!activeSource && !useExternal && (
            <p className="text-center text-[10px] text-slate-400 font-medium">
              {t('ex.noDocHint')}
            </p>
          )}

          {/* Verlauf */}
          {history.length > 0 && (
            <div className="pt-4 space-y-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('ex.lastExplained')}</p>
              <div className="space-y-1.5">
                {history.map(h => (
                  <button
                    key={`${h.concept}-${h.timestamp}`}
                    onClick={() => setConcept(h.concept)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-left transition-all hover:opacity-80"
                    style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
                  >
                    <span className="text-xs font-bold break-words dark:text-white">{h.concept}</span>
                    <span className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[9px] font-medium text-slate-400 break-words max-w-[120px]">{h.docName}</span>
                      <span className="text-[9px] font-medium text-slate-400">
                        {formatDate(h.timestamp, { day: '2-digit', month: 'short' })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LOADING ── */}
      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center">
          <div className="relative w-20 h-20">
            <div className="w-20 h-20 rounded-full" style={{ border: '6px solid var(--border-color)' }} />
            <div className="w-20 h-20 rounded-full absolute top-0 left-0 animate-spin" style={{ border: '6px solid var(--primary)', borderTopColor: 'transparent' }} />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-black uppercase tracking-widest dark:text-white">{t('ex.explaining')}</p>
            <p className="text-sm text-slate-400 font-medium">
              {activeSource ? t('ex.preparingFrom', { concept, source: activeSourceName || t('ex.yourDocument') }) : t('ex.preparing', { concept })}
            </p>
          </div>
        </div>
      )}

      {/* ── EXPLANATION ── */}
      {step === 'explanation' && (
        <div className="space-y-5 animate-in fade-in duration-500">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
                {activeSourceName ? t('ex.fromSource', { source: activeSourceName }) : t('ex.fromGeneral')}
              </p>
              <h2 className="text-2xl font-black dark:text-white break-words">{explainedConcept}</h2>
            </div>
            {explanation && (
              <button onClick={() => { navigator.clipboard.writeText(explanation); toast.success(t('ex.copied')); }}
                className="p-3 rounded-xl text-slate-400 transition-colors shrink-0 hover:opacity-80" title={t('ex.copy')}
                style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            )}
          </div>

          {explanation && (
            <div className="rounded-[32px] p-8 space-y-6" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              {renderMarkdown(explanation)}
            </div>
          )}

          {/* Beleg aus der Quelle: worauf stützt sich die Erklärung? */}
          {sourceQuote && (
            <div className="rounded-2xl p-4" style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}>
              <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>
                {activeSourceName ? t('ex.quoteFrom', { source: activeSourceName }) : t('ex.quoteLabel')}
              </p>
              <p className="text-xs font-medium italic text-slate-600 dark:text-slate-300 break-words">„{sourceQuote}"</p>
            </div>
          )}

          {/* Direkt nächstes Konzept aus derselben Quelle */}
          <div className="rounded-[24px] p-5 space-y-3" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{activeSourceName ? t('ex.nextConceptFrom', { source: activeSourceName }) : t('ex.nextConcept')}</p>
            <input
              type="text"
              value={concept === explainedConcept ? '' : concept}
              onChange={e => setConcept(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.currentTarget.value.trim().length > 2) handleExplain(e.currentTarget.value); }}
              placeholder={t('ex.conceptEnterPlaceholder')}
              className="w-full px-5 py-3.5 rounded-2xl text-base font-bold outline-none transition-all"
              style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
            />
          </div>

          <div className="flex gap-3">
            <button onClick={handleNewConcept} className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest border-2 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300 transition-all">
              {t('ex.backToSelection')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
