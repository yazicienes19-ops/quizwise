import React, { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { verifyLogin, isValidCode, CODE_LENGTH } from '../services/mfaService';
import { BrandMark } from './BrandMark';

/**
 * Zweiter Schritt der Anmeldung: Hat das Konto einen Authenticator eingerichtet
 * und ist diese Sitzung noch nicht bestätigt, zeigt die App nur diese Abfrage.
 */
export const MfaGate: React.FC<{ onVerified: () => void; onSignOut: () => void }> = ({ onVerified, onSignOut }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidCode(code)) return;
    setBusy(true); setError('');
    try { await verifyLogin(code); onVerified(); }
    catch { setError(t('mfa.errCode')); setCode(''); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-main)' }}>
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-[24px] p-8 space-y-5"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        aria-labelledby="mfa-gate-title"
      >
        <div className="flex items-center gap-3">
          <BrandMark size={26} strokeColor="var(--mark-stroke)" peakColor="var(--mark-peak)" />
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--primary-ink)' }} aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 id="mfa-gate-title" className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>{t('mfa.gateTitle')}</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('mfa.gateDesc')}</p>
        </div>
        <label htmlFor="mfa-gate-code" className="sr-only">{t('mfa.codeLabel')}</label>
        <input
          id="mfa-gate-code"
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="······"
          className="w-full px-4 py-3 rounded-xl text-2xl text-center tracking-[0.08em] font-mono outline-none"
          style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--ink)' }}
        />
        {error && <p role="alert" className="text-[13px] text-rose-600">{error}</p>}
        <button type="submit" disabled={busy || !isValidCode(code)}
          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('mfa.confirm')}
        </button>
        <button type="button" onClick={onSignOut} className="w-full text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {t('mfa.signOut')}
        </button>
      </form>
    </div>
  );
};
