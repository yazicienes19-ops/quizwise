import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { startFocus, FOCUS_OPTIONS } from '../services/focusTimer';
import {
  loadRecentStudyTime, getDailyGoal, setDailyGoal, DAILY_GOAL_OPTIONS, STUDY_TIME_EVENT, type StudyDay,
} from '../services/studyTimeService';

/**
 * Lernzeit auf der Startseite: heute im Verhältnis zum Tagesziel, Summe der
 * letzten 7 Tage, kleiner Verlauf. Stil wie die übrigen Startseiten-Karten
 * (Dashboard.tsx, Konstante C).
 */
const INK = 'var(--text-main)';
const MUTE = 'color-mix(in srgb, var(--text-main) 68%, transparent)';
const LINE = 'color-mix(in srgb, var(--text-main) 10%, transparent)';
const GOLD_TEXT = 'color-mix(in srgb, var(--primary) 55%, var(--text-main))';
const GREEN = '#4a8a5c';

export const StudyTimeCard: React.FC<{ userId: string }> = ({ userId }) => {
  const { t } = useTranslation();
  const [days, setDays] = useState<StudyDay[] | null>(null);
  const [goal, setGoal] = useState(getDailyGoal);

  useEffect(() => {
    let cancelled = false;
    const load = () => loadRecentStudyTime(userId).then(d => { if (!cancelled) setDays(d); }).catch(() => {});
    load();
    window.addEventListener(STUDY_TIME_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(STUDY_TIME_EVENT, load); };
  }, [userId]);

  if (!days) return null;

  const today = days[days.length - 1]?.minutes ?? 0;
  const week = days.reduce((s, d) => s + d.minutes, 0);
  const reached = today >= goal;
  const pct = Math.min(100, Math.round((today / goal) * 100));
  const maxBar = Math.max(goal, ...days.map(d => d.minutes), 1);
  const fmt = (m: number) => (m >= 60 ? t('home.time.hm', { h: Math.floor(m / 60), m: m % 60 }) : t('home.time.m', { m }));
  const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow' });

  return (
    <section className="flex flex-col gap-[9px]">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: GOLD_TEXT }}>{t('home.time.label')}</span>
        <span className="text-[11.5px]" style={{ color: MUTE }}>{t('home.time.hint')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-[18px] py-[14px] rounded-[11px]" style={{ background: 'var(--card)', border: `1px solid ${LINE}` }}>
        <div className="flex-1 min-w-[220px] space-y-2">
          <p className="flex items-center gap-2 text-[15.5px] font-semibold" style={{ color: INK }}>
            {reached && <CheckCircle2 size={16} style={{ color: GREEN }} aria-hidden="true" />}
            {reached ? t('home.time.reached', { m: today }) : t('home.time.today', { m: today, goal })}
          </p>
          <div
            className="h-[6px] rounded-full overflow-hidden"
            style={{ background: LINE }}
            role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(today, goal)}
            aria-label={t('home.time.goal')}
          >
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: reached ? GREEN : 'var(--primary)' }} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]" style={{ color: MUTE }}>
            <span>{t('home.time.week', { v: fmt(week) })}</span>
            <span className="inline-flex items-center gap-1">
              <span>{t('focus.start')}:</span>
              {FOCUS_OPTIONS.map(m => (
                <button
                  key={m}
                  onClick={() => { startFocus(m); try { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); } catch { /* nicht verfügbar */ } }}
                  aria-label={t('focus.startN', { m })}
                  className="px-2 py-0.5 rounded-md font-semibold transition-colors hover:opacity-80"
                  style={{ color: INK, border: `1px solid ${LINE}` }}
                >
                  {m}
                </button>
              ))}
            </span>
            <label className="inline-flex items-center gap-1.5">
              {t('home.time.goal')}
              <select
                id="daily-goal"
                value={goal}
                onChange={e => { const v = Number(e.target.value); setGoal(v); setDailyGoal(v, userId); }}
                className="bg-transparent font-semibold outline-none cursor-pointer"
                style={{ color: INK }}
              >
                {DAILY_GOAL_OPTIONS.map(o => <option key={o} value={o}>{t('home.time.m', { m: o })}</option>)}
              </select>
            </label>
          </div>
        </div>
        {/* Verlauf der letzten 7 Tage; die gestrichelte Linie ist das Tagesziel. */}
        <div className="flex items-end gap-[6px] h-[52px] relative" aria-hidden="true">
          <div className="absolute left-0 right-0 border-t border-dashed" style={{ bottom: `${(goal / maxBar) * 40 + 12}px`, borderColor: MUTE, opacity: 0.5 }} />
          {days.map((d, i) => (
            <div key={d.date} className="flex flex-col items-center gap-1 w-[14px]">
              <div
                className="w-full rounded-[3px]"
                style={{
                  height: `${Math.max(2, (d.minutes / maxBar) * 40)}px`,
                  background: d.minutes >= goal ? GREEN : i === days.length - 1 ? 'var(--primary)' : 'color-mix(in srgb, var(--text-main) 22%, transparent)',
                }}
              />
              <span className="text-[11px] leading-none" style={{ color: MUTE }}>{weekday(d.date)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
