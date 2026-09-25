import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n/I18nProvider';
import { useModalA11y } from '../hooks/useModalA11y';
import { ModalCloseButton } from './ModalCloseButton';
import type { Collection, ExamTerm, Flashcard, FlashcardDeck, ProcessedDocument } from '../types';
import { planModule, suggestNewPerDay, docTag, type FullText, type ModuleLevel } from '../services/moduleDeck';
import { generateFlashcardsFromDocument } from '../services/geminiService';
import { nextExamForModule } from '../services/examTermService';
import { createSrsState } from '../services/spacedRepetition';
import { resolveErrorMessage } from '../services/errorMessages';
import { canReadFullText, readPdfFullText } from '../services/pdfFullText';
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
/** Gleichzeitige Anfragen beim Erzeugen; mehr bringt kaum Tempo und reizt das Ratenlimit. */
const PARALLEL = 3;
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
  /** Volltext der PDFs (null = keine Textebene, dann Zusammenfassung). */
  const [fullTexts, setFullTexts] = useState<ReadonlyMap<string, FullText | null>>(new Map());
  const [reading, setReading] = useState<{ doc: string; done: number; total: number } | null>(null);

  const col = collections.find(c => c.id === colId) ?? null;
  const docs = useMemo(() => documents.filter(d => d.collectionId === colId), [documents, colId]);

  // PDFs des Fachs vollständig lesen, damit die Karten den ganzen Inhalt abdecken
  useEffect(() => {
    let cancelled = false;
    const todo = docs.filter(d => canReadFullText(d) && !fullTexts.has(d.id));
    if (!todo.length) return;
    // Sofort als "wird gelesen" markieren, auch während des Downloads: sonst wirkt die alte Schätzung fertig
    setReading({ doc: todo[0].name, done: 0, total: 0 });
    (async () => {
      for (const d of todo) {
        if (cancelled) return;
        setReading({ doc: d.name, done: 0, total: 0 });
        let text: FullText | null = null;
        try {
          text = await readPdfFullText(d, (done, total) => { if (!cancelled) setReading({ doc: d.name, done, total }); }, () => cancelled);
        } catch { /* nicht ladbar: Zusammenfassung */ }
        if (cancelled) return;
        setFullTexts(m => new Map(m).set(d.id, text));
      }
      if (!cancelled) setReading(null);
    })();
    return () => { cancelled = true; setReading(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei Fachwechsel neu lesen
  }, [docs]);

  const readTexts = useMemo(() => {
    const m = new Map<string, FullText>();
    fullTexts.forEach((v, k) => { if (v) m.set(k, v); });
    return m;
  }, [fullTexts]);
  const summaryOnly = docs.filter(d => canReadFullText(d) && fullTexts.get(d.id) === null).length;
  const plans = useMemo(() => ({
    overview: planModule(docs, 'overview', readTexts), standard: planModule(docs, 'standard', readTexts), thorough: planModule(docs, 'thorough', readTexts),
  }), [docs, readTexts]);
  const plan = plans[level];
  const exam = col ? nextExamForModule(examTerms, col, new Date()) : null;
  const suggestion = exam ? suggestNewPerDay(result?.cards ?? plan.totalCards, exam.date) : null;

  const start = async () => {
    if (!col || !plan.totalCards || reading) return;
    setRunning(true); cancelRef.current = false;
    // Alle Abschnitte in Reihenfolge; Ergebnisse je Abschnitt, damit die Karten trotz paralleler Anfragen geordnet bleiben
    const jobs = plan.docs.flatMap(pd => pd.chunks.map(chunk => ({ pd, chunk, tag: docTag(pd.doc) })));
    const results: Flashcard[][] = jobs.map(() => []);
    const seen = new Set<string>();
    const recent: string[] = [];
    let next = 0;
    let done = 0;
    let made = 0;
    let stopped: string | null = null;
    const worker = async () => {
      while (next < jobs.length && !stopped) {
        if (cancelRef.current) { stopped = t('mod.cancelled'); return; }
        const i = next++;
        const { pd, chunk, tag } = jobs[i];
        setProgress({ doc: pd.doc.name, done, total: jobs.length, cards: made });
        try {
          const out = await generateFlashcardsFromDocument({ text: chunk.text }, chunk.count, recent.slice(-30));
          for (const c of out) {
            const key = normFront(c.front ?? '');
            if (!key || seen.has(key)) continue;
            seen.add(key);
            recent.push(c.front!);
            results[i].push({ id: newId(), front: c.front!, back: c.back ?? '', tags: [tag], level: 0, nextReview: Date.now(), lastInterval: 0, srs: createSrsState() });
            made++;
          }
        } catch (e) {
          // Budget oder Netz: mit dem Erzeugten weitermachen statt alles zu verlieren
          stopped ??= resolveErrorMessage(e);
          return;
        }
        done++;
        setProgress({ doc: pd.doc.name, done, total: jobs.length, cards: made });
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));
    const cards = results.flat();
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
      <span className="block text-xs text-slate-500 dark:text-slate-400">{reading ? t('mod.counting') : tp('mod.aboutCards', plans[l].totalCards)}</span>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={running ? undefined : onClose}>
      <div {...dialogProps} className={`bg-[var(--card)] dark:bg-slate-900 rounded-[24px] w-full ${review ? 'max-w-3xl' : 'max-w-xl'} shadow-3d-deep max-h-[92vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-4 px-6 sm:px-8 py-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 id={titleId} className="text-xl font-semibold dark:text-white">{t('mod.title')}</h2>
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
                {summaryOnly > 0 && ` · ${tp('mod.summaryOnly', summaryOnly)}`}
                {exam && ` · ${t('mod.exam', { date: new Date(`${exam.date}T12:00`).toLocaleDateString() })}`}
              </p>
              {reading && (
                <div className="space-y-2" aria-live="polite">
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full transition-all" style={{ width: `${(reading.done / Math.max(1, reading.total)) * 100}%`, background: 'var(--primary)' }} />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{reading.total ? t('mod.reading', { doc: reading.doc, done: reading.done, total: reading.total }) : t('mod.loadingDoc', { doc: reading.doc })}</p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">{(['overview', 'standard', 'thorough'] as const).map(levelBtn)}</div>
              {!reading && <p className="text-xs text-slate-500 dark:text-slate-400">{t('mod.budgetHint', { calls: plan.calls })}</p>}
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
            <button type="button" onClick={start} disabled={!plan.totalCards || !!reading}
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
