
import React, { useMemo } from 'react';
import { FlashcardDeck } from '../types';
import { migrateLegacyCard } from '../services/spacedRepetition';

interface DeckStatsModalProps {
  deck: FlashcardDeck;
  onClose: () => void;
}

export const DeckStatsModal: React.FC<DeckStatsModalProps> = ({ deck, onClose }) => {
  const stats = useMemo(() => {
    const now = Date.now();
    const cards = deck.cards.map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) });
    const total = cards.length;

    const newCards      = cards.filter(c => !c.srs?.lastReview).length;
    const learning      = cards.filter(c => c.srs?.lastReview && c.srs.interval <= 6).length;
    const reviewing     = cards.filter(c => c.srs?.lastReview && c.srs.interval >= 7 && c.srs.interval < 21).length;
    const mastered      = cards.filter(c => c.srs?.lastReview && c.srs.interval >= 21).length;
    const dueToday      = cards.filter(c => !c.srs || c.srs.nextReview <= now).length;

    const cardsWithEase = cards.filter(c => c.srs?.lastReview);
    const avgEase = cardsWithEase.length > 0
      ? (cardsWithEase.reduce((s, c) => s + (c.srs?.ease ?? 2.5), 0) / cardsWithEase.length)
      : 2.5;

    const masteredPct = total > 0 ? Math.round((mastered / total) * 100) : 0;

    return { total, newCards, learning, reviewing, mastered, dueToday, avgEase, masteredPct };
  }, [deck]);

  const segments = [
    { label: 'Neu',        value: stats.newCards,  color: 'bg-blue-400',    text: 'text-blue-500'    },
    { label: 'Lernen',     value: stats.learning,  color: 'bg-amber-400',   text: 'text-amber-500'   },
    { label: 'Wiederh.',   value: stats.reviewing, color: 'bg-emerald-400', text: 'text-emerald-500' },
    { label: 'Gemeistert', value: stats.mastered,  color: 'bg-indigo-500',  text: 'text-indigo-500'  },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-md shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start px-8 py-6 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0 flex-1 pr-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Statistik</p>
            <h2 className="text-xl font-black dark:text-white truncate">{deck.title}</h2>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">{stats.total} Karten gesamt</p>
          </div>
          <button aria-label="Schließen" onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Stacked bar */}
          {stats.total > 0 && (
            <div className="space-y-3">
              <div className="flex rounded-xl overflow-hidden h-4 gap-0.5">
                {segments.map(s => s.value > 0 && (
                  <div
                    key={s.label}
                    className={`${s.color} transition-all`}
                    style={{ width: `${(s.value / stats.total) * 100}%` }}
                    title={`${s.label}: ${s.value}`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {segments.map(s => (
                  <div key={s.label} className="flex items-center gap-2.5 p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                    <div className={`w-2.5 h-2.5 rounded-full ${s.color} shrink-0`} />
                    <div>
                      <p className={`text-lg font-black ${s.text}`}>{s.value}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-center">
              <p className="text-2xl font-black" style={{ color: 'var(--primary)' }}>{stats.dueToday}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Heute fällig</p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-center">
              <p className="text-2xl font-black text-slate-700 dark:text-slate-200">{stats.masteredPct}%</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Gemeistert</p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-center">
              <p className="text-2xl font-black text-slate-700 dark:text-slate-200">{stats.avgEase.toFixed(2)}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Ø Ease</p>
            </div>
          </div>

          {stats.total === 0 && (
            <p className="text-center text-sm text-slate-400 py-4">Noch keine Karten in diesem Deck.</p>
          )}
        </div>
      </div>
    </div>
  );
};
