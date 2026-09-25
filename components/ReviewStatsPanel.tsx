import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../i18n/I18nProvider';
import type { FlashcardDeck } from '../types';
import { loadReviews, countByDay, trueRetention, REVIEW_EVENT, type ReviewEntry } from '../services/reviewLog';
import { heatmapWeeks, heatLevel, reviewStreak, dueForecast, reviewsSince, dayKey } from '../services/reviewStats';

const WEEKS = 20;
const FORECAST_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const HEAT = [
  'color-mix(in srgb, var(--text-main) 7%, transparent)',
  'color-mix(in srgb, var(--primary) 30%, transparent)',
  'color-mix(in srgb, var(--primary) 55%, transparent)',
  'color-mix(in srgb, var(--primary) 80%, transparent)',
  'var(--primary)',
];

/** Lernverlauf der Karteikarten: Kennzahlen, Heatmap, Prognose (Anki: Statistiken). */
export const ReviewStatsPanel: React.FC<{ decks: FlashcardDeck[] }> = ({ decks }) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ReviewEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => loadReviews({ since: Date.now() - WEEKS * 7 * DAY_MS })
      .then(e => { if (!cancelled) setEntries(e); }).catch(() => { if (!cancelled) setEntries([]); });
    load();
    // Nach neuen Bewertungen gebündelt neu laden.
    const onLogged = () => { clearTimeout(timer); timer = setTimeout(load, 600); };
    window.addEventListener(REVIEW_EVENT, onLogged);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener(REVIEW_EVENT, onLogged); };
  }, []);

  const counts = useMemo(() => countByDay(entries ?? []), [entries]);
  const weeks = useMemo(() => heatmapWeeks(counts, WEEKS), [counts]);
  const forecast = useMemo(() => dueForecast(decks, FORECAST_DAYS), [decks]);
  const maxForecast = Math.max(1, ...forecast);
  const month = useMemo(() => (entries ?? []).filter(e => e.reviewedAt >= Date.now() - 30 * DAY_MS), [entries]);
  const retention = trueRetention(month);
  const today = counts.get(dayKey(Date.now())) ?? 0;

  const stat = (value: string, label: string) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-main)' }}>{value}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );

  return (
    <section className="rounded-[24px] border border-slate-200 dark:border-slate-800 bg-[var(--card)] dark:bg-slate-900 p-5 sm:p-7 space-y-6" aria-labelledby="stats-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="stats-title" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{t('stats.title')}</h3>
        {entries && entries.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{t('stats.empty')}</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stat(String(today), t('stats.today'))}
        {stat(String(reviewsSince(month, Date.now() - 30 * DAY_MS)), t('stats.month'))}
        {stat(retention === null ? t('stats.noData') : `${Math.round(retention * 100)} %`, t('stats.retention'))}
        {stat(String(reviewStreak(counts)), t('stats.streak'))}
      </div>

      {/* Heatmap und Vorschau nebeneinander, sobald Platz ist (vorher nutzte die
          Heatmap nur ein Drittel der Breite, Design-Tour 25.09.2026). */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('stats.heatmap', { n: WEEKS })}</p>
          <div className="overflow-x-auto">
            <div className="flex gap-[3px] w-max" role="img" aria-label={t('stats.heatmapAria', { n: entries?.length ?? 0 })}>
              {weeks.map((week, w) => (
                <div key={w} className="flex flex-col gap-[3px]">
                  {week.map(d => (
                    <div
                      key={d.key}
                      title={d.count >= 0 ? t('stats.dayTitle', { date: new Date(`${d.key}T12:00`).toLocaleDateString(), n: d.count }) : undefined}
                      className="w-3 h-3 rounded-[3px]"
                      style={{ background: d.count < 0 ? 'transparent' : HEAT[heatLevel(d.count)] }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('stats.forecast', { n: FORECAST_DAYS })}</p>
          <div className="flex items-end gap-1 h-24" role="img" aria-label={t('stats.forecastAria', { list: forecast.join(', ') })}>
            {forecast.map((n, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{n || ''}</span>
                <div className="w-full rounded-t-[4px]" style={{ height: `${(n / maxForecast) * 70}%`, minHeight: n ? 3 : 0, background: i === 0 ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 45%, transparent)' }} />
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{i === 0 ? t('stats.todayShort') : new Date(Date.now() + i * DAY_MS).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
