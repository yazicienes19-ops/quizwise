import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertCircle, Users as UsersIcon } from 'lucide-react';
import { fetchAdminUsers, grantPro, revokePro, suspendUser, unsuspendUser, type AdminUserRow } from '../services/adminService';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';
import { formatDateTime } from '../i18n/dates';
import { toast } from '../services/toast';

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
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

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
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
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              {t('admin.totalUsers', { count: users.length })}
            </span>
          )}
          <button
            onClick={load}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={2} />
            {t('admin.retry')}
          </button>
        </div>
      </div>

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
          <table className="w-full text-left border-collapse min-w-[1080px]">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400" style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))' }}>
                <th className="px-4 py-3">{t('admin.col.user')}</th>
                <th className="px-4 py-3">{t('admin.col.plan')}</th>
                <th className="px-4 py-3">{t('admin.col.created')}</th>
                <th className="px-4 py-3">{t('admin.col.lastLogin')}</th>
                <th className="px-4 py-3">{t('admin.col.lastActive')}</th>
                <th className="px-4 py-3">{t('admin.col.last7Time')}</th>
                <th className="px-4 py-3">{t('admin.col.totalTime')}</th>
                <th className="px-4 py-3">{t('admin.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="text-[11px] border-t align-top" style={{ borderColor: 'var(--border-color)' }}>
                  <td className="px-4 py-3">
                    <p className="font-black dark:text-white">{u.email || u.id}</p>
                    <p className="text-[10px] text-slate-400">{u.name || t('admin.noName')}</p>
                    {u.isSuspended && (
                      <span className="inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                        {t('admin.status.suspended')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full ${
                      u.plan === 'pro'
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {u.plan}
                    </span>
                    {u.adminProUntil && (
                      <p className="text-[9px] text-slate-400 mt-1 whitespace-nowrap">
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
                  <td className="px-4 py-3 min-w-[220px]">
                    {u.isAdmin ? (
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('admin.status.admin')}</span>
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
                                className="px-2 py-1 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
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
                              className="text-[9px] font-black uppercase text-amber-600 hover:text-amber-700 dark:text-amber-500 disabled:opacity-50"
                            >
                              {t('admin.action.revokePro')}
                            </button>
                          )}
                          {u.isSuspended ? (
                            <button
                              onClick={() => runAction(u.id, 'unsuspend', () => unsuspendUser(u.id), 'admin.actionSuccess.unsuspended')}
                              disabled={busy === `${u.id}:unsuspend`}
                              className="text-[9px] font-black uppercase text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 disabled:opacity-50"
                            >
                              {t('admin.action.unsuspend')}
                            </button>
                          ) : confirmSuspendId === u.id ? (
                            <span className="flex items-center gap-2 flex-wrap">
                              <span className="text-[9px] text-rose-500">{t('admin.action.suspendConfirm')}</span>
                              <button
                                onClick={() => runAction(u.id, 'suspend', () => suspendUser(u.id), 'admin.actionSuccess.suspended')}
                                disabled={busy === `${u.id}:suspend`}
                                className="text-[9px] font-black uppercase text-rose-600 hover:text-rose-700 dark:text-rose-500 disabled:opacity-50"
                              >
                                {t('admin.action.confirmYes')}
                              </button>
                              <button
                                onClick={() => setConfirmSuspendId(null)}
                                className="text-[9px] font-black uppercase text-slate-400 hover:text-slate-500"
                              >
                                {t('admin.action.cancel')}
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmSuspendId(u.id)}
                              className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-600"
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
    </div>
  );
};
