import React, { useState } from 'react';
import { X, Mail, Lock, User } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { useTranslation } from '../i18n/I18nProvider';
import { BrandMark } from './BrandMark';
import { BrandSpinner } from './BrandSpinner';

interface AuthModalProps {
  onClose: () => void;
  /** Optional, da AuthModal an mehreren Stellen ohne Erfolgs-Callback gemountet wird (z.B. Landing-/Shared-Deck-Seite) */
  onSuccess?: () => void;
}

const GoogleIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.99-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
  </svg>
);

const AppleIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
    <path d="M13.15 9.4c-.02-2.03 1.66-3 1.73-3.06-.95-1.38-2.42-1.57-2.94-1.6-1.25-.12-2.44.73-3.08.73-.64 0-1.62-.71-2.66-.7-1.37.02-2.63.8-3.34 2.02-1.42 2.47-.36 6.11 1.02 8.11.68.98 1.48 2.08 2.54 2.04 1.02-.04 1.4-.65 2.63-.65s1.58.65 2.66.63c1.1-.02 1.79-1 2.46-1.99a8.7 8.7 0 0 0 1.11-2.28c-.03-.01-2.12-.81-2.14-3.24zM11.2 3.34c.56-.68.94-1.62.83-2.56-.8.03-1.78.53-2.36 1.2-.52.6-.98 1.56-.86 2.48.9.07 1.82-.46 2.39-1.12z" />
  </svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } }
        });
        if (error) throw error;
        setSuccessMsg(t('auth.confirmSent'));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSuccess?.();
        onClose();
      }
    } catch (err: any) {
      // Supabase-Fehlermeldungen auf Deutsch übersetzen
      const msg = err.message || '';
      if (msg.includes('Invalid login')) setError(t('auth.errInvalid'));
      else if (msg.includes('already registered')) setError(t('auth.errExists'));
      else if (msg.includes('Password should')) setError(t('auth.errShortPw'));
      else setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError('');
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // Erfolgreicher Aufruf leitet den Browser sofort zum Provider weiter —
      // der Loading-State bleibt bewusst bis dahin stehen (kein finally/reset).
    } catch (err: any) {
      setError(t('auth.errOAuth'));
      setOauthLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-[32px] shadow-3d-deep animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        {/* Header */}
        <div className="p-8 pb-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark size={26} strokeColor="var(--mark-stroke)" peakColor="var(--mark-peak)" className="shrink-0" />
            <div>
              <h2 className="text-base font-black uppercase tracking-tight" style={{ color: 'var(--text-main)' }}>
                Stude<span style={{ color: 'var(--mark-peak)' }}>Arc</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                {mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}
              </p>
            </div>
          </div>
          <button aria-label={t('common.close')}
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all"
            style={{ background: 'color-mix(in srgb, var(--border-color) 60%, var(--bg-sidebar))' }}
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="px-8 pt-6">
          <div className="flex p-1 rounded-2xl" style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))' }}>
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccessMsg(''); }}
                className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                style={mode === m
                  ? { background: 'var(--primary)', color: 'var(--primary-text)', boxShadow: '0 4px 12px color-mix(in srgb, var(--primary) 30%, transparent)' }
                  : { color: 'var(--text-secondary)' }
                }
              >
                {m === 'login' ? t('auth.login') : t('auth.register')}
              </button>
            ))}
          </div>
        </div>

        {/* OAuth */}
        <div className="px-8 pt-6 space-y-2.5">
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={!!oauthLoading || isLoading}
            className="w-full py-3.5 rounded-2xl text-[12px] font-bold flex items-center justify-center gap-3 transition-all hover:opacity-80 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
          >
            {oauthLoading === 'google' ? <BrandSpinner size={18} strokeColor="var(--mark-stroke)" peakColor="var(--mark-peak)" /> : <GoogleIcon />}
            {t('auth.continueWithGoogle')}
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('apple')}
            disabled={!!oauthLoading || isLoading}
            className="w-full py-3.5 rounded-2xl text-[12px] font-bold flex items-center justify-center gap-3 transition-all hover:opacity-80 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
          >
            {oauthLoading === 'apple' ? <BrandSpinner size={18} strokeColor="var(--mark-stroke)" peakColor="var(--mark-peak)" /> : <AppleIcon />}
            {t('auth.continueWithApple')}
          </button>
        </div>

        <div className="px-8 pt-5 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--border-color)' }} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('auth.orDivider')}</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border-color)' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 pt-5 space-y-4">
          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('auth.name')}</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('auth.namePlaceholder')}
                  required
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm outline-none focus:ring-2 transition-all"
                  style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)', color: 'var(--text-main)', '--tw-ring-color': 'color-mix(in srgb, var(--primary) 40%, transparent)' } as React.CSSProperties}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('auth.email')}</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.75} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                required
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm outline-none focus:ring-2 transition-all"
                style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)', color: 'var(--text-main)', '--tw-ring-color': 'color-mix(in srgb, var(--primary) 40%, transparent)' } as React.CSSProperties}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('auth.password')}</label>
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

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
              <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{error}</p>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{successMsg}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {isLoading
              ? <><BrandSpinner size={16} strokeColor="var(--primary-text)" peakColor="var(--primary-text)" /> {t('auth.pleaseWait')}</>
              : mode === 'login' ? t('auth.login') : t('auth.createAccount')
            }
          </button>
        </form>
      </div>
    </div>
  );
};
