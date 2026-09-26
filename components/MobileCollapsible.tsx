import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Abschnitt, der nur auf dem Handy eingeklappt startet (Zeugnis 6: Karteikarten,
 * Klausur und Lernfortschritt waren dort über 3 000 px lang). Ab sm ist der
 * Inhalt immer sichtbar und die Kopfzeile verschwindet: reines CSS, kein
 * Umschalten nach dem Laden. Aufgeklappt bleibt pro Gerät gemerkt (persistKey).
 */
interface Props {
  title: string;
  /** Kurzer Inhalt der eingeklappten Zeile, z. B. "5 von 18 Stufen". */
  summary?: string;
  persistKey?: string;
  /** false: ganz normal rendern, ohne Einklappen (z. B. wenn der Abschnitt der Einstieg ist). */
  enabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

const readOpen = (key?: string): boolean => {
  if (!key) return false;
  try { return localStorage.getItem(`studearc_mc_${key}`) === '1'; } catch { return false; }
};

export const MobileCollapsible: React.FC<Props> = ({ title, summary, persistKey, enabled = true, className = '', children }) => {
  const [open, setOpen] = useState(() => readOpen(persistKey));
  const contentId = useId();
  if (!enabled) return <>{children}</>;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (persistKey) { try { localStorage.setItem(`studearc_mc_${persistKey}`, next ? '1' : '0'); } catch { /* ignore */ } }
  };
  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="sm:hidden w-full flex items-center justify-between gap-3 text-left px-5 py-4 rounded-[24px] bg-[var(--card)] dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-slate-900 dark:text-white">{title}</span>
          {summary && <span className="block text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">{summary}</span>}
        </span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <div id={contentId} className={`${open ? 'block mt-3' : 'hidden'} sm:block sm:mt-0`}>
        {children}
      </div>
    </div>
  );
};
