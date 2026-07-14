
import React, { useState } from 'react';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';

interface LandingPageProps {
  onAuthClick: (mode?: 'login' | 'register') => void;
}

const features: { icon: string; titleKey: TKey; descKey: TKey; color: string }[] = [
  { icon: '🤖', titleKey: 'landing.feature.cards.title', descKey: 'landing.feature.cards.desc', color: 'indigo' },
  { icon: '🔁', titleKey: 'landing.feature.srs.title', descKey: 'landing.feature.srs.desc', color: 'emerald' },
  { icon: '📝', titleKey: 'landing.feature.quiz.title', descKey: 'landing.feature.quiz.desc', color: 'amber' },
  { icon: '🧠', titleKey: 'landing.feature.feynman.title', descKey: 'landing.feature.feynman.desc', color: 'rose' },
  { icon: '📊', titleKey: 'landing.feature.exam.title', descKey: 'landing.feature.exam.desc', color: 'blue' },
  { icon: '⚡', titleKey: 'landing.feature.streak.title', descKey: 'landing.feature.streak.desc', color: 'violet' },
];

const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-200 dark:ring-indigo-800' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-200 dark:ring-emerald-800' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-200 dark:ring-amber-800' },
  rose: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-200 dark:ring-rose-800' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-200 dark:ring-blue-800' },
  violet: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-200 dark:ring-violet-800' },
};

/** Kompakter DE/TR-Umschalter, auch vor dem Login sichtbar. */
export const LanguageToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { locale, changeLocale } = useTranslation();
  return (
    <div className={`inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden ${className ?? ''}`}>
      {(['de', 'tr'] as const).map(l => (
        <button
          key={l}
          onClick={() => changeLocale(l)}
          aria-label={l === 'de' ? 'Deutsch' : 'Türkçe'}
          className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors"
          style={locale === l
            ? { background: 'var(--primary)', color: 'var(--primary-text)' }
            : { color: 'var(--text-secondary, #94a3b8)' }}
        >
          {l === 'de' ? 'DE' : 'TR'}
        </button>
      ))}
    </div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({ onAuthClick }) => {
  const { t } = useTranslation();
  const [darkMode] = useState(() => document.documentElement.classList.contains('dark'));

  const freeItems: TKey[] = ['landing.pricing.free1', 'landing.pricing.free2', 'landing.pricing.free3', 'landing.pricing.free4', 'landing.pricing.free5'];
  const proItems: TKey[] = ['landing.pricing.pro1', 'landing.pricing.pro2', 'landing.pricing.pro3', 'landing.pricing.pro4', 'landing.pricing.pro5', 'landing.pricing.pro6', 'landing.pricing.pro7'];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white">

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight" style={{ color: 'var(--primary)' }}>Quiz</span>
            <span className="text-xl font-black tracking-tight dark:text-white">Wise</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <button
              onClick={() => onAuthClick('login')}
              className="px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              {t('landing.nav.login')}
            </button>
            <button
              onClick={() => onAuthClick('register')}
              className="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-lg hover:scale-105 transition-all"
              style={{ background: 'var(--primary)' }}
            >
              {t('landing.nav.startFree')}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 mb-8">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">{t('landing.hero.badge')}</span>
        </div>

        <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9] mb-6">
          {t('landing.hero.title1')} <span style={{ color: 'var(--primary)' }}>{t('landing.hero.titleAccent')}</span><br />
          {t('landing.hero.title2')}
        </h1>

        <p className="text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
          {t('landing.hero.subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => onAuthClick('register')}
            className="px-8 py-4 rounded-2xl text-[13px] font-black uppercase tracking-widest text-white shadow-2xl hover:scale-105 active:scale-95 transition-all"
            style={{ background: 'var(--primary)' }}
          >
            {t('landing.hero.ctaPrimary')}
          </button>
          <button
            onClick={() => onAuthClick('login')}
            className="px-8 py-4 rounded-2xl text-[13px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            {t('landing.hero.ctaSecondary')}
          </button>
        </div>

        <p className="mt-6 text-[11px] text-slate-400 uppercase tracking-widest">
          {t('landing.hero.trust')}
        </p>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-slate-100 dark:border-slate-800">
        <div className="text-center mb-14">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-3">{t('landing.features.eyebrow')}</p>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter">{t('landing.features.title')}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => {
            const cls = colorMap[f.color];
            return (
              <div
                key={f.titleKey}
                className={`p-6 rounded-[28px] border-2 bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group`}
              >
                <div className={`w-12 h-12 rounded-2xl ${cls.bg} flex items-center justify-center text-2xl mb-4 ring-1 ${cls.ring}`}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-black mb-2 dark:text-white">{t(f.titleKey)}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{t(f.descKey)}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-slate-100 dark:border-slate-800">
        <div className="text-center mb-14">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-3">{t('landing.pricing.eyebrow')}</p>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter">{t('landing.pricing.title')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">

          {/* Free */}
          <div className="p-8 rounded-[28px] border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('landing.pricing.free')}</p>
            <p className="text-5xl font-black mb-1">{t('landing.pricing.freePrice')}</p>
            <p className="text-[11px] text-slate-400 mb-8">{t('landing.pricing.freeSub')}</p>
            <ul className="space-y-3 mb-8">
              {freeItems.map(item => (
                <li key={item} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                  {t(item)}
                </li>
              ))}
            </ul>
            <button
              onClick={() => onAuthClick('register')}
              className="w-full py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-all"
            >
              {t('landing.pricing.freeCta')}
            </button>
          </div>

          {/* Pro */}
          <div className="p-8 rounded-[28px] border-2 border-indigo-500 dark:border-indigo-400 bg-white dark:bg-slate-900 relative">
            <div className="absolute top-6 right-6 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white" style={{ background: 'var(--primary)' }}>
              {t('landing.pricing.recommended')}
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-2">Pro</p>
            <div className="flex items-end gap-3 mb-1">
              <p className="text-5xl font-black">9,99 €</p>
              <p className="text-xl font-black text-slate-300 dark:text-slate-600 line-through mb-1.5">14,99 €</p>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>{t('landing.pricing.proSub')}</p>
            <p className="text-[11px] text-slate-400 mb-8">{t('landing.pricing.proPeriod')}</p>
            <ul className="space-y-3 mb-8">
              {proItems.map(item => (
                <li key={item} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                  {t(item)}
                </li>
              ))}
            </ul>
            <button
              onClick={() => onAuthClick('register')}
              className="w-full py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white shadow-lg hover:scale-[1.02] transition-all"
              style={{ background: 'var(--primary)' }}
            >
              {t('landing.pricing.proCta')}
            </button>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-slate-100 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter mb-6">
            {t('landing.cta.title')}
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 mb-10">
            {t('landing.cta.subtitle')}
          </p>
          <button
            onClick={() => onAuthClick('register')}
            className="px-10 py-5 rounded-2xl text-[13px] font-black uppercase tracking-widest text-white shadow-2xl hover:scale-105 active:scale-95 transition-all"
            style={{ background: 'var(--primary)' }}
          >
            {t('landing.cta.button')}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 dark:border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[11px] font-black tracking-widest text-slate-400 uppercase">
            © {new Date().getFullYear()} QuizWise
          </p>
          <div className="flex gap-6">
            {(['landing.footer.privacy', 'landing.footer.imprint', 'landing.footer.terms'] as TKey[]).map(l => (
              <button key={l} className="text-[11px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors">
                {t(l)}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};
