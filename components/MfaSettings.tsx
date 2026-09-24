import React, { useEffect, useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { listVerifiedTotp, startTotpSetup, verifyTotp, removeTotp, isValidCode, CODE_LENGTH, type TotpSetup } from '../services/mfaService';
import { confirmDialog } from '../services/confirmDialog';
import { toast } from '../services/toast';

/** Zwei-Faktor-Anmeldung einrichten und abschalten (Einstellungen → Datenschutz). */
export const MfaSettings: React.FC = () => {
  const { t } = useTranslation();
  const [factors, setFactors] = useState<{ id: string; createdAt: string }[] | null>(null);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => listVerifiedTotp().then(setFactors).catch(() => setFactors([]));
  useEffect(() => { load(); }, []);

  const begin = async () => {
    setBusy(true); setError('');
    try { setSetup(await startTotpSetup()); setCode(''); }
    catch { setError(t('mfa.errStart')); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!setup || !isValidCode(code)) return;
    setBusy(true); setError('');
    try {
      await verifyTotp(setup.factorId, code);
      setSetup(null); setCode('');
      toast.success(t('mfa.enabled'));
      await load();
    } catch { setError(t('mfa.errCode')); }
    finally { setBusy(false); }
  };

  const disable = async (id: string) => {
    if (!(await confirmDialog({ message: t('mfa.disableConfirm'), confirmLabel: t('mfa.disable'), danger: true }))) return;
    setBusy(true); setError('');
    try { await removeTotp(id); toast.success(t('mfa.disabled')); await load(); }
    catch { setError(t('mfa.errDisable')); }
    finally { setBusy(false); }
  };

  const enabled = (factors?.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('mfa.title')}</p>
      <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{t('mfa.desc')}</p>

      {factors === null ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" aria-label={t('mfa.loading')} />
      ) : enabled && !setup ? (
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
          <ShieldCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" />
          <p className="flex-1 min-w-[180px] text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('mfa.isOn')}</p>
          <button onClick={() => disable(factors![0].id)} disabled={busy}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold text-rose-600 disabled:opacity-40"
            style={{ border: '1px solid var(--border-color)' }}>
            {t('mfa.disable')}
          </button>
        </div>
      ) : !setup ? (
        <button onClick={begin} disabled={busy}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[13px] font-semibold disabled:opacity-40"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />}
          {t('mfa.setup')}
        </button>
      ) : (
        <div className="space-y-4 p-4 rounded-2xl" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
          <ol className="list-decimal pl-5 space-y-1 text-[13px]" style={{ color: 'var(--ink2)' }}>
            <li>{t('mfa.step1')}</li>
            <li>{t('mfa.step2')}</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <img src={setup.qrCode} alt={t('mfa.qrAlt')} width={160} height={160} className="rounded-xl bg-white p-2" />
            <div className="min-w-0 space-y-1">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('mfa.manual')}</p>
              <code className="block text-[13px] font-mono break-all select-all" style={{ color: 'var(--ink)' }}>{setup.secret}</code>
            </div>
          </div>
          <form onSubmit={e => { e.preventDefault(); confirm(); }} className="flex flex-wrap gap-2">
            <label htmlFor="mfa-setup-code" className="sr-only">{t('mfa.codeLabel')}</label>
            <input
              id="mfa-setup-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="······"
              className="w-36 px-4 py-3 rounded-xl text-lg tracking-[0.3em] font-mono outline-none"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--ink)' }}
            />
            <button type="submit" disabled={busy || !isValidCode(code)}
              className="px-5 py-3 rounded-xl text-[13px] font-semibold disabled:opacity-40"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
              {t('mfa.confirm')}
            </button>
            <button type="button" onClick={() => { setSetup(null); setCode(''); setError(''); }}
              className="px-4 py-3 rounded-xl text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {t('common.cancel')}
            </button>
          </form>
        </div>
      )}
      {error && <p role="alert" className="text-[13px] text-rose-600">{error}</p>}
    </div>
  );
};
