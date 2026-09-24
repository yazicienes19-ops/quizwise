import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';

interface ReaderTutorPaneProps {
  /** Erklärt den Bezug der Antworten ("Frag zu Seite 12 nach …"). */
  hint: string;
  placeholder: string;
  emptyText: string;
  entryCount: number;
  value: string;
  onChange: (value: string) => void;
  onAsk: () => void;
  children: React.ReactNode;
}

/**
 * Tutor-Spalte beider Splitscreen-Reader. Ab lg eine feste Spalte neben dem
 * Dokument; darunter ein Bottom Sheet über dem Leser, das eingeklappt nur
 * Kopfzeile und Eingabe zeigt und sich beim Tippen oder bei einer neuen
 * Antwort aufzieht. Sitzt oberhalb der mobilen Bottom-Nav (Layout.tsx).
 */
export const ReaderTutorPane: React.FC<ReaderTutorPaneProps> = ({
  hint, placeholder, emptyText, entryCount, value, onChange, onAsk, children,
}) => {
  const { t, tp } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const prevCount = useRef(entryCount);

  useEffect(() => {
    if (entryCount > prevCount.current) setExpanded(true);
    prevCount.current = entryCount;
  }, [entryCount]);

  const canAsk = value.trim().length > 2;
  const toggleLabel = expanded ? t('rd.tutorSheetClose') : t('rd.tutorSheetOpen');

  return (
    <div
      className={`fixed inset-x-0 bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] z-40 flex flex-col gap-3 p-4 rounded-t-[18px] shadow-[0_-8px_28px_rgba(22,41,77,0.14)] ${expanded ? 'h-[62vh]' : ''} lg:static lg:inset-auto lg:z-auto lg:col-span-3 lg:max-h-[calc(100vh-6rem)] lg:min-h-[420px] lg:gap-4 lg:p-6 lg:rounded-[24px] lg:shadow-none`}
      style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-label={toggleLabel}
        className="lg:hidden -mt-1 py-1"
      >
        <span className="block w-9 h-1 rounded-full mx-auto" style={{ background: 'color-mix(in srgb, var(--ink) 18%, transparent)' }} />
      </button>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--primary-ink)' }}>{t('nav.explainer')}</p>
          <p className={`text-xs text-slate-400 font-medium ${expanded ? '' : 'hidden'} lg:block`}>{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="lg:hidden shrink-0 text-xs font-semibold"
          style={{ color: 'var(--text-secondary)' }}
        >
          {entryCount > 0 && !expanded ? tp('rd.questionsN', entryCount) : toggleLabel}
        </button>
      </div>

      <div className={`${expanded ? 'block' : 'hidden'} lg:block space-y-4 flex-1 min-h-0 overflow-y-auto pr-2`}>
        {entryCount === 0 && <p className="text-xs text-slate-400 italic">{emptyText}</p>}
        {children}
      </div>

      <div className="pt-1 flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setExpanded(true)}
          onKeyDown={e => { if (e.key === 'Enter' && canAsk) onAsk(); }}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 rounded-2xl text-sm outline-none transition-all min-w-0"
          style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
        />
        <button
          onClick={onAsk}
          disabled={!canAsk}
          aria-label={t('rd.ask')}
          title={t('rd.ask')}
          className="shrink-0 w-11 rounded-2xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          <ArrowUp size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
