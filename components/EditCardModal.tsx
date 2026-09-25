
import { hasCloze, wrapCloze } from '../services/cloze';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Flashcard } from '../types';
import { useTranslation } from '../i18n/I18nProvider';
import { useModalA11y } from '../hooks/useModalA11y';
import { ModalCloseButton } from './ModalCloseButton';
import { parseTags, formatTags } from '../services/cardTags';
import { ImagePlus } from 'lucide-react';
import { CardImage } from './CardImage';
import { toast } from '../services/toast';
import { uploadCardImage, deleteCardImage, isOwnImage, CardImageError } from '../services/cardImages';
import { loadReviews, type ReviewEntry } from '../services/reviewLog';

interface EditCardModalProps {
  card?: Flashcard;
  cardIndex?: number;
  totalCards?: number;
  onSave: (front: string, back: string, tags: string[], images: CardImages) => void;
  /** Für Bild-Uploads; ohne Anmeldung keine Bilder. */
  userId?: string;
  /** Vorhandene Schlagwörter im Stapel, als Vorschläge. */
  knownTags?: string[];
  onDelete?: () => void;
  /** Karte aussetzen bzw. fortsetzen. */
  onToggleSuspend?: () => void;
  onClose: () => void;
}

export interface CardImages { frontImage?: string; backImage?: string }

