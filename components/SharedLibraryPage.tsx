import React, { useEffect, useState } from 'react';
import { getSharedLibrary, SharedLibrary } from '../services/sharedLibraryService';
import { saveCollectionToSupabase, saveDocumentToSupabase } from '../services/documentService';
import { supabase } from '../services/supabaseClient';
import { ProcessedDocument } from '../types';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';

interface SharedLibraryPageProps {
  shareId: string;
  userId?: string | null;
  onLoginRequired: () => void;
}

/**
 * Design-Handoff: ~/Downloads/App-Dashboard responsive Design.zip
 * (design_handoff_studearc_email_geteiltesdeck, "Bibliothek-Variante" laut
 * README) — wie SharedDeckPage.tsx: als Optik dieser Vorschau-/Annahme-Seite
 * übernommen, nicht als echte E-Mail. Gleiches Layout-Gerüst wie
 * SharedDeckPage.tsx bewusst dupliziert statt geteilt — beide Seiten haben
 * leicht unterschiedliche Annahme-Logik (Copy vs. echter Supabase-Insert) und
 * eigene Lade-/Fehlerzustände, ein gemeinsames Layout wäre mehr Kopplung als
 * Ersparnis wert.
 */
export const SharedLibraryPage: React.FC<SharedLibraryPageProps> = ({ shareId, userId, onLoginRequired }) => {
  const { t, tp } = useTranslation();
  const [library, setLibrary] = useState<SharedLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    getSharedLibrary(shareId)
      .then(lib => { if (!lib) setError(true); else setLibrary(lib); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [shareId]);

  const handleAccept = async () => {
    if (!userId) { onLoginRequired(); return; }
    if (!library) return;
    setAccepting(true);
    try {
      // userId ist ein zwischengespeicherter React-Wert und kann veraltet
      // sein, während die eigentliche Supabase-Session bereits abgelaufen
      // ist. saveCollectionToSupabase/saveDocumentToSupabase brechen dann
      // NICHT mit einem Fehler ab, sondern geben still ohne Schreibvorgang
      // zurück (s. documentService.ts) — ohne diesen frischen Check würde
      // die Annahme fälschlich als Erfolg angezeigt, obwohl nichts
      // gespeichert wurde.
      const { data: { user: freshUser } } = await supabase.auth.getUser();
      if (!freshUser) { onLoginRequired(); return; }

      const newCollectionId = Math.random().toString(36).substr(2, 9);
      await saveCollectionToSupabase({ id: newCollectionId, name: library.name, emoji: library.emoji, color: library.color });
      for (const snap of library.documents) {
        const newDoc: ProcessedDocument = {
          id: Math.random().toString(36).substr(2, 9),
          name: snap.name,
          type: snap.type,
          mimeType: snap.mimeType,
          content: snap.content,
          uploadDate: Date.now(),
          collectionId: newCollectionId,
          digestText: snap.digestText,
          digestStatus: snap.digestStatus,
        };
        const savedId = await saveDocumentToSupabase(newDoc);
        if (!savedId) throw new Error('saveDocumentToSupabase returned null');
      }
      setAccepted(true);
      toast.success(t('slp.accepted', { name: library.name }));
    } catch {
      toast.error(t('slp.acceptFailed'));
    } finally {
      setAccepting(false);
    }
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

  if (error || !library) {
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

  const ownerName = library.owner_name || t('common.someone');

  return (
    <div className="min-h-screen py-12 px-4" style={{ background: 'var(--bg-main)' }}>
      <div className="max-w-xl mx-auto animate-in fade-in duration-700">
        <div className="rounded-[32px] shadow-3d-deep overflow-hidden" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
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
              {t('slp.title', { name: ownerName })}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {t('slp.subtitle')}
            </p>
          </div>

          {/* Card */}
          <div className="px-8 sm:px-10 pt-8">
            <div className="rounded-[18px] p-5 flex items-start gap-4" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
              <div
                className="shrink-0 w-11 h-11 rounded-[12px] flex items-center justify-center text-lg"
                style={{ background: 'color-mix(in srgb, var(--primary) 16%, var(--bg-sidebar))', border: '1px solid var(--primary)', color: 'var(--primary)' }}
              >
                {library.emoji || '📁'}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>
                  {t('slp.cardLabel')}
                </p>
                <p className="text-lg mb-0.5 truncate" style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: 'var(--text-main)' }}>
                  {library.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {tp('slp.cardMeta', library.documents.length, { name: ownerName })}
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="px-8 sm:px-10 pt-7 text-center">
            {accepted ? (
              <div className="space-y-3 pb-2">
                <p className="font-black text-lg text-emerald-600">{t('slp.accepted', { name: library.name })}</p>
                <button
                  onClick={() => window.location.href = '/'}
                  className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                >
                  {t('slp.learnInApp')}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[13px] transition-all hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100 flex items-center justify-center gap-2"
                  style={{ background: 'var(--text-main)', color: 'var(--bg-sidebar)' }}
                >
                  {accepting ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : null}
                  {accepting ? t('slp.accepting') : `${t('slp.acceptButton')} →`}
                </button>
                <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>{t('slp.acceptCaption')}</p>
              </>
            )}
            {!userId && !accepted && (
              <p className="text-[11px] mt-3" style={{ color: 'var(--text-secondary)' }}>{t('slp.loginRequired')}</p>
            )}
          </div>

          {/* What you get */}
          <div className="px-8 sm:px-10 pt-8 pb-3">
            <div style={{ borderTop: '1px solid var(--border-color)' }} className="pt-7">
              <p className="text-[11px] font-black uppercase tracking-widest mb-4" style={{ color: 'var(--text-secondary)' }}>
                {t('sdp.whatYouGet')}
              </p>
              <ul className="space-y-3">
                {[t('slp.benefit1'), t('slp.benefit2'), t('slp.benefit3', { name: ownerName })].map((benefit, i) => (
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

          <div className="px-8 sm:px-10 pb-9 pt-4 text-center">
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('slp.digestOnlyHint')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
