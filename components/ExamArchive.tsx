import React, { useMemo, useState } from 'react';
import type { ExamQuestion } from '../types';
import { getAllExamResults } from '../services/examHistoryService';
import type { ExamResult } from '../services/examHistoryService';
import { germanGradeFromPercentage, getCategoryLabel } from '../services/learningProfileService';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';

/** Antwort des Nutzers je Fragetyp als lesbaren Text aufbereiten. */
const formatUserAnswer = (q: ExamQuestion, t: (k: any, p?: any) => string): string => {
  const a = q.userAnswer;
  if (a === undefined || a === null || (Array.isArray(a) && a.length === 0) || a === '') return t('ea.noAnswer');
  switch (q.type) {
    case 'mc':
      return (a as number[]).map(i => q.options?.[i] ?? `#${i + 1}`).join(' · ');
    case 'truefalse': {
      const tf = (a as { tf?: boolean; reason?: number });
      if (tf.tf === undefined) return t('ea.noAnswer');
      const base = tf.tf ? t('tf.true') : t('tf.false');
      const reason = tf.reason !== undefined ? q.tfReasonOptions?.[tf.reason] : undefined;
      return reason ? `${base} · ${reason}` : base;
    }
    case 'matching':
      return (a as number[]).map((ri, li) => `${q.matchLeft?.[li] ?? li + 1} → ${q.matchRight?.[ri] ?? '—'}`).join(' · ');
    case 'fillblank':
      return (a as string[]).map(x => x || '—').join(' · ');
    case 'ranking':
      return (a as string[]).join(' → ');
    default:
      return String(a);
  }
};

export const ExamArchive: React.FC = () => {
  const { t, tp } = useTranslation();
  const exams = useMemo(() => getAllExamResults().slice(0, 10), []);
  const [openId, setOpenId] = useState<string | null>(null);

  if (exams.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-10 space-y-3">
      <div className="space-y-1">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{t('ea.title')}</p>
        <p className="text-xs text-slate-400 font-medium">{t('ea.subtitle')}</p>
      </div>

      {exams.map(exam => {
        const { grade } = germanGradeFromPercentage(exam.score);
        const isOpen = openId === exam.id;
        return (
          <div key={exam.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[24px] shadow-sm overflow-hidden">
            <button
              onClick={() => setOpenId(isOpen ? null : exam.id)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left"
              aria-expanded={isOpen}
            >
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${exam.passed ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600' : 'bg-rose-100 dark:bg-rose-950/30 text-rose-500'}`}>
                {grade}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black dark:text-white break-words">{exam.docName}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                  {formatDate(exam.timestamp, { day: '2-digit', month: 'short', year: '2-digit' })} · {exam.score}% · {exam.passed ? t('ea.passed') : t('ea.failed')}
                </p>
              </div>
              <span className="text-slate-300 font-black shrink-0">{isOpen ? '−' : '+'}</span>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 space-y-3 animate-in fade-in duration-300">
                {exam.categoryBreakdown && exam.categoryBreakdown.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {exam.categoryBreakdown.map(cb => (
                      <span key={cb.category} className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
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
                        <span className="text-[10px] font-black shrink-0 dark:text-white">{t('ea.points', { a: pts, b: q.points })}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 break-words">
                        <span className="font-black uppercase text-[8px] tracking-widest">{t('ea.yourAnswer')}: </span>
                        {formatUserAnswer(q, t)}
                      </p>
                      {q.feedback && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 italic break-words">{q.feedback}</p>
                      )}
                      {q.criterionScores && q.criterionScores.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {q.criterionScores.map(cs => (
                            <p key={cs.criterionId} className="text-[10px] text-slate-500 dark:text-slate-400 break-words">
                              {cs.status === 'full' ? '✓' : cs.status === 'partial' ? '~' : '✗'} {cs.criterionName}: {cs.pointsAwarded}/{cs.maxPoints}
                            </p>
                          ))}
                        </div>
                      )}
                      {!full && q.solution && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 break-words">
                          <span className="font-black uppercase text-[8px] tracking-widest">{t('ea.solutionLabel')}: </span>
                          {q.solution}
                        </p>
                      )}
                    </div>
                  );
                }) : (
                  <p className="text-[11px] text-slate-400 italic">{t('ea.noDetail')}</p>
                )}

                {exam.questions && exam.questions.length > 0 && (
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest text-right">
                    {tp('dashboard.questionsN', exam.questions.length)} · {exam.achievedPoints}/{exam.totalPoints} P.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
