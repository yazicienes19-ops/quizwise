import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, RotateCcw, X } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import type { Flashcard } from '../types';
import { CardImage } from './CardImage';

export interface DraftCard extends Pick<Flashcard, 'id' | 'front' | 'back' | 'tags' | 'frontImage' | 'backImage'> {
  removed?: boolean;
}

interface Props {
  title: string;
  cards: DraftCard[];
  onChange: (next: { title: string; cards: DraftCard[] }) => void;
  makeId: () => string;
}

/** Textfeld, das mit dem Inhalt mitwächst (Höhe aus dem tatsächlichen Inhalt, nie abgeschnitten). */
const Grow: React.FC<{ value: string; onChange: (v: string) => void; label: string; placeholder?: string; strong?: boolean }> = ({ value, onChange, label, placeholder, strong }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
  <textarea
    ref={ref}
    value={value}
    onChange={e => onChange(e.target.value)}
    aria-label={label}
    placeholder={placeholder}
    rows={1}
    className={`w-full resize-none rounded-lg px-2.5 py-1.5 text-[13.5px] leading-snug bg-transparent outline-none border border-transparent focus:border-slate-300 dark:focus:border-slate-600 focus:bg-white dark:focus:bg-slate-900 overflow-hidden ${strong ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}
  />
  );
};

/**
 * Prüfschritt nach dem Erzeugen (wie Retain: "review and customize"): jede
 * Karte direkt bearbeiten, entfernen oder zurückholen, eigene ergänzen,
 * Stapelnamen ändern. Gespeichert wird erst danach, durch den Aufrufer.
 */
export const GeneratedCardsEditor: React.FC<Props> = ({ title, cards, onChange, makeId }) => {
  const { t, tp } = useTranslation();
  const [focusNew, setFocusNew] = useState<string | null>(null);
  const kept = cards.filter(c => !c.removed && (c.front.trim() || c.frontImage)).length;
  const update = (id: string, patch: Partial<DraftCard>) =>
    onChange({ title, cards: cards.map(c => (c.id === id ? { ...c, ...patch } : c)) });
  const add = () => {
    const id = makeId();
    setFocusNew(id);
    onChange({ title, cards: [...cards, { id, front: '', back: '' }] });
  };

  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-xs font-semibold text-slate-500">
        {t('rev.deckTitle')}
        <input value={title} onChange={e => onChange({ title: e.target.value, cards })}
          className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 outline-none" />
      </label>
      <p className="text-xs text-slate-500 dark:text-slate-400">{tp('rev.summary', kept, { total: cards.length })}</p>

      <ol className="space-y-2">
        {cards.map((c, i) => (
          <li key={c.id} className={`rounded-2xl border px-3 py-2 ${c.removed ? 'border-dashed border-slate-200 dark:border-slate-700 opacity-60' : 'border-slate-200 dark:border-slate-700'}`}>
            <div className="flex items-start gap-2">
              <span className="text-[11px] text-slate-400 w-6 pt-2 text-right tabular-nums shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0 grid md:grid-cols-2 gap-1">
                {c.removed ? (
                  <p className="md:col-span-2 text-[13px] text-slate-500 line-through px-2.5 py-1.5 break-words">{c.front}</p>
                ) : (
                  <>
                    <div>
                      <Grow value={c.front} onChange={v => update(c.id, { front: v })} label={t('rev.front', { n: i + 1 })} placeholder={t('ecm.frontPlaceholder')} strong />
                      {c.frontImage && <CardImage path={c.frontImage} alt="" className="h-14 w-20 object-cover rounded-md ml-2.5 mt-1" />}
                    </div>
                    <div>
                      <Grow value={c.back} onChange={v => update(c.id, { back: v })} label={t('rev.back', { n: i + 1 })} placeholder={t('ecm.backPlaceholder')} />
                      {c.backImage && <CardImage path={c.backImage} alt="" className="h-14 w-20 object-cover rounded-md ml-2.5 mt-1" />}
                    </div>
                    {focusNew === c.id && <span className="sr-only" aria-live="polite">{t('rev.added')}</span>}
                  </>
                )}
                {c.tags && c.tags.length > 0 && !c.removed && (
                  <div className="md:col-span-2 flex flex-wrap gap-1 px-2.5 pb-1">
                    {c.tags.map(tag => <span key={tag} className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary-ink)' }}>#{tag}</span>)}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => update(c.id, { removed: !c.removed })}
                aria-label={c.removed ? t('rev.restore', { n: i + 1 }) : t('rev.remove', { n: i + 1 })}
                title={c.removed ? t('rev.restore', { n: i + 1 }) : t('rev.remove', { n: i + 1 })}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 shrink-0">
                {c.removed ? <RotateCcw className="w-4 h-4" /> : <X className="w-4 h-4" />}
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" onClick={add} className="flex items-center gap-2 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
        <Plus className="w-4 h-4" aria-hidden="true" /> {t('rev.add')}
      </button>
    </div>
  );
};

/** Übernommene Karten: nicht entfernt und mit Inhalt; entfernte zurückgeben (für Bild-Aufräumen). */
export const splitDraft = (cards: DraftCard[]) => ({
  keep: cards.filter(c => !c.removed && (c.front.trim() || c.frontImage) && (c.back.trim() || c.backImage || /\{\{c\d*::/.test(c.front))),
  dropped: cards.filter(c => c.removed || !(c.front.trim() || c.frontImage) || !(c.back.trim() || c.backImage || /\{\{c\d*::/.test(c.front))),
});

/** Fenster um den Prüfschritt, für die Erzeugung aus einem Dokument. */
export const GeneratedCardsReviewModal: React.FC<{
  initialTitle: string;
  cards: DraftCard[];
  makeId: () => string;
  onSave: (title: string, keep: DraftCard[], dropped: DraftCard[]) => void;
  onDiscard: (all: DraftCard[]) => void;
}> = ({ initialTitle, cards, makeId, onSave, onDiscard }) => {
  const { t, tp } = useTranslation();
  const [draft, setDraft] = useState({ title: initialTitle, cards });
  const { keep, dropped } = splitDraft(draft.cards);
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-labelledby="rev-title" className="bg-white dark:bg-slate-900 rounded-[24px] w-full max-w-3xl shadow-3d-deep max-h-[92vh] flex flex-col">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-100 dark:border-slate-800">
          <h2 id="rev-title" className="text-xl font-black dark:text-white">{t('rev.title')}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('rev.subtitle')}</p>
        </div>
        <div className="px-6 sm:px-8 py-5 overflow-y-auto flex-1">
          <GeneratedCardsEditor title={draft.title} cards={draft.cards} onChange={setDraft} makeId={makeId} />
        </div>
        <div className="px-6 sm:px-8 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => onDiscard(draft.cards)} className="px-5 py-3 rounded-2xl text-[13px] font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200">{t('rev.discard')}</button>
          <button type="button" disabled={!keep.length} onClick={() => onSave(draft.title.trim() || initialTitle, keep, dropped)}
            className="px-6 py-3 rounded-2xl text-[13px] font-semibold shadow-lg disabled:opacity-40" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
            {tp('rev.save', keep.length)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
