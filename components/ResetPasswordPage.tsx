import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { changePassword } from '../services/userService';
import { BrandMark } from './BrandMark';
import { BrandSpinner } from './BrandSpinner';
import { useTranslation } from '../i18n/I18nProvider';

interface ResetPasswordPageProps {
  authChecked: boolean;
  userId?: string | null;
}

/**
 * Landeseite für den Supabase-Recovery-Link (resetPasswordForEmail ->
 * redirectTo hierher). supabase-js liest das access_token aus dem
 * URL-Hash automatisch aus (detectSessionInUrl, Standard) und setzt eine
 * gültige Session, BEVOR diese Komponente etwas selbst tun muss — deshalb
 * genügt hier ein simpler Check auf authChecked/userId statt eigener
 * Token-Verarbeitung.
 */
export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ authChecked, userId }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError(t('rpp.mismatch')); return; }
    setIsLoading(true);
    try {
      await changePassword(password);
      setDone(true);
    } catch (err: any) {
      setError(err.message || t('rpp.genericError'));
    } finally {
      setIsLoading(false);
    }
  };

  const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-main)' }}>
      <div
        className="w-full max-w-md rounded-[32px] shadow-3d-deep overflow-hidden p-8"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        {children}
      </div>
    </div>
  );

  const Header: React.FC = () => (
    <div className="flex items-center gap-3 mb-6">
      <BrandMark size={26} strokeColor="var(--mark-stroke)" peakColor="var(--mark-peak)" className="shrink-0" />
      <h1 className="text-base font-black uppercase tracking-tight" style={{ color: 'var(--text-main)' }}>
        Stude<span style={{ color: 'var(--mark-peak)' }}>Arc</span>
      </h1>
    </div>
  );

  if (!authChecked) {
    return (
      <Card>
        <Header />
        <div className="flex items-center gap-3 py-4">
          <BrandSpinner size={20} strokeColor="var(--mark-stroke)" peakColor="var(--mark-peak)" />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('rpp.checking')}</p>
        </div>
      </Card>
    );
  }

  if (!userId) {
    return (
      <Card>
        <Header />
        <h2 className="text-lg font-black mb-2" style={{ color: 'var(--text-main)' }}>{t('rpp.invalidTitle')}</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{t('rpp.invalidText')}</p>
        <button
          onClick={() => window.location.href = '/'}
          className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          {t('rpp.backToApp')}
        </button>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <Header />
        <p className="font-black text-lg mb-4 text-emerald-600">{t('rpp.success')}</p>
        <button
          onClick={() => window.location.href = '/'}
          className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          {t('rpp.continueToApp')}
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <Header />
      <h2 className="text-lg font-black mb-1" style={{ color: 'var(--text-main)' }}>{t('rpp.title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{t('rpp.subtitle')}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('rpp.newPassword')}</label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.75} />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              required
              minLength={6}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm outline-none focus:ring-2 transition-all"
              style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)', color: 'var(--text-main)', '--tw-ring-color': 'color-mix(in srgb, var(--primary) 40%, transparent)' } as React.CSSProperties}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('rpp.confirmPassword')}</label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.75} />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              required
              minLength={6}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm outline-none focus:ring-2 transition-all"
              style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)', color: 'var(--text-main)', '--tw-ring-color': 'color-mix(in srgb, var(--primary) 40%, transparent)' } as React.CSSProperties}
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
            <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          {isLoading
            ? <><BrandSpinner size={16} strokeColor="var(--primary-text)" peakColor="var(--primary-text)" /> {t('auth.pleaseWait')}</>
            : t('rpp.submit')
          }
        </button>
      </form>
    </Card>
  );
};
