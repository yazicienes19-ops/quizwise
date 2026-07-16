import React, { useEffect, useState } from 'react';
import { getSharedDeck, SharedDeck } from '../services/sharedDecksService';
import { createSrsState } from '../services/spacedRepetition';
import { Flashcard, FlashcardDeck } from '../types';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';

interface SharedDeckPageProps {
  deckId: string;
  userId?: string | null;
  onLoginRequired: () => void;
  onAccepted: (deck: FlashcardDeck) => void;
}

export const SharedDeckPage: React.FC<SharedDeckPageProps> = ({
  deckId, userId, onLoginRequired, onAccepted
}) => {
  const { t, tp } = useTranslation();
  const [deck, setDeck] = useState<SharedDeck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    getSharedDeck(deckId)
      .then(d => {
        if (!d) setError(true);
        else setDeck(d);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [deckId]);

  const handleAccept = () => {
    if (!userId) { onLoginRequired(); return; }
    if (!deck) return;
    const newDeck: FlashcardDeck = {
      id: Math.random().toString(36).substr(2, 9),
      title: deck.name,
      cards: deck.cards.map((c: any): Flashcard => ({
        id: Math.random().toString(36).substr(2, 9),
        front: c.front,
        back: c.back,
        level: 0,
        nextReview: Date.now(),
        lastInterval: 0,
        srs: createSrsState(),
      })),
    };
    onAccepted(newDeck);
    setAccepted(true);
    toast.success(`"${deck.name}" wurde zu deinen Karten hinzugefügt!`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-main)' }}>
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t('sdp.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !deck) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-main)' }}>
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-5xl">🔍</p>
          <h2 className="text-2xl font-black dark:text-white">{t('sdp.notFound')}</h2>
          <p className="text-slate-400 text-sm">{t('sdp.expiredLink')}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            Zur App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4" style={{ background: 'var(--bg-main)' }}>
      <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-700">
        {/* Header */}
        <div className="text-center space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('sdp.sharedDeck')}</p>
          <h1 className="text-4xl font-black tracking-tighter dark:text-white">{deck.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tp('dashboard.cardsN', deck.cards.length)} · {t('sdp.created', { date: formatDate(deck.created_at) })}
          </p>
        </div>

        {/* Preview cards */}
        <div className="space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('sdp.preview')}</p>
          {deck.cards.slice(0, 6).map((c, i) => (
            <div key={i} className="grid grid-cols-2 gap-4 px-5 py-4 rounded-[20px]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('ecm.front')}</p>
                <p className="text-sm font-medium dark:text-white">{c.front}</p>
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('ecm.back')}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{c.back}</p>
              </div>
            </div>
          ))}
          {deck.cards.length > 6 && (
            <p className="text-[9px] text-slate-400 text-center font-black">{t('sdp.moreCards', { n: deck.cards.length - 6 })}</p>
          )}
        </div>

        {/* CTA */}
        {accepted ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-emerald-600 font-black text-lg">{t('sdp.accepted')}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              {t('sdp.learnInApp')}
            </button>
          </div>
        ) : (
          <button
            onClick={handleAccept}
            className="w-full py-5 rounded-[24px] font-black uppercase tracking-widest text-[11px] shadow-3d-deep hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {t('sdp.acceptButton')}
          </button>
        )}

        {!userId && (
          <p className="text-center text-[10px] text-slate-400">
            {t('sdp.loginRequired')}
          </p>
        )}
      </div>
    </div>
  );
};
