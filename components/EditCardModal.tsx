
import React, { useState, useEffect, useRef } from 'react';
import { Flashcard } from '../types';

interface EditCardModalProps {
  card?: Flashcard;
  cardIndex?: number;
  totalCards?: number;
  onSave: (front: string, back: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export const EditCardModal: React.FC<EditCardModalProps> = ({
  card,
  cardIndex,
  totalCards,
  onSave,
  onDelete,
  onClose,
}) => {
  const isNew = !card;
  const [front, setFront] = useState(card?.front ?? '');
  const [back, setBack]   = useState(card?.back  ?? '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    frontRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front, back]);

  const handleSave = () => {
    if (!front.trim() || !back.trim()) return;
    onSave(front.trim(), back.trim());
  };

  const handleSwap = () => {
    setFront(back);
    setBack(front);
  };

  const canSave = front.trim().length > 0 && back.trim().length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-2xl shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black dark:text-white">
              {isNew ? 'Neue Karte' : 'Karte bearbeiten'}
            </h2>
            {!isNew && cardIndex !== undefined && totalCards !== undefined && (
              <span className="text-[9px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-400 px-2.5 py-1 rounded-lg">
                {cardIndex + 1} / {totalCards}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

            {/* Front */}
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Vorderseite <span className="text-slate-300">(Frage / Begriff)</span>
              </label>
              <textarea
                ref={frontRef}
                value={front}
                onChange={e => setFront(e.target.value)}
                placeholder="z.B. Was ist der Turing-Test?"
                rows={5}
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white font-medium resize-none text-sm leading-relaxed transition-colors"
              />
              <p className="text-[9px] text-slate-300 dark:text-slate-600 text-right pr-1">{front.length}</p>
            </div>

            {/* Back */}
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Rückseite <span className="text-slate-300">(Antwort / Definition)</span>
              </label>
              <textarea
                value={back}
                onChange={e => setBack(e.target.value)}
                placeholder="z.B. Ein Test zur Unterscheidung von menschlicher und künstlicher Intelligenz."
                rows={5}
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white font-medium resize-none text-sm leading-relaxed transition-colors"
              />
              <p className="text-[9px] text-slate-300 dark:text-slate-600 text-right pr-1">{back.length}</p>
            </div>
          </div>

          {/* Swap button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSwap}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-all"
              title="Vorder- und Rückseite tauschen"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              Seiten tauschen
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">

          {/* Delete — only in edit mode */}
          {!isNew && onDelete && (
            showDeleteConfirm ? (
              <div className="flex items-center gap-2 animate-in fade-in duration-150">
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Sicher?</span>
                <button
                  onClick={() => { onDelete(); onClose(); }}
                  className="px-3 py-2 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-colors"
                >
                  Löschen
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest"
                >
                  Abbrechen
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all"
                title="Karte löschen"
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
            className="px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:text-slate-700 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40 disabled:scale-100"
            style={{ background: 'var(--primary)', color: 'var(--primary-text, #fff)' }}
          >
            {isNew ? 'Hinzufügen' : 'Speichern'}
            <span className="opacity-50 text-[8px] normal-case font-bold tracking-normal hidden sm:inline">⌘↵</span>
          </button>
        </div>
      </div>
    </div>
  );
};
