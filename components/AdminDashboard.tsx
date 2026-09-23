import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertCircle, Users as UsersIcon, Flag } from 'lucide-react';
import { fetchAdminUsers, fetchQuestionReports, grantPro, revokePro, suspendUser, unsuspendUser, type AdminUserRow, type QuestionReportsResponse } from '../services/adminService';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';
import { formatDateTime } from '../i18n/dates';
import { toast } from '../services/toast';
import { AdminBudgetPanel, formatEur } from './AdminBudgetPanel';

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
};

/** Anzeigename eines Meldegrunds: Quiz-Gründe aus der Ergebnisseite, Klausur-Gründe aus ExamView. */
const REPORT_REASON_KEYS: Record<string, TKey> = {
  unclear: 'result.fb.unclear', wrong: 'result.fb.wrong', no_correct: 'result.fb.noCorrect',
  duplicate: 'result.fb.duplicate', too_easy: 'result.fb.tooEasy', too_hard: 'result.fb.tooHard', other: 'result.fb.other',
  too_strict: 'ev.fbTooStrict', too_lenient: 'ev.fbTooLenient', incomplete_solution: 'ev.fbMissing', unrealistic: 'ev.fbUnrealistic',
};

const GRANT_OPTIONS: { days: number; key: TKey }[] = [
  { days: 7, key: 'admin.action.days7' },
  { days: 30, key: 'admin.action.days30' },
  { days: 90, key: 'admin.action.days90' },
  { days: 365, key: 'admin.action.days365' },
];

