import React, { useEffect, useState } from 'react';
import { Pause, Play, X, Timer } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { toast } from '../services/toast';
import {
  readFocus, pauseFocus, resumeFocus, stopFocus, remainingMs, FOCUS_EVENT, FOCUS_KEY, type FocusState,
} from '../services/focusTimer';

/**
 * Schwebende Anzeige des Fokus-Timers (services/focusTimer.ts). Einmal in der
 * App eingehängt, läuft über alle Bereiche mit. Am Ende: Meldung, und falls
 * erlaubt eine Browser-Benachrichtigung.
 */
export const FocusTimer: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<FocusState | null>(readFocus);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const sync = () => setState(readFocus());
    const onStorage = (e: StorageEvent) => { if (e.key === FOCUS_KEY) sync(); };
    window.addEventListener(FOCUS_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(FOCUS_EVENT, sync); window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => {
    if (state?.status !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  const left = state ? remainingMs(state, now) : 0;

  useEffect(() => {
    if (state?.status !== 'running' || left > 0) return;
    stopFocus();
    const msg = t('focus.done', { m: state.minutes });
    toast.success(msg);
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification('StudeArc', { body: msg });
    } catch { /* nicht verfügbar */ }
  }, [state, left, t]);

  if (!state) return null;
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  const running = state.status === 'running';

  return (
    <div
      className="fixed z-[70] right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full shadow-3d-deep"
      style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      role="timer"
      aria-label={t('focus.label')}
    >
      <Timer size={16} style={{ color: 'var(--primary-ink)' }} aria-hidden="true" />
      <span className="text-[15px] font-semibold tabular-nums" style={{ color: 'var(--text-main)' }}>{mm}:{ss}</span>
      <button
        onClick={() => (running ? pauseFocus() : resumeFocus())}
        aria-label={running ? t('focus.pause') : t('focus.resume')}
        title={running ? t('focus.pause') : t('focus.resume')}
        className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:opacity-80"
        style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
      >
        {running ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button
        onClick={stopFocus}
        aria-label={t('focus.stop')}
        title={t('focus.stop')}
        className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
        style={{ color: 'var(--text-secondary)' }}
      >
        <X size={15} />
      </button>
    </div>
  );
};
