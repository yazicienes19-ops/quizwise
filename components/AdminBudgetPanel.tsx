import React, { useEffect, useState, useCallback } from 'react';
import { Wallet } from 'lucide-react';
import { fetchAiBudget, saveAiBudget, type AiBudgetResponse } from '../services/adminService';
import { useTranslation } from '../i18n/I18nProvider';
import { localeTag } from '../i18n';
import type { TKey } from '../i18n';
import { toast } from '../services/toast';

export const formatEur = (value: number): string =>
  new Intl.NumberFormat(localeTag(), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const STATE_STYLE: Record<'ok' | 'soft' | 'hard', { key: TKey; chip: string; bar: string }> = {
  ok: { key: 'admin.budget.stateOk', chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', bar: 'var(--primary)' },
  soft: { key: 'admin.budget.stateSoft', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', bar: '#d97706' },
  hard: { key: 'admin.budget.stateHard', chip: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400', bar: '#e11d48' },
};

interface FormState { global: string; pro: string; free: string; soft: string }

/** Monatsbudget für Gemini (backend/src/budget/aiBudget.js): Verbrauch + Deckel bearbeiten. */
export const AdminBudgetPanel: React.FC<{ reloadSignal: number }> = ({ reloadSignal }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<AiBudgetResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await fetchAiBudget();
      setData(res);
      if (res.setupMissing === false) {
        const s = res.settings;
        setForm({
          global: String(s.global_monthly_eur),
          pro: String(s.pro_user_monthly_eur),
          free: String(s.free_user_monthly_eur),
          soft: String(Math.round(s.soft_ratio * 100)),
        });
      }
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load, reloadSignal]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await saveAiBudget({
        globalMonthlyEur: Number(form.global.replace(',', '.')),
        proUserMonthlyEur: Number(form.pro.replace(',', '.')),
        freeUserMonthlyEur: Number(form.free.replace(',', '.')),
        softRatio: Number(form.soft.replace(',', '.')) / 100,
      });
      toast.success(t('admin.budget.saved'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const ready = data && data.setupMissing === false ? data : null;
  const limit = ready?.settings.global_monthly_eur ?? 0;
  const spent = ready?.globalCostEur ?? 0;
  const ratio = limit > 0 ? spent / limit : 1;
  const state: 'ok' | 'soft' | 'hard' = !ready ? 'ok'
    : ratio >= 1 ? 'hard'
    : ratio >= ready.settings.soft_ratio ? 'soft'
    : 'ok';
  const style = STATE_STYLE[state];

  const fields: { key: keyof FormState; label: TKey; step: string }[] = [
    { key: 'global', label: 'admin.budget.global', step: '1' },
    { key: 'pro', label: 'admin.budget.pro', step: '0.5' },
    { key: 'free', label: 'admin.budget.free', step: '0.1' },
    { key: 'soft', label: 'admin.budget.soft', step: '5' },
  ];

  return (
    <section className="p-4 md:p-5 rounded-2xl space-y-4" style={{ border: '1px solid var(--border-color)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-black dark:text-white flex items-center gap-2">
            <Wallet className="w-4 h-4" strokeWidth={1.75} style={{ color: 'var(--primary-ink)' }} />
            {t('admin.budget.title')}
          </h2>
          <p className="text-[11px] font-medium text-slate-400 mt-1 max-w-2xl">{t('admin.budget.subtitle')}</p>
        </div>
        {ready && (
          <span className={`text-[11px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${style.chip}`}>
            {t(style.key)}
          </span>
        )}
      </div>

      {loadFailed && <p className="text-[11px] text-rose-500">{t('admin.budget.loadFailed')}</p>}
      {data?.setupMissing && (
        <p className="text-[11px] font-medium p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">{t('admin.budget.setupMissing')}</p>
      )}

      {ready && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <p className="text-lg font-black dark:text-white">
              {t('admin.budget.spent', { spent: formatEur(spent), limit: formatEur(limit) })}
            </p>
            <p className="text-[11px] text-slate-400">
              {t('admin.budget.stats', {
                calls: ready.calls.toLocaleString(localeTag()),
                users: ready.activeUsers,
                tokens: (ready.inputTokens + ready.outputTokens).toLocaleString(localeTag()),
              })}
            </p>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--border-color) 60%, var(--bg-main))' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, ratio * 100)}%`, background: style.bar }} />
          </div>
        </div>
      )}

      {ready && form && (
        <div className="flex items-end gap-3 flex-wrap">
          {fields.map(f => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t(f.label)}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step={f.step}
                value={form[f.key]}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                className="w-28 px-3 py-2 rounded-2xl text-[12px] font-bold bg-transparent dark:text-white focus:outline-none focus:ring-2"
                style={{ border: '1px solid var(--border-color)', ['--tw-ring-color' as string]: 'var(--primary)' }}
              />
            </label>
          ))}
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--primary)' }}
          >
            {t('admin.budget.save')}
          </button>
        </div>
      )}

      {ready && <p className="text-[11px] text-slate-400">{t('admin.budget.note')}</p>}
    </section>
  );
};