export const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSuspendId, setConfirmSuspendId] = useState<string | null>(null);
  const [reports, setReports] = useState<QuestionReportsResponse | null>(null);
  const [reportsError, setReportsError] = useState(false);
  const [budgetReload, setBudgetReload] = useState(0);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setReportsError(false);
    setBudgetReload(n => n + 1);
    // Meldungen unabhängig laden: ein Fehler dort darf die Nutzerliste nicht blockieren.
    fetchQuestionReports().then(setReports).catch(() => setReportsError(true));
    try {
      setUsers(await fetchAdminUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.error'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (userId: string, actionKey: string, fn: () => Promise<void>, successKey: TKey) => {
    const busyKey = `${userId}:${actionKey}`;
    setBusy(busyKey);
    try {
      await fn();
      toast.success(t(successKey));
      setConfirmSuspendId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.actionFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black dark:text-white flex items-center gap-2">
            <UsersIcon className="w-5 h-5" strokeWidth={1.75} style={{ color: 'var(--primary)' }} />
            {t('admin.title')}
          </h1>
          <p className="text-[11px] font-medium text-slate-400 mt-1">{t('admin.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {users && (
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              {t('admin.totalUsers', { count: users.length })}
            </span>
          )}
          <button
            onClick={load}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={2} />
            {t('admin.retry')}
          </button>
        </div>
      </div>

      <AdminBudgetPanel reloadSignal={budgetReload} />

      {isLoading && !users && (
        <p className="text-[11px] text-slate-400 italic">{t('admin.loading')}</p>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
          <span className="text-[11px] font-medium">{error}</span>
        </div>
      )}

      {users && users.length === 0 && !error && (
        <p className="text-[11px] text-slate-400 italic">{t('admin.empty')}</p>
      )}

      {users && users.length > 0 && (
        <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid var(--border-color)' }}>
          <table className="w-full text-left border-collapse min-w-[1180px]">
            <thead>
              <tr className="text-[11px] font-black uppercase tracking-widest text-slate-400" style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))' }}>
                <th className="px-4 py-3">{t('admin.col.user')}</th>
                <th className="px-4 py-3">{t('admin.col.plan')}</th>
                <th className="px-4 py-3">{t('admin.col.created')}</th>
                <th className="px-4 py-3">{t('admin.col.lastLogin')}</th>
                <th className="px-4 py-3">{t('admin.col.lastActive')}</th>
                <th className="px-4 py-3">{t('admin.col.last7Time')}</th>
                <th className="px-4 py-3">{t('admin.col.totalTime')}</th>
                <th className="px-4 py-3">{t('admin.col.monthCost')}</th>
                <th className="px-4 py-3">{t('admin.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="text-[11px] border-t align-top" style={{ borderColor: 'var(--border-color)' }}>
                  <td className="px-4 py-3">
                    <p className="font-black dark:text-white">{u.email || u.id}</p>
                    <p className="text-[11px] text-slate-400">{u.name || t('admin.noName')}</p>
                    {u.isSuspended && (
                      <span className="inline-block mt-1 text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                        {t('admin.status.suspended')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-black uppercase px-2 py-1 rounded-full ${
                      u.plan === 'pro'
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {u.plan}
                    </span>
                    {u.adminProUntil && (
                      <p className="text-[11px] text-slate-400 mt-1 whitespace-nowrap">
                        {t('admin.status.adminGrant', { date: formatDateTime(u.adminProUntil, { dateStyle: 'medium' }) })}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {u.createdAt ? formatDateTime(u.createdAt, { dateStyle: 'medium' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {u.lastSignInAt ? formatDateTime(u.lastSignInAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('admin.never')}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {u.lastActiveAt ? formatDateTime(u.lastActiveAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('admin.never')}
                  </td>
                  <td className="px-4 py-3 font-black dark:text-white whitespace-nowrap">{formatDuration(u.last7DaysActiveSeconds)}</td>
                  <td className="px-4 py-3 font-black dark:text-white whitespace-nowrap">{formatDuration(u.totalActiveSeconds)}</td>
                  <td className="px-4 py-3 font-black dark:text-white whitespace-nowrap">{u.monthCostEur === null ? '—' : formatEur(u.monthCostEur)}</td>
                  <td className="px-4 py-3 min-w-[220px]">
                    {u.isAdmin ? (
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t('admin.status.admin')}</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {GRANT_OPTIONS.map(({ days, key }) => {
                            const busyKey = `${u.id}:grant-${days}`;
                            return (
                              <button
                                key={days}
                                onClick={() => runAction(u.id, `grant-${days}`, () => grantPro(u.id, days), 'admin.actionSuccess.granted')}
                                disabled={busy === busyKey}
                                title={t('admin.action.grantPro')}
                                className="px-2 py-1 rounded-full text-[11px] font-black uppercase bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                              >
                                {t(key)}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {u.plan === 'pro' && (
                            <button
                              onClick={() => runAction(u.id, 'revoke', () => revokePro(u.id), 'admin.actionSuccess.revoked')}
                              disabled={busy === `${u.id}:revoke`}
                              className="text-[11px] font-black uppercase text-amber-600 hover:text-amber-700 dark:text-amber-500 disabled:opacity-50"
                            >
                              {t('admin.action.revokePro')}
                            </button>
                          )}
                          {u.isSuspended ? (
                            <button
                              onClick={() => runAction(u.id, 'unsuspend', () => unsuspendUser(u.id), 'admin.actionSuccess.unsuspended')}
                              disabled={busy === `${u.id}:unsuspend`}
                              className="text-[11px] font-black uppercase text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 disabled:opacity-50"
                            >
                              {t('admin.action.unsuspend')}
                            </button>
                          ) : confirmSuspendId === u.id ? (
                            <span className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] text-rose-500">{t('admin.action.suspendConfirm')}</span>
                              <button
                                onClick={() => runAction(u.id, 'suspend', () => suspendUser(u.id), 'admin.actionSuccess.suspended')}
                                disabled={busy === `${u.id}:suspend`}
                                className="text-[11px] font-black uppercase text-rose-600 hover:text-rose-700 dark:text-rose-500 disabled:opacity-50"
                              >
                                {t('admin.action.confirmYes')}
                              </button>
                              <button
                                onClick={() => setConfirmSuspendId(null)}
                                className="text-[11px] font-black uppercase text-slate-400 hover:text-slate-500"
                              >
                                {t('admin.action.cancel')}
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmSuspendId(u.id)}
                              className="text-[11px] font-black uppercase text-rose-500 hover:text-rose-600"
                            >
                              {t('admin.action.suspend')}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Gemeldete Fragen (question_reports) */}
      <section className="space-y-3 pt-4">
        <div>
          <h2 className="text-base font-black dark:text-white flex items-center gap-2">
            <Flag className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--primary)' }} />
            {t('admin.reports.title')}
            {reports && reports.total > 0 && (
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t('admin.reports.count', { n: reports.total })}</span>
            )}
          </h2>
          <p className="text-[11px] font-medium text-slate-400 mt-1">{t('admin.reports.subtitle')}</p>
        </div>
        {reportsError && <p className="text-[11px] text-rose-500">{t('admin.reports.loadFailed')}</p>}
        {reports?.setupMissing && (
          <p className="text-[11px] font-medium p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">{t('admin.reports.setupMissing')}</p>
        )}
        {reports && !reports.setupMissing && reports.groups.length === 0 && (
          <p className="text-[11px] text-slate-400 italic">{t('admin.reports.empty')}</p>
        )}
        {reports && reports.groups.length > 0 && (
          <div className="space-y-2">
            {reports.groups.map(g => (
              <div key={g.key} className="p-4 rounded-2xl space-y-2" style={{ border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                    {t('admin.reports.count', { n: g.count })}
                  </span>
                  <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {g.kind === 'exam' ? t('admin.reports.kindExam') : t('admin.reports.kindQuiz')}
                  </span>
                  {(Object.entries(g.reasons) as [string, number][]).map(([reason, n]) => (
                    <span key={reason} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                      {REPORT_REASON_KEYS[reason] ? t(REPORT_REASON_KEYS[reason]) : reason}{n > 1 ? ` ×${n}` : ''}
                    </span>
                  ))}
                  <span className="text-[11px] text-slate-400 ml-auto">
                    {t('admin.reports.reporters', { n: g.reporters })} · {t('admin.reports.last', { date: formatDateTime(g.lastReportedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}
                  </span>
                </div>
                <p className="text-[12px] font-bold dark:text-white break-words whitespace-pre-line">{g.questionText}</p>
                {g.docNames.length > 0 && <p className="text-[11px] text-slate-400 break-words">{g.docNames.join(', ')}</p>}
                {(g.details.options?.length || g.details.explanation) && (
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-[11px] font-black uppercase tracking-widest text-slate-400">{t('admin.reports.details')}</summary>
                    <ul className="mt-2 space-y-1">
                      {(g.details.options ?? []).map((opt, i) => {
                        const correct = g.details.correctAnswerIndices?.includes(i);
                        return (
                          <li key={i} className={correct ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
                            {correct ? '✓ ' : '· '}{opt}
                          </li>
                        );
                      })}
                    </ul>
                    {g.details.explanation && <p className="mt-2 text-slate-500 dark:text-slate-400 break-words">{g.details.explanation}</p>}
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
