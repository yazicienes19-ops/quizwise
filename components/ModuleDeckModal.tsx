import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n/I18nProvider';
import { useModalA11y } from '../hooks/useModalA11y';
import { ModalCloseButton } from './ModalCloseButton';
import type { Collection, ExamTerm, Flashcard, FlashcardDeck, ProcessedDocument } from '../types';
import { planModule, suggestNewPerDay, docTag, type ModuleLevel } from '../services/moduleDeck';
import { generateFlashcardsFromDocument } from '../services/geminiService';
import { nextExamForModule } from '../services/examTermService';
import { createSrsState } from '../services/spacedRepetition';
import { resolveErrorMessage } from '../services/errorMessages';
import { GeneratedCardsEditor, splitDraft, type DraftCard } from './GeneratedCardsEditor';

interface Props {
  collections: Collection[];
  documents: ProcessedDocument[];
  examTerms: ExamTerm[];
  initialCollectionId?: string | null;
  onCreate: (deck: FlashcardDeck) => void;
  onSetNewPerDay: (perDay: number) => void;
  onClose: () => void;
}

const newId = () => Math.random().toString(36).slice(2, 11);
const normFront = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Ganzes Fach als Karteikarten (angelehnt an Retain Cards): alle Dokumente
 * abschnittsweise, ein Stapel pro Fach, Dokumentname als Schlagwort, dazu
 * ein Vorschlag fürs Tageslimit bis zur Klausur.
 */
