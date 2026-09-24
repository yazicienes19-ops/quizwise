import React, { useMemo, useState } from 'react';
import { getAllExamResults } from '../services/examHistoryService';
import type { ExamResult } from '../services/examHistoryService';
import { formatUserAnswer } from '../services/examAnswerFormat';
import { gradeFromPercentage, getCategoryLabel, passThresholdPercent } from '../services/learningProfileService';
import { formatGrade } from '../services/gradeScale';
import { getLocale } from '../i18n';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';
import { useCloudDataVersion } from '../hooks/useCloudDataVersion';

interface ExamGroup {
  name: string;
  /** Neueste zuerst. */
  attempts: ExamResult[];
  best: ExamResult;
}

/**
 * Klausur-Archiv, gruppiert nach Thema (Audit 23.09.2026: vorher zehn Zeilen
 * "5,0 · nicht bestanden" untereinander, ohne Verlauf). Je Thema: beste Note,
 * Zahl der Versuche und Veränderung seit dem ersten Versuch; aufgeklappt die
 * einzelnen Versuche mit allen Details.
 */
export const ExamArchive: React.FC = () => {
  const { t, tp } = useTranslation();
  // Neu lesen, sobald der Cloud-Abgleich nach dem Login fertig ist.
  const dataVersion = useCloudDataVersion();
  const groups = useMemo((): ExamGroup[] => {
    const byName = new Map<string, ExamResult[]>();
    for (const e of [...getAllExamResults()].sort((a, b) => b.timestamp - a.timestamp)) {
      const key = e.docName || '–';
      byName.set(key, [...(byName.get(key) ?? []), e]);
    }
    return [...byName.entries()]
      .map(([name, attempts]) => ({ name, attempts, best: attempts.reduce((b, e) => (e.score > b.score ? e : b)) }))
      .sort((a, b) => b.attempts[0].timestamp - a.attempts[0].timestamp)
      .slice(0, 8);
  }, [dataVersion]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  if (groups.length === 0) return null;

  const passAt = passThresholdPercent();
  const locale = getLocale();
  const totalAttempts = groups.reduce((n, g) => n + g.attempts.length, 0);
  const passedTopics = groups.filter(g => g.best.passed).length;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-10 space-y-3">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('ea.title')}</p>
        <p className="text-xs text-slate-400 font-medium">{t('ea.subtitle')}</p>
        <p className="text-[13px] pt-1" style={{ color: 'var(--ink2)' }}>
          {tp('ea.topicsN', groups.length)} · {tp('ea.attemptsN', totalAttempts)} · {t('ea.passedOf', { n: passedTopics, total: groups.length })} · {t('ea.passLine', { pct: passAt })}
        </p>
      </div>
      {groups.map(group => {
        const { grade: bestGrade } = gradeFromPercentage(group.best.score);
        const groupOpen = openGroup === group.name;
        const first = group.attempts[group.attempts.length - 1];
        const delta = group.attempts[0].score - first.score;
        return (
          <div key={group.name} className="rounded-[24px] overflow-hidden" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => { setOpenGroup(groupOpen ? null : group.name); setOpenId(null); }}
              className="w-full flex items-center gap-4 px-5 py-4 text-left"
              aria-expanded={groupOpen}
            >
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center font-semibold text-sm shrink-0 tabular-nums ${group.best.passed ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: group.best.passed ? undefined : 'var(--ink)' }}
              >
                {formatGrade(bestGrade, locale)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold dark:text-white break-words">{group.name}</p>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {tp('ea.attemptsN', group.attempts.length)} · {t('ea.best', { pct: group.best.score })} · {t('ea.last', { date: formatDate(group.attempts[0].timestamp, { day: '2-digit', month: 'short' }) })}
                </p>
                {/* Einordnung: bestes Ergebnis gegen die Bestehensgrenze */}
                <div className="relative mt-2 h-1.5 rounded-full max-w-xs" style={{ background: 'var(--border-color)' }} aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, group.best.score)}%`, background: group.best.passed ? '#10b981' : 'var(--primary)' }} />
                  <div className="absolute -top-1 w-px h-3.5" style={{ left: `${passAt}%`, background: 'var(--ink2)' }} />
                </div>
                <p className="text-[12px] mt-1" style={{ color: 'var(--mute)' }}>
                  {group.best.passed ? t('ea.passed') : tp('ea.toPass', Math.max(1, passAt - group.best.score))}
                </p>
                {group.attempts.length > 1 && delta !== 0 && (
                  <p className={`text-[12px] font-bold mt-0.5 ${delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                    {delta > 0 ? tp('ea.deltaUp', delta) : tp('ea.deltaDown', -delta)}
                  </p>
                )}
              </div>
              <span className="text-slate-400 font-black shrink-0" aria-hidden="true">{groupOpen ? '−' : '+'}</span>
            </button>
            {groupOpen && (
              <div className="px-3 pb-3 space-y-2">
      {group.attempts.map(exam => {
        const { grade } = gradeFromPercentage(exam.score);
        const isOpen = openId === exam.id;
        return (
          <div key={exam.id} className="rounded-[18px] overflow-hidden" style={{ background: 'var(--bg-main)' }}>
            <button
              onClick={() => setOpenId(isOpen ? null : exam.id)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left"
              aria-expanded={isOpen}
            >
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center font-semibold text-sm shrink-0 tabular-nums ${exam.passed ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: exam.passed ? undefined : 'var(--ink)' }}
              >
                {formatGrade(grade, locale)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold dark:text-white">
                  {formatDate(exam.timestamp, { day: '2-digit', month: 'short', year: '2-digit' })} · {exam.score}%
                </p>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{exam.passed ? t('ea.passed') : t('ea.failed')}</p>
              </div>
              <span className="text-slate-300 font-black shrink-0">{isOpen ? '−' : '+'}</span>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 space-y-3 animate-in fade-in duration-300">
                {exam.categoryBreakdown && exam.categoryBreakdown.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {exam.categoryBreakdown.map(cb => (
                      <span key={cb.category} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {getCategoryLabel(cb.category)} {cb.score}%
                      </span>
                    ))}
                  </div>
                )}

                {exam.questions && exam.questions.length > 0 ? exam.questions.map((q, i) => {
                  const pts = q.achievedPoints ?? 0;
                  const full = q.points > 0 && pts === q.points;
                  return (
                    <div key={q.id ?? i} className={`p-4 rounded-[18px] border-l-4 ${full ? 'bg-emerald-50/60 dark:bg-emerald-950/10 border-emerald-400' : pts > 0 ? 'bg-amber-50/60 dark:bg-amber-950/10 border-amber-400' : 'bg-rose-50/60 dark:bg-rose-950/10 border-rose-300'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-bold dark:text-white leading-relaxed">{i + 1}. {q.question}</p>
                        <span className="text-[11px] font-semibold shrink-0 dark:text-white">{t('ea.points', { a: pts, b: q.points })}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 break-words">
                        <span className="font-semibold uppercase text-[11px] tracking-[0.08em]">{t('ea.yourAnswer')}: </span>
                        {formatUserAnswer(q, t)}
                      </p>
                      {q.feedback && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 italic break-words">{q.feedback}</p>
                      )}
                      {q.criterionScores && q.criterionScores.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {q.criterionScores.map(cs => (
                            <p key={cs.criterionId} className="text-[11px] text-slate-500 dark:text-slate-400 break-words">
                              {cs.status === 'full' ? '✓' : cs.status === 'partial' ? '~' : '✗'} {cs.criterionName}: {cs.pointsAwarded}/{cs.maxPoints}
                            </p>
                          ))}
                        </div>
                      )}
                      {!full && q.solution && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 break-words">
                          <span className="font-semibold uppercase text-[11px] tracking-[0.08em]">{t('ea.solutionLabel')}: </span>
                          {q.solution}
                        </p>
                      )}
                    </div>
                  );
                }) : (
                  <p className="text-[11px] text-slate-400 italic">{t('ea.noDetail')}</p>
                )}

                {exam.questions && exam.questions.length > 0 && (
                  <p className="text-xs text-slate-400 font-semibold text-right">
                    {tp('dashboard.questionsN', exam.questions.length)} · {exam.achievedPoints}/{exam.totalPoints} P.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
