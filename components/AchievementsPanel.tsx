import React, { useMemo } from 'react';
import { Flame, Layers, HelpCircle, Brain, GraduationCap, BookOpen, type LucideIcon } from 'lucide-react';
import { MobileCollapsible } from './MobileCollapsible';
import type { FlashcardDeck } from '../types';
import { computeAchievements, type AchievementId } from '../services/achievements';
import { getStreak } from '../services/streakService';
import { getAllResults } from '../services/quizHistoryService';
import { getAllRecallResults } from '../services/recallHistoryService';
import { getAllExamResults } from '../services/examHistoryService';
import { useCloudDataVersion } from '../hooks/useCloudDataVersion';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';

const ICONS: Record<AchievementId, LucideIcon> = {
  streak: Flame, cards: Layers, quiz: HelpCircle, feynman: Brain, exam: GraduationCap, library: BookOpen,
};

/** Stufenfarben: Bronze, Silber, Gold (Gold = Akzentfarbe der App). */
const TIER_COLORS = ['var(--border-color)', '#B07A45', '#8E99AB', 'var(--primary)'] as const;

/**
 * Abzeichen im Lernfortschritt (services/achievements.ts). Zeigt je Kategorie
 * die erreichte Stufe und wie weit es bis zur nächsten ist.
 */
export const AchievementsPanel: React.FC<{ decks: FlashcardDeck[]; documentCount: number }> = ({ decks, documentCount }) => {
  const { t, tp } = useTranslation();
  const dataVersion = useCloudDataVersion();
  const achievements = useMemo(() => computeAchievements({
    bestStreak: Math.max(getStreak().best, getStreak().current),
    decks,
    quizResults: getAllResults(),
    recallResults: getAllRecallResults(),
    examResults: getAllExamResults(),
    documentCount,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [decks, documentCount, dataVersion]);
  const reached = achievements.reduce((s, a) => s + a.tier, 0);

  // Handy: eingeklappt mit Fortschritt als Zusammenfassung (Zeugnis 6: Seite über 3 000 px).
  return (
    <MobileCollapsible title={t('ach.title')} summary={t('ach.progress', { n: reached, total: achievements.length * 3 })} persistKey="progress_achievements">
    <section
      className="p-6 lg:p-8 rounded-[24px] border space-y-5"
      style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}
      aria-labelledby="achievements-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="achievements-title" className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--mute)' }}>{t('ach.title')}</h3>
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{t('ach.progress', { n: reached, total: achievements.length * 3 })}</p>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {achievements.map(a => {
          const Icon = ICONS[a.id];
          const prev = a.tier > 0 ? a.thresholds[a.tier - 1] : 0;
          const pct = a.next === null ? 100 : Math.min(100, Math.round(((a.value - prev) / (a.next - prev)) * 100));
          return (
            <li key={a.id} className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-soft)' }}>
              <span
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  border: `2px solid ${TIER_COLORS[a.tier]}`,
                  background: a.tier > 0 ? `color-mix(in srgb, ${TIER_COLORS[a.tier]} 16%, transparent)` : 'transparent',
                  color: a.tier > 0 ? 'var(--ink)' : 'var(--mute)',
                }}
                aria-hidden="true"
              >
                <Icon size={18} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {t(`ach.${a.id}.title` as TKey)}
                  <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
                    {a.tier > 0 ? t(`ach.tier${a.tier}` as TKey) : t('ach.tier0')}
                  </span>
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{tp(`ach.${a.id}.value` as TKey, a.value)}</p>
                <div
                  className="mt-2 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--border-color)' }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={t(`ach.${a.id}.title` as TKey)}
                >
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: a.next === null ? 'var(--primary)' : TIER_COLORS[Math.min(3, a.tier + 1)] }} />
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--mute)' }}>
                  {a.next === null ? t('ach.allDone') : t('ach.next', { n: a.next - a.value, tier: t(`ach.tier${a.tier + 1}` as TKey) })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
    </MobileCollapsible>
  );
};