/** Verlauf einer Karte (Anki: Karteninfo): Lernstand und letzte Wiederholungen. */
const CardHistory: React.FC<{ card: Flashcard }> = ({ card }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ReviewEntry[] | null>(null);
  useEffect(() => {
    if (!open || list) return;
    loadReviews({ cardId: card.id }).then(setList).catch(() => setList([]));
  }, [open, list, card.id]);
  const s = card.srs;
  const label = (r: number) => (r === 1 ? t('fc.again') : r === 2 ? t('fc.hard') : r === 3 ? t('fc.good') : t('fc.easy'));
  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 space-y-2">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center justify-between text-[13px] font-semibold text-slate-700 dark:text-slate-200">
        {t('hist.title')}
        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
          {s?.lastReview
            ? t('hist.summary', { next: new Date(s.nextReview).toLocaleDateString(), s: s.stability ? s.stability.toFixed(1) : '?', l: s.lapses ?? 0 })
            : t('hist.new')}
        </span>
      </button>
      {open && (
        list === null ? <p className="text-xs text-slate-500">{t('hist.loading')}</p>
        : list.length === 0 ? <p className="text-xs text-slate-500">{t('hist.none')}</p>
        : (
          <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 max-h-40 overflow-y-auto">
            {[...list].reverse().slice(0, 20).map(e => (
              <li key={e.clientId} className="flex justify-between gap-3 tabular-nums">
                <span>{new Date(e.reviewedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="font-semibold">{label(e.rating)}</span>
                <span>{t('hist.interval', { n: Math.round(e.intervalDays) })}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
};
type SideImage = { path?: string; file?: File; preview?: string };

/** Bild für eine Kartenseite wählen, Vorschau zeigen, wieder entfernen. */
const ImagePicker: React.FC<{ image: SideImage; onPick: (f: File | undefined) => void; onClear: () => void; side: 'front' | 'back' }> = ({ image, onPick, onClear, side }) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const has = !!(image.path || image.file);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
      {has ? (
        <>
          <CardImage path={image.path} previewUrl={image.preview} alt={t(side === 'front' ? 'img.altFront' : 'img.altBack')} className="h-14 w-20 object-cover rounded-lg" />
          <button type="button" onClick={() => inputRef.current?.click()} className="text-[12px] font-semibold text-slate-400 hover:text-indigo-500">{t('img.replace')}</button>
          <button type="button" onClick={onClear} className="text-[12px] font-semibold text-slate-400 hover:text-rose-500">{t('img.remove')}</button>
        </>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-indigo-500 transition-colors">
          <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" /> {t('img.add')}
        </button>
      )}
    </div>
  );
};

export const EditCardModal: React.FC<EditCardModalProps> = ({
  card,
  cardIndex,
  totalCards,
  onSave,
  onDelete,
  onClose,
  knownTags = [],
  userId,
  onToggleSuspend,
}) => {
  const { t } = useTranslation();
  const isNew = !card;
  const [front, setFront] = useState(card?.front ?? '');
  const [back, setBack]   = useState(card?.back  ?? '');
  const [tagInput, setTagInput] = useState(formatTags(card?.tags));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Bilder je Seite: gespeicherter Pfad oder neu gewählte Datei (Upload erst beim Speichern).
  const [frontImg, setFrontImg] = useState<SideImage>({ path: card?.frontImage });
  const [backImg, setBackImg] = useState<SideImage>({ path: card?.backImage });
  const [saving, setSaving] = useState(false);
  useEffect(() => () => {
    [frontImg.preview, backImg.preview].forEach(u => { if (u) URL.revokeObjectURL(u); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const { titleId, dialogProps } = useModalA11y(onClose, frontRef);

  useEffect(() => {
    // ESC wird bereits von useModalA11y behandelt — hier nur noch der
    // modal-eigene Speichern-Shortcut.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front, back, tagInput, frontImg, backImg, saving]);

  const hasFront = front.trim().length > 0 || !!(frontImg.path || frontImg.file);
  const isCloze = hasCloze(front);
  // Lückentext-Karten brauchen keine Rückseite: die Lücke ist die Antwort.
  const hasBack = isCloze || back.trim().length > 0 || !!(backImg.path || backImg.file);

  const insertCloze = () => {
    const el = frontRef.current;
    const start = el?.selectionStart ?? front.length;
    const end = el?.selectionEnd ?? front.length;
    const { text, cursor } = wrapCloze(front, start, end);
    setFront(text);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(cursor, cursor); });
  };
  const canSave = hasFront && hasBack && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const cardKey = card?.id ?? `neu${Date.now().toString(36)}`;
      const resolve = async (side: SideImage) =>
        side.file && userId ? uploadCardImage(userId, cardKey, side.file) : side.path;
      const frontImage = await resolve(frontImg);
      const backImage = await resolve(backImg);
      // Ersetzte oder entfernte eigene Bilder aufräumen.
      for (const [old, next] of [[card?.frontImage, frontImage], [card?.backImage, backImage]] as const) {
        if (old && old !== next && old !== frontImage && old !== backImage && isOwnImage(old, userId)) void deleteCardImage(old);
      }
      onSave(front.trim(), back.trim(), parseTags(tagInput), { frontImage, backImage });
    } catch (e) {
      toast.error(e instanceof CardImageError ? t(`img.err.${e.code}` as const) : t('img.err.upload'));
    } finally {
      setSaving(false);
    }
  };

  const handleSwap = () => {
    setFront(back);
    setBack(front);
    setFrontImg(backImg);
    setBackImg(frontImg);
  };

  const pickImage = (setSide: React.Dispatch<React.SetStateAction<SideImage>>) => (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(t('img.err.not-image')); return; }
    setSide(prev => { if (prev.preview) URL.revokeObjectURL(prev.preview); return { file, preview: URL.createObjectURL(file) }; });
  };
  const clearImage = (setSide: React.Dispatch<React.SetStateAction<SideImage>>) => () =>
    setSide(prev => { if (prev.preview) URL.revokeObjectURL(prev.preview); return {}; });

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        {...dialogProps}
        className="bg-[var(--card)] dark:bg-slate-900 rounded-[24px] w-full max-w-2xl shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <h2 id={titleId} className="text-xl font-semibold dark:text-white">
              {isNew ? t('ecm.newCard') : t('ecm.editCard')}
            </h2>
            {!isNew && cardIndex !== undefined && totalCards !== undefined && (
              <span className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full">
                {cardIndex + 1} / {totalCards}
              </span>
            )}
          </div>
          <ModalCloseButton onClick={onClose} label={t('upl.close')} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl" />
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

            {/* Front */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em] ml-1">
                {t('ecm.front')} <span className="text-slate-300">{t('ecm.frontHint')}</span>
              </label>
              <textarea
                ref={frontRef}
                value={front}
                onChange={e => setFront(e.target.value)}
                placeholder={t('ecm.frontPlaceholder')}
                rows={5}
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white font-medium resize-none text-sm leading-relaxed transition-colors"
              />
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {userId && <ImagePicker image={frontImg} onPick={pickImage(setFrontImg)} onClear={clearImage(setFrontImg)} side="front" />}
                  <button
                    type="button"
                    onClick={insertCloze}
                    title={t('ecm.clozeTitle')}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors"
                    style={{ border: '1px solid var(--border-color)', color: 'var(--ink2)' }}
                  >
                    {t('ecm.cloze')}
                  </button>
                </div>
                <p className="text-[11px] text-slate-300 dark:text-slate-600 text-right pr-1">{front.length}</p>
              </div>
              {isCloze && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('ecm.clozeHint')}</p>
              )}
            </div>

            {/* Back */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em] ml-1">
                {t('ecm.back')} <span className="text-slate-300">{t('ecm.backHint')}</span>
              </label>
              <textarea
                value={back}
                onChange={e => setBack(e.target.value)}
                placeholder={t('ecm.backPlaceholder')}
                rows={5}
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white font-medium resize-none text-sm leading-relaxed transition-colors"
              />
              <div className="flex items-start justify-between gap-2">
                {userId ? <ImagePicker image={backImg} onPick={pickImage(setBackImg)} onClear={clearImage(setBackImg)} side="back" /> : <span />}
                <p className="text-[11px] text-slate-300 dark:text-slate-600 text-right pr-1">{back.length}</p>
              </div>
            </div>
          </div>

          {!isNew && card && <CardHistory card={card} />}

          {/* Schlagwörter */}
          <div className="space-y-2">
            <label htmlFor="card-tags" className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em] ml-1">
              {t('tags.label')} <span className="text-slate-300 normal-case tracking-normal font-medium">{t('tags.hint')}</span>
            </label>
            <input
              id="card-tags"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder={t('tags.placeholder')}
              list="card-tag-suggestions"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white text-sm transition-colors"
            />
            {knownTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {knownTags.filter(k => !parseTags(tagInput).some(x => x.toLowerCase() === k.toLowerCase())).slice(0, 8).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTagInput(v => formatTags(parseTags(`${v},${k}`)))}
                    className="px-2.5 py-1 rounded-full text-[12px] font-semibold transition-colors hover:opacity-80"
                    style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary-ink)' }}
                  >
                    + {k}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Swap button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSwap}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-all"
              title={t('ecm.swapTitle')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              {t('ecm.swap')}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">

          {/* Delete — only in edit mode */}
          {!isNew && onToggleSuspend && (
            <button
              type="button"
              onClick={onToggleSuspend}
              className="px-3 py-2 rounded-xl text-[13px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {card?.suspended ? t('susp.resume') : t('susp.action')}
            </button>
          )}
          {!isNew && onDelete && (
            showDeleteConfirm ? (
              <div className="flex items-center gap-2 animate-in fade-in duration-150">
                <span className="text-[11px] font-semibold text-rose-500 uppercase tracking-[0.08em]">{t('ecm.sure')}</span>
                <button
                  onClick={() => { onDelete(); onClose(); }}
                  className="px-3 py-2 bg-rose-500 text-white rounded-xl text-[13px] font-semibold hover:bg-rose-600 transition-colors"
                >
                  {t('lib.delete')}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl text-[13px] font-semibold"
                >
                  {t('quiz.cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all"
                aria-label={t('ecm.deleteCard')} title={t('ecm.deleteCard')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            )
          )}

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl text-[13px] font-semibold hover:text-slate-700 transition-colors"
          >
            {t('quiz.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[13px] font-semibold shadow-lg hover:scale-[1.02] transition-all disabled:opacity-40 disabled:scale-100"
            style={{ background: 'var(--primary)', color: 'var(--primary-text, #fff)' }}
          >
            {saving ? t('img.uploading') : isNew ? t('ecm.add') : t('common.save')}
            <span className="opacity-50 text-[11px] normal-case font-bold tracking-normal hidden sm:inline">⌘↵</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
