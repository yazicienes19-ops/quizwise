
import React, { useState } from 'react';
import { Chapter, extractChapterText } from '../services/chapterService';

interface ChapterSelectorModalProps {
  docTitle: string;
  chapters: Chapter[];
  onConfirm: (filteredText: string, selectedChapters: Chapter[]) => void;
  onSkip: () => void;  // generate from full document
  onClose: () => void;
}

const approxPages = (chars: number) => Math.max(1, Math.round(chars / 1800));

export const ChapterSelectorModal: React.FC<ChapterSelectorModalProps> = ({
  docTitle,
  chapters,
  onConfirm,
  onSkip,
  onClose,
}) => {
  const [selected, setSelected] = useState<Set<number>>(new Set(chapters.map(c => c.index)));

  const toggle = (idx: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  const selectAll  = () => setSelected(new Set(chapters.map(c => c.index)));
  const selectNone = () => setSelected(new Set());

  const selectedChapters = chapters.filter(c => selected.has(c.index));
  const allSelected  = selected.size === chapters.length;
  const noneSelected = selected.size === 0;

  const totalChars = selectedChapters.reduce((s, c) => s + c.charCount, 0);

  const handleConfirm = () => {
    if (noneSelected) { onSkip(); return; }
    if (allSelected)  { onSkip(); return; } // same as full document
    onConfirm(extractChapterText(selectedChapters), selectedChapters);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-lg shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[88vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Kapitel auswählen</p>
          <h2 className="text-lg font-black dark:text-white truncate">{docTitle}</h2>
          <p className="text-[10px] text-slate-400 mt-1">
            {chapters.length} Kapitel erkannt · nur ausgewählte werden verarbeitet
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex gap-3 px-8 py-3 border-b border-slate-50 dark:border-slate-800 shrink-0">
          <button
            onClick={selectAll}
            className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl transition-all ${
              allSelected
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600'
            }`}
          >
            Alle
          </button>
          <button
            onClick={selectNone}
            className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl transition-all ${
              noneSelected
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700'
            }`}
          >
            Keine
          </button>
          <span className="ml-auto text-[10px] font-bold text-slate-400 self-center">
            {selected.size} / {chapters.length} · ~{approxPages(totalChars)} Seiten
          </span>
        </div>

        {/* Chapter list */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
          {chapters.map(chapter => {
            const isSelected = selected.has(chapter.index);
            return (
              <button
                key={chapter.index}
                onClick={() => toggle(chapter.index)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30'
                    : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                {/* Checkbox */}
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>

                {/* Chapter info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold leading-snug truncate ${
                    isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'dark:text-white'
                  }`}>
                    {chapter.title}
                  </p>
                </div>

                {/* Size */}
                <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 shrink-0">
                  ~{approxPages(chapter.charCount)}S
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <button
            onClick={onSkip}
            className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:text-slate-700 transition-colors"
          >
            Ganzes Dokument
          </button>
          <button
            onClick={handleConfirm}
            disabled={noneSelected}
            className="flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40 disabled:scale-100"
            style={{ background: 'var(--primary)' }}
          >
            {noneSelected
              ? 'Nichts ausgewählt'
              : selected.size === chapters.length
              ? 'Alle generieren'
              : `${selected.size} Kapitel generieren`}
          </button>
        </div>
      </div>
    </div>
  );
};