export const ModuleDeckModal: React.FC<Props> = ({ collections, documents, examTerms, initialCollectionId, onCreate, onSetNewPerDay, onClose }) => {
  const { t, tp } = useTranslation();
  const { titleId, dialogProps } = useModalA11y(onClose);
  const [colId, setColId] = useState(initialCollectionId && collections.some(c => c.id === initialCollectionId) ? initialCollectionId : collections[0]?.id ?? '');
  const [level, setLevel] = useState<ModuleLevel>('standard');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ doc: string; done: number; total: number; cards: number } | null>(null);
  const [result, setResult] = useState<{ cards: number; stopped: string | null } | null>(null);
  /** Prüfschritt: erzeugte Karten vor dem Speichern bearbeiten (GeneratedCardsEditor). */
  const [review, setReview] = useState<{ title: string; cards: DraftCard[]; stopped: string | null } | null>(null);
  const cancelRef = useRef(false);

  const col = collections.find(c => c.id === colId) ?? null;
  const docs = useMemo(() => documents.filter(d => d.collectionId === colId), [documents, colId]);
  const plans = useMemo(() => ({
    overview: planModule(docs, 'overview'), standard: planModule(docs, 'standard'), thorough: planModule(docs, 'thorough'),
  }), [docs]);
  const plan = plans[level];
  const exam = col ? nextExamForModule(examTerms, col, new Date()) : null;
  const suggestion = exam ? suggestNewPerDay(result?.cards ?? plan.totalCards, exam.date) : null;

  const start = async () => {
    if (!col || !plan.totalCards) return;
    setRunning(true); cancelRef.current = false;
    const cards: Flashcard[] = [];
    const seen = new Set<string>();
    let done = 0;
    let stopped: string | null = null;
    outer: for (const pd of plan.docs) {
      const tag = docTag(pd.doc);
      for (const chunk of pd.chunks) {
        if (cancelRef.current) { stopped = t('mod.cancelled'); break outer; }
        setProgress({ doc: pd.doc.name, done, total: plan.calls, cards: cards.length });
        try {
          const made = await generateFlashcardsFromDocument({ text: chunk.text }, chunk.count, cards.slice(-30).map(c => c.front));
          for (const c of made) {
            const key = normFront(c.front ?? '');
            if (!key || seen.has(key)) continue;
            seen.add(key);
            cards.push({ id: newId(), front: c.front!, back: c.back ?? '', tags: [tag], level: 0, nextReview: Date.now(), lastInterval: 0, srs: createSrsState() });
          }
        } catch (e) {
          // Budget oder Netz: mit dem Erzeugten weitermachen statt alles zu verlieren
          stopped = resolveErrorMessage(e);
          break outer;
        }
        done++;
      }
    }
    setProgress(null);
    setRunning(false);
    if (cards.length) setReview({ title: col.name, cards, stopped });
    else setResult({ cards: 0, stopped });
  };

  const saveReview = () => {
    if (!review) return;
    const { keep } = splitDraft(review.cards);
    const cards: Flashcard[] = keep.map(d => ({
      id: d.id, front: d.front.trim(), back: d.back.trim(), ...(d.tags ? { tags: d.tags } : {}),
      level: 0, nextReview: Date.now(), lastInterval: 0, srs: createSrsState(),
    }));
    if (cards.length) onCreate({ id: newId(), title: review.title.trim() || col?.name || '', cards });
    setResult({ cards: cards.length, stopped: review.stopped });
    setReview(null);
  };

  const levelBtn = (l: ModuleLevel) => (
    <button key={l} type="button" onClick={() => setLevel(l)} aria-pressed={level === l} disabled={running}
      className={`flex-1 text-left px-3 py-2.5 rounded-xl border transition-colors ${level === l ? 'border-slate-800 dark:border-slate-200 bg-slate-50 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-700'}`}>
      <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">{t(`mod.level.${l}` as const)}</span>
      <span className="block text-xs text-slate-500 dark:text-slate-400">{tp('mod.aboutCards', plans[l].totalCards)}</span>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={running ? undefined : onClose}>
      <div {...dialogProps} className={`bg-white dark:bg-slate-900 rounded-[24px] w-full ${review ? 'max-w-3xl' : 'max-w-xl'} shadow-3d-deep max-h-[92vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-4 px-6 sm:px-8 py-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 id={titleId} className="text-xl font-black dark:text-white">{t('mod.title')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('mod.subtitle')}</p>
          </div>
          {review && <p className="sr-only">{t('rev.subtitle')}</p>}
          {!running && !review && <ModalCloseButton onClick={onClose} label={t('common.close')} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl" />}
        </div>

        <div className="px-6 sm:px-8 py-5 space-y-5">
          {review ? (
            <GeneratedCardsEditor title={review.title} cards={review.cards} makeId={newId}
              onChange={next => setReview(r => (r ? { ...r, ...next } : r))} />
          ) : result ? (
            <div className="space-y-3">
              <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                {result.cards ? tp('mod.done', result.cards, { name: col?.name ?? '' }) : t('mod.none')}
              </p>
              {result.stopped && <p className="text-xs text-amber-700 dark:text-amber-300">{t('mod.stopped', { reason: result.stopped })}</p>}
              {result.cards > 0 && exam && suggestion && (
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 space-y-2">
                  <p className="text-[13px] text-slate-700 dark:text-slate-200">
                    {t('mod.plan', { date: new Date(`${exam.date}T12:00`).toLocaleDateString(), n: suggestion.perDay, days: suggestion.days })}
                  </p>
                  <button type="button" onClick={() => { onSetNewPerDay(suggestion.perDay); onClose(); }}
                    className="px-4 py-2 rounded-xl text-[13px] font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
                    {t('mod.applyLimit', { n: suggestion.perDay })}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <label className="block space-y-1 text-xs font-semibold text-slate-500">
                {t('mod.subject')}
                <select value={colId} onChange={e => setColId(e.target.value)} disabled={running}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm font-normal text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                  {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tp('mod.docsN', plan.docs.length)}
                {plan.skipped.length > 0 && ` · ${tp('mod.skippedN', plan.skipped.length)}`}
                {exam && ` · ${t('mod.exam', { date: new Date(`${exam.date}T12:00`).toLocaleDateString() })}`}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">{(['overview', 'standard', 'thorough'] as const).map(levelBtn)}</div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('mod.budgetHint', { calls: plan.calls })}</p>
              {progress && (
                <div className="space-y-2" aria-live="polite">
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%`, background: 'var(--primary)' }} />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{t('mod.progress', { doc: progress.doc, n: progress.cards, done: progress.done, total: progress.total })}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 sm:px-8 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
          {review ? (
            <>
              <button type="button" onClick={() => { setReview(null); onClose(); }} className="px-5 py-3 rounded-2xl text-[13px] font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200">{t('rev.discard')}</button>
              <button type="button" onClick={saveReview} disabled={!splitDraft(review.cards).keep.length}
                className="px-6 py-3 rounded-2xl text-[13px] font-semibold shadow-lg disabled:opacity-40" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
                {tp('rev.save', splitDraft(review.cards).keep.length)}
              </button>
            </>
          ) : result ? (
            <button type="button" onClick={onClose} className="px-5 py-3 rounded-2xl text-[13px] font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200">{t('common.close')}</button>
          ) : running ? (
            <button type="button" onClick={() => { cancelRef.current = true; }} className="px-5 py-3 rounded-2xl text-[13px] font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200">{t('mod.stop')}</button>
          ) : (
            <button type="button" onClick={start} disabled={!plan.totalCards}
              className="px-6 py-3 rounded-2xl text-[13px] font-semibold shadow-lg disabled:opacity-40" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
              {tp('mod.start', plan.totalCards)}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
