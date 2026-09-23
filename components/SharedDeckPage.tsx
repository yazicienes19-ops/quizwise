import React, { useEffect, useState } from 'react';
import { getSharedDeck, SharedDeck } from '../services/sharedDecksService';
import { createSrsState } from '../services/spacedRepetition';
import { Flashcard, FlashcardDeck } from '../types';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';

interface SharedDeckPageProps {
  deckId: string;
  userId?: string | null;
  onLoginRequired: () => void;
  onAccepted: (deck: FlashcardDeck) => void;
}

/**
 * Design-Handoff: ~/Downloads/App-Dashboard responsive Design.zip
 * (design_handoff_studearc_email_geteiltesdeck) — ursprünglich als E-Mail-
 * Vorlage geliefert, User-Entscheidung: NICHT als echte E-Mail verschicken,
 * sondern als neue Optik für genau diese Vorschau-/Annahme-Seite verwenden
 * (Farben/Typografie/Layout-Sprache übernommen, aber über die bestehenden
 * CSS-Variablen statt hartkodierter Hex-Werte, damit Dark Mode weiter
 * funktioniert — die App-Variablen lösen ohnehin schon zu denselben Gold-/
 * Navy-Markenfarben auf, s. --primary/--primary-text).
 */
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
    toast.success(t('sdp.addedToast', { name: deck.name }));
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
            className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-105"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {t('rpp.backToApp')}
          </button>
        </div>
      </div>
    );
  }

  const ownerName = deck.owner_name || t('common.someone');

  return (
    <div className="min-h-screen py-12 px-4" style={{ background: 'var(--bg-main)' }}>
      <div className="max-w-xl mx-auto animate-in fade-in duration-700">
        <div className="rounded-[24px] shadow-3d-deep overflow-hidden" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
          {/* Wordmark */}
          <div className="pt-9 pb-6 text-center" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <p className="text-xl" style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: 'var(--text-main)' }}>
              Stude<span className="font-bold" style={{ color: 'var(--primary)' }}>Arc</span>
            </p>
          </div>

          <div className="px-8 sm:px-10 pt-9 pb-2 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--primary)' }}>
              {t('sdp.eyebrow')}
            </p>
            <h1 className="text-[28px] sm:text-[32px] leading-tight mb-4" style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: 'var(--text-main)' }}>
              {t('sdp.title', { name: ownerName })}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {t('sdp.subtitle')}
            </p>
          </div>

          {/* Card */}
          <div className="px-8 sm:px-10 pt-8">
            <div className="rounded-[18px] p-5 flex items-start gap-4" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
              <div
                className="shrink-0 w-11 h-11 rounded-[12px] flex items-center justify-center text-lg"
                style={{ background: 'color-mix(in srgb, var(--primary) 16%, var(--bg-sidebar))', border: '1px solid var(--primary)', color: 'var(--primary)' }}
              >
                ◆
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>
                  {t('sdp.cardLabel')}
                </p>
                <p className="text-lg mb-0.5 truncate" style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: 'var(--text-main)' }}>
                  {deck.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {tp('sdp.cardMeta', deck.cards.length, { name: ownerName })}
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="px-8 sm:px-10 pt-7 text-center">
            {accepted ? (
              <div className="space-y-3 pb-2">
                <p className="font-black text-lg text-emerald-600">{t('sdp.accepted')}</p>
                <button
                  onClick={() => window.location.href = '/'}
                  className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-105"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                >
                  {t('sdp.learnInApp')}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleAccept}
                  className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[13px] transition-all hover:scale-[1.02]"
                  style={{ background: 'var(--text-main)', color: 'var(--bg-sidebar)' }}
                >
                  {t('sdp.acceptButton')} →
                </button>
                <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>{t('sdp.acceptCaption')}</p>
              </>
            )}
            {!userId && !accepted && (
              <p className="text-[11px] mt-3" style={{ color: 'var(--text-secondary)' }}>{t('sdp.loginRequired')}</p>
            )}
          </div>

          {/* What you get */}
          <div className="px-8 sm:px-10 pt-8 pb-9">
            <div style={{ borderTop: '1px solid var(--border-color)' }} className="pt-7">
              <p className="text-[11px] font-black uppercase tracking-widest mb-4" style={{ color: 'var(--text-secondary)' }}>
                {t('sdp.whatYouGet')}
              </p>
              <ul className="space-y-3">
                {[t('sdp.benefit1'), t('sdp.benefit2', { name: ownerName }), t('sdp.benefit3')].map((benefit, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="shrink-0 w-[26px] h-[26px] rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--primary)' }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed pt-1" style={{ color: 'var(--text-main)' }}>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
