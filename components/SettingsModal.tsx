import React, { useState, useEffect } from 'react';
import {
  X, User, CreditCard, Palette, Key, Check, Loader2, Moon, Sun,
  Zap, LogOut, AlertTriangle, Download, Trash2, Lock, ExternalLink, Shield
} from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { fetchUserProfile } from '../services/geminiService';
import { applyAccentColor } from './ColorPicker';
import { startCheckout } from '../services/stripeService';
import { changePassword, deleteAccount, exportUserData, getInvoices, cancelSubscription } from '../services/userService';
import { isPushSupported, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from '../services/pushService';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';
import type { Locale } from '../i18n';

const PRESETS = [
  { name: 'Claude Coral', value: '#D97757' },
  { name: 'Indigo',       value: '#6366F1' },
  { name: 'Blau',         value: '#3B82F6' },
  { name: 'Teal',         value: '#14B8A6' },
  { name: 'Grün',         value: '#22C55E' },
  { name: 'Rose',         value: '#F43F5E' },
  { name: 'Violet',       value: '#8B5CF6' },
  { name: 'Amber',        value: '#F59E0B' },
];

const FONTS = [
  { id: 'inter',        name: 'Inter',        labelKey: 'settings.font.modern',   stack: "'Inter', system-ui, sans-serif" },
  { id: 'garamond',     name: 'EB Garamond',  labelKey: 'settings.font.classic',  stack: "'EB Garamond', Georgia, serif" },
  { id: 'dm-sans',      name: 'DM Sans',      labelKey: 'settings.font.clear',    stack: "'DM Sans', system-ui, sans-serif" },
  { id: 'lato',         name: 'Lato',         labelKey: 'settings.font.friendly', stack: "'Lato', system-ui, sans-serif" },
  { id: 'nunito',       name: 'Nunito',       labelKey: 'settings.font.round',    stack: "'Nunito', system-ui, sans-serif" },
  { id: 'merriweather', name: 'Merriweather', labelKey: 'settings.font.readable', stack: "'Merriweather', Georgia, serif" },
] as const;

const SPACING_OPTIONS = [
  { id: '1.4', labelKey: 'settings.spacing.compact' },
  { id: '1.6', labelKey: 'settings.spacing.normal'  },
  { id: '1.9', labelKey: 'settings.spacing.wide'    },
] as const;

function applyFont(fontId: string, userId?: string | null) {
  const font = FONTS.find(f => f.id === fontId);
  if (!font) return;
  document.documentElement.style.setProperty('--font-app', font.stack);
  localStorage.setItem('font_choice', fontId);
  if (userId) import('../services/syncService').then(({ syncPreferences }) => syncPreferences(userId, { font_choice: fontId })).catch(() => {});
}

function applyLineHeight(lh: string, userId?: string | null) {
  document.documentElement.style.setProperty('--line-height-app', lh);
  localStorage.setItem('line_height', lh);
  if (userId) import('../services/syncService').then(({ syncPreferences }) => syncPreferences(userId, { line_height: lh })).catch(() => {});
}

type Tab = 'profil' | 'abo' | 'design' | 'datenschutz' | 'api';

interface Props {
  user: SupabaseUser | null;
  isDark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ user, isDark, onToggleTheme, onLogout, onClose }) => {
  const { t, locale, changeLocale } = useTranslation();
  const [tab, setTab] = useState<Tab>('profil');

  // Profil
  const [name, setName] = useState(user?.user_metadata?.full_name || '');
  const [isSavingName, setIsSavingName] = useState(false);

  // Passwort
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [isSavingPw, setIsSavingPw] = useState(false);

  // Abo
  const [profile, setProfile] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelledUntil, setCancelledUntil] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Design
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('accent_color') || '#D97757');
  const [fontChoice, setFontChoice] = useState(() => localStorage.getItem('font_choice') || 'inter');
  const [lineHeight, setLineHeight] = useState(() => localStorage.getItem('line_height') || '1.6');

  // Push-Erinnerung
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingSubscription().then(sub => setPushEnabled(!!sub)).catch(() => {});
  }, []);

  const handleTogglePush = async () => {
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
        toast.info(t('settings.push.disabled'));
      } else {
        await subscribeToPush();
        setPushEnabled(true);
        toast.success(t('settings.push.enabled'));
      }
    } catch (e: any) {
      toast.error(e?.message || t('settings.push.error'));
    } finally {
      setPushBusy(false);
    }
  };

  // API
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [apiKeySaved, setApiKeySaved] = useState(false);

  // Konto löschen
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (tab === 'abo' && user) {
      setIsLoadingProfile(true);
      fetchUserProfile().then(p => setProfile(p)).finally(() => setIsLoadingProfile(false));
      setIsLoadingInvoices(true);
      getInvoices().then(inv => setInvoices(inv)).finally(() => setIsLoadingInvoices(false));
    }
  }, [tab, user]);

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setIsSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setIsSavingName(false);
    if (error) toast.error(t('settings.name.saveError'));
    else toast.success(t('settings.name.saved'));
  };

  const handleChangePassword = async () => {
    if (newPw.length < 6) return toast.error(t('settings.pw.tooShort'));
    if (newPw !== confirmPw) return toast.error(t('settings.pw.mismatch'));
    setIsSavingPw(true);
    try {
      await changePassword(newPw);
      toast.success(t('settings.pw.changed'));
      setNewPw(''); setConfirmPw('');
    } catch (e: any) { toast.error(e.message); }
    finally { setIsSavingPw(false); }
  };

  const handleCancelSubscription = async () => {
    if (!confirm(t('settings.cancel.confirm'))) return;
    setIsCancelling(true);
    try {
      const endsAt = await cancelSubscription();
      setCancelledUntil(endsAt);
      toast.success(t('settings.cancel.success', { date: endsAt }));
    } catch (e: any) { toast.error(e.message); }
    finally { setIsCancelling(false); }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try { await exportUserData(); toast.success(t('settings.export.success')); }
    catch (e: any) { toast.error(e.message); }
    finally { setIsExporting(false); }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'LÖSCHEN') return toast.error(t('settings.delete.confirmError'));
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      await supabase.auth.signOut();
      onLogout(); onClose();
      toast.success(t('settings.delete.success'));
    } catch (e: any) { toast.error(e.message); setIsDeletingAccount(false); }
  };

  const handleAccentColor = (color: string) => {
    setAccentColor(color);
    applyAccentColor(color);
    if (user) import('../services/syncService').then(({ syncPreferences }) => syncPreferences(user.id, { accent_color: color })).catch(() => {});
  };

  const handleSaveApiKey = () => {
    const trimmed = apiKey.trim();
    if (trimmed) localStorage.setItem('gemini_api_key', trimmed);
    else localStorage.removeItem('gemini_api_key');
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profil',      label: t('settings.tab.profile'),      icon: <User className="w-4 h-4" strokeWidth={1.75} /> },
    { id: 'abo',         label: t('settings.tab.subscription'), icon: <CreditCard className="w-4 h-4" strokeWidth={1.75} /> },
    { id: 'design',      label: t('settings.tab.design'),       icon: <Palette className="w-4 h-4" strokeWidth={1.75} /> },
    { id: 'datenschutz', label: t('settings.tab.privacy'),      icon: <Shield className="w-4 h-4" strokeWidth={1.75} /> },
    { id: 'api',         label: 'API',         icon: <Key className="w-4 h-4" strokeWidth={1.75} /> },
  ];

  const NotLoggedIn = () => (
    <div className="text-center py-8 space-y-2">
      <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" strokeWidth={1.75} />
      <p className="text-sm font-bold dark:text-white">{t('settings.notLoggedIn')}</p>
      <p className="text-[11px] text-slate-400">{t('settings.pleaseLogin')}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl rounded-[32px] shadow-3d-deep animate-in zoom-in-95 duration-300 flex flex-col overflow-hidden"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 pb-0 shrink-0">
          <div>
            <h2 className="text-xl font-black dark:text-white uppercase tracking-tight">{t('settings.title')}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{user?.email || t('settings.notLoggedIn')}</p>
          </div>
          <button aria-label={t('common.close')} onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all active:scale-95" style={{ background: 'color-mix(in srgb, var(--border-color) 60%, var(--bg-sidebar))' }}>
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="px-8 pt-6 shrink-0">
          <div className="flex p-1 rounded-2xl gap-1 overflow-x-auto scrollbar-hide" style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${tab === t.id ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                style={tab === t.id ? { color: 'var(--primary-text)' } : {}}>
                {t.icon}<span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto flex-1 space-y-6">

          {/* ── PROFIL ── */}
          {tab === 'profil' && (!user ? <NotLoggedIn /> : (
            <>
              {/* Avatar */}
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg shrink-0" style={{ color: 'var(--primary-text)' }}>
                  {(name || user.email || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-black dark:text-white text-lg">{name || t('settings.noName')}</p>
                  <p className="text-[11px] text-slate-400">{user.email}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{t('settings.memberSince', { date: formatDate(user.created_at, { month: 'long', year: 'numeric' }) })}</p>
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('settings.displayName')}</label>
                <div className="flex gap-3">
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('settings.namePlaceholder')} onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                    className="flex-1 px-4 py-3 rounded-2xl text-sm dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }} />
                  <button onClick={handleSaveName} disabled={isSavingName}
                    className="px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center gap-2"
                    style={{ background: 'var(--primary)' }}>
                    {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={2.5} />}
                    {t('common.save')}
                  </button>
                </div>
              </div>

              {/* Passwort */}
              <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 pt-2">
                  <Lock className="w-3.5 h-3.5" strokeWidth={2} /> {t('settings.changePassword')}
                </p>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder={t('settings.newPwPlaceholder')}
                  className="w-full px-4 py-3 rounded-2xl text-sm dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }} />
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder={t('settings.confirmPwPlaceholder')}
                  className="w-full px-4 py-3 rounded-2xl text-sm dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }} />
                <button onClick={handleChangePassword} disabled={isSavingPw || !newPw}
                  className="px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white hover:scale-[1.02] active:scale-95 disabled:opacity-40 flex items-center gap-2"
                  style={{ background: 'var(--primary)' }}>
                  {isSavingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" strokeWidth={2} />}
                  {t('settings.savePassword')}
                </button>
              </div>

              {/* Ausloggen */}
              <div className="pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                <button onClick={() => { onLogout(); onClose(); }}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all active:scale-95"
                  style={{ border: '1px solid var(--border-color)' }}>
                  <LogOut className="w-4 h-4" strokeWidth={1.75} /> {t('settings.logout')}
                </button>
              </div>
            </>
          ))}

          {/* ── ABO ── */}
          {tab === 'abo' && (!user ? <NotLoggedIn /> : isLoadingProfile ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
          ) : (
            <>
              {/* Plan Badge */}
              <div className="p-6 rounded-[24px] flex items-center justify-between"
                style={{ background: profile?.plan === 'pro' ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))', border: `1px solid ${profile?.plan === 'pro' ? 'color-mix(in srgb, var(--primary) 30%, transparent)' : 'var(--border-color)'}` }}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('settings.currentPlan')}</p>
                  <p className="text-2xl font-black dark:text-white mt-1 uppercase">{profile?.plan === 'pro' ? 'Pro' : 'Free'}</p>
                  {cancelledUntil && <p className="text-[10px] text-amber-500 font-bold mt-1">{t('settings.expiresOn', { date: cancelledUntil })}</p>}
                </div>
                {profile?.plan === 'pro'
                  ? <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center"><Zap className="w-5 h-5 text-white" strokeWidth={2} /></div>
                  : <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl flex items-center justify-center"><User className="w-5 h-5 text-slate-500" strokeWidth={1.75} /></div>
                }
              </div>

              {/* Nutzung */}
              {profile?.usage && profile.plan !== 'pro' && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>{t('settings.generationsToday')}</span>
                    <span className="dark:text-white">{profile.usage.used} / {profile.usage.limit ?? '∞'}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--border-color) 60%, var(--bg-main))' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, (profile.usage.used / (profile.usage.limit || 20)) * 100)}%`, background: profile.usage.used >= profile.usage.limit ? '#ef4444' : 'var(--primary)' }} />
                  </div>
                </div>
              )}

              {/* Upgrade CTA (Free) */}
              {profile?.plan !== 'pro' && (
                <div className="space-y-4">
                  {[t('settings.feat.unlimited'), t('settings.feat.allModules'), t('settings.feat.prioritySupport')].map(f => (
                    <div key={f} className="flex items-center gap-3">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2.5} />
                      <p className="text-[12px] font-bold dark:text-white">{f}</p>
                    </div>
                  ))}
                  <button onClick={async () => { setIsCheckingOut(true); try { await startCheckout(); } catch (e: any) { toast.error(e.message); setIsCheckingOut(false); } }}
                    disabled={isCheckingOut}
                    className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                    style={{ background: 'var(--primary)' }}>
                    {isCheckingOut ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('um.redirecting')}</> : <><Zap className="w-4 h-4" strokeWidth={2} /> {t('settings.upgradeCta')}</>}
                  </button>
                  <p className="text-center text-[10px] text-slate-400">{t('settings.cancelAnytime')}</p>
                </div>
              )}

              {/* Abo kündigen (Pro) */}
              {profile?.plan === 'pro' && !cancelledUntil && (
                <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 pt-2">{t('settings.manageSubscription')}</p>
                  <button onClick={handleCancelSubscription} disabled={isCancelling}
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all active:scale-95 disabled:opacity-50"
                    style={{ border: '1px solid var(--border-color)' }}>
                    {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {t('settings.cancelSubscription')}
                  </button>
                  <p className="text-[10px] text-slate-400">{t('settings.keepProUntilEnd')}</p>
                </div>
              )}

              {/* Zahlungshistorie */}
              <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 pt-2">{t('settings.paymentHistory')}</p>
                {isLoadingInvoices ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>
                ) : invoices.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">{t('settings.noPayments')}</p>
                ) : invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-2xl" style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))' }}>
                    <div>
                      <p className="text-[11px] font-black dark:text-white">{inv.date}</p>
                      <p className="text-[10px] text-slate-400">{inv.amount} {inv.currency}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-600'}`}>
                        {inv.status === 'paid' ? t('settings.paid') : inv.status}
                      </span>
                      {inv.pdf && (
                        <a href={inv.pdf} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-600 transition-colors">
                          <ExternalLink className="w-4 h-4" strokeWidth={1.75} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ))}

          {/* ── DESIGN ── */}
          {tab === 'design' && (
            <div className="space-y-8">

              {/* Tägliche Lern-Erinnerung (Web Push) */}
              {isPushSupported() && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('settings.notifications')}</p>
                  <button
                    onClick={handleTogglePush}
                    disabled={pushBusy}
                    className="w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all hover:opacity-90 disabled:opacity-50 text-left"
                    style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">{t('settings.dailyReminder')}</p>
                      <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                        {pushEnabled
                          ? t('settings.reminderActive')
                          : t('settings.reminderInactive')}
                      </p>
                    </div>
                    <div
                      className="w-11 h-6 rounded-full p-0.5 shrink-0 transition-all"
                      style={{ background: pushEnabled ? 'var(--primary)' : 'var(--border-color)' }}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${pushEnabled ? 'translate-x-5' : ''}`} />
                    </div>
                  </button>
                </div>
              )}

              {/* Erscheinungsbild */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('settings.appearance')}</p>
                <div className="flex p-1 rounded-2xl gap-1" style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))' }}>
                  <button onClick={() => isDark && onToggleTheme()}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${!isDark ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
                    <Sun className="w-4 h-4" strokeWidth={1.75} /> {t('layout.dayMode')}
                  </button>
                  <button onClick={() => !isDark && onToggleTheme()}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${isDark ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
                    <Moon className="w-4 h-4" strokeWidth={1.75} /> {t('layout.nightMode')}
                  </button>
                </div>
              </div>

              {/* Sprache */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('settings.language.title')}</p>
                <div className="flex p-1 rounded-2xl gap-1" style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))' }}>
                  {(['de', 'tr'] as Locale[]).map(l => (
                    <button
                      key={l}
                      onClick={() => changeLocale(l, user?.id)}
                      className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${locale === l ? '' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                      style={locale === l ? { background: 'var(--bg-sidebar)', color: 'var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : {}}
                    >
                      {l === 'de' ? '🇩🇪 ' + t('language.german') : '🇹🇷 ' + t('language.turkish')}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">{t('settings.language.hint')}</p>
              </div>

              {/* Schriftart */}
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('settings.font')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map(f => {
                    const isSelected = fontChoice === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => { setFontChoice(f.id); applyFont(f.id, user?.id); }}
                        className="p-4 rounded-2xl text-left transition-all active:scale-95 hover:scale-[1.02]"
                        style={{
                          background: isSelected
                            ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                            : 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))',
                          border: `1px solid ${isSelected ? 'color-mix(in srgb, var(--primary) 40%, transparent)' : 'var(--border-color)'}`,
                        }}
                      >
                        <p className="text-base font-semibold dark:text-white leading-tight" style={{ fontFamily: f.stack }}>{f.name}</p>
                        <p className="text-sm mt-1 text-slate-400" style={{ fontFamily: f.stack }}>Aa Bb 123</p>
                        <p className="text-[9px] font-black uppercase tracking-widest mt-2 text-slate-400">{t(f.labelKey)}</p>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 mt-2 text-[9px] font-black uppercase tracking-wide" style={{ color: 'var(--primary)' }}>
                            <Check className="w-3 h-3" strokeWidth={3} /> {t('settings.active')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Zeilenabstand */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('settings.lineSpacing')}</p>
                <div className="flex p-1 rounded-2xl gap-1" style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))' }}>
                  {SPACING_OPTIONS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setLineHeight(s.id); applyLineHeight(s.id, user?.id); }}
                      className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${lineHeight === s.id ? '' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                      style={lineHeight === s.id ? { background: 'var(--bg-sidebar)', color: 'var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : {}}
                    >
                      {t(s.labelKey)}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">
                  {lineHeight === '1.4' ? t('settings.spacing.compactHint') : lineHeight === '1.6' ? t('settings.spacing.normalHint') : t('settings.spacing.wideHint')}
                </p>
              </div>

              {/* Akzentfarbe */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('settings.accentColor')}</p>
                  <div className="w-6 h-6 rounded-lg shadow-inner border border-white/20" style={{ background: accentColor }} />
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {PRESETS.map(p => (
                    <button key={p.value} onClick={() => handleAccentColor(p.value)} title={p.name}
                      className="relative aspect-square rounded-2xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center shadow-md"
                      style={{ background: p.value }}>
                      {accentColor === p.value && <Check className="w-5 h-5 text-white drop-shadow-lg" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-4 cursor-pointer p-4 rounded-2xl transition-all hover:opacity-80"
                  style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}>
                  <input type="color" value={accentColor} onChange={e => handleAccentColor(e.target.value)} className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent p-0" />
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">{t('settings.customColor')}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{accentColor}</p>
                  </div>
                </label>
              </div>

            </div>
          )}

          {/* ── DATENSCHUTZ ── */}
          {tab === 'datenschutz' && (!user ? <NotLoggedIn /> : (
            <div className="space-y-6">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                <p className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 leading-relaxed">
                  {t('settings.gdprNotice')}
                </p>
              </div>

              {/* Daten exportieren */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('settings.exportData')}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('settings.exportDesc')}</p>
                <button onClick={handleExport} disabled={isExporting}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all"
                  style={{ background: 'var(--primary)' }}>
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" strokeWidth={1.75} />}
                  {t('settings.downloadData')}
                </button>
              </div>

              {/* Konto löschen */}
              <div className="space-y-4 pt-4" style={{ borderTop: '2px solid #ef4444' }}>
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-500" strokeWidth={2} />
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">{t('settings.deleteAccount')}</p>
                </div>
                <div className="p-4 bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-200 dark:border-rose-900/30 space-y-2">
                  <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400">{t('settings.deleteIrreversible')}</p>
                  <p className="text-[11px] text-rose-600 dark:text-rose-400">{t('settings.deleteDesc')}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {t('settings.typeConfirmPre')} <span className="text-rose-500 font-mono">LÖSCHEN</span> {t('settings.typeConfirmPost')}
                  </label>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder="LÖSCHEN"
                    className="w-full px-4 py-3 rounded-2xl text-sm font-mono dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-rose-500/50 transition-all"
                    style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid #ef4444' }}
                  />
                </div>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount || deleteConfirm !== 'LÖSCHEN'}
                  className="w-full py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white bg-rose-500 hover:bg-rose-600 transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {isDeletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" strokeWidth={2} />}
                  {t('settings.deleteAccountButton')}
                </button>
              </div>
            </div>
          ))}

          {/* ── API ── */}
          {tab === 'api' && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 leading-relaxed">
                  {t('settings.apiNotice')}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('settings.apiKeyLabel')}</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIza..."
                  className="w-full px-4 py-3.5 rounded-2xl text-sm font-mono dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}
                  onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()} />
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-500 hover:underline">
                  {t('settings.getFreeKey')}
                </a>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveApiKey}
                  className="flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95"
                  style={{ background: 'var(--primary)' }}>
                  {apiKeySaved ? <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" strokeWidth={2.5} /> {t('settings.saved')}</span> : t('common.save')}
                </button>
                {apiKey && (
                  <button onClick={() => { localStorage.removeItem('gemini_api_key'); setApiKey(''); }}
                    className="px-5 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-rose-500 transition-all active:scale-95"
                    style={{ border: '1px solid var(--border-color)' }}>
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
