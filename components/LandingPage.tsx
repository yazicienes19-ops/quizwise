
import React, { useEffect, useRef } from 'react';
import { Layers, RotateCw, HelpCircle, Brain, GraduationCap, Star, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';
import { BrandMark } from './BrandMark';

interface LandingPageProps {
  onAuthClick: (mode?: 'login' | 'register') => void;
  onLegalClick: (page: 'impressum' | 'datenschutz' | 'agb') => void;
}

const features: { icon: LucideIcon; titleKey: TKey; descKey: TKey }[] = [
  { icon: Layers, titleKey: 'landing.feature.cards.title', descKey: 'landing.feature.cards.desc' },
  { icon: RotateCw, titleKey: 'landing.feature.srs.title', descKey: 'landing.feature.srs.desc' },
  { icon: HelpCircle, titleKey: 'landing.feature.quiz.title', descKey: 'landing.feature.quiz.desc' },
  { icon: Brain, titleKey: 'landing.feature.feynman.title', descKey: 'landing.feature.feynman.desc' },
  { icon: GraduationCap, titleKey: 'landing.feature.exam.title', descKey: 'landing.feature.exam.desc' },
  { icon: Star, titleKey: 'landing.feature.streak.title', descKey: 'landing.feature.streak.desc' },
];

/** Kompakter DE/TR-Umschalter, auch vor dem Login sichtbar. */
export const LanguageToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { locale, changeLocale } = useTranslation();
  return (
    <div className={`inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden ${className ?? ''}`}>
      {(['de', 'tr', 'en'] as const).map(l => (
        <button
          key={l}
          onClick={() => changeLocale(l)}
          aria-label={l === 'de' ? 'Deutsch' : l === 'tr' ? 'Türkçe' : 'English'}
          className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors"
          style={locale === l
            ? { background: 'var(--primary)', color: 'var(--primary-text)' }
            : { color: 'var(--text-secondary, #94a3b8)' }}
        >
          {l === 'de' ? 'DE' : l === 'tr' ? 'TR' : 'EN'}
        </button>
      ))}
    </div>
  );
};

/** Scroll-Reveal: Kinder faden + slippen erst rein, sobald sie ins Viewport kommen. */
const Reveal: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { el.classList.add('in'); obs.disconnect(); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className ?? ''}`}>{children}</div>;
};

/** Dekorative "Redemption Arc"-Illustration (Tiefpunkt → Aufstieg), größere Variante
 *  derselben Formsprache wie BrandMark — `flip` spiegelt sie für den Aufstiegs-Akt. */
const ArcArt: React.FC<{ flip?: boolean }> = ({ flip = false }) => {
  const d = flip
    ? 'M 30 40 C 90 60, 140 140, 170 210 C 190 260, 240 260, 260 200 C 285 130, 330 40, 380 20'
    : 'M 20 210 C 80 190, 120 100, 150 40 C 165 10, 210 10, 220 50 C 235 110, 270 190, 340 220';
  const peak = flip ? { x: 380, y: 20 } : { x: 340, y: 220 };
  const start = flip ? { x: 30, y: 40 } : { x: 20, y: 210 };
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 16 : 6.7;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${peak.x + r * Math.cos(ang)},${peak.y + r * Math.sin(ang)}`);
  }
  return (
    <svg width={400} height={260} viewBox="0 0 400 260" fill="none" style={{ maxWidth: '100%', height: 'auto' }}>
      <path d={d} stroke="var(--primary)" strokeWidth={3} strokeDasharray={700} strokeDashoffset={700} strokeLinecap="round" fill="none" className="draw-arc" />
      <circle cx={start.x} cy={start.y} r={7} fill="none" stroke="var(--primary)" strokeWidth={2.5} opacity={0.6} />
      <polygon points={pts.join(' ')} fill="var(--primary)" />
    </svg>
  );
};

const serif = { fontFamily: "'Source Serif 4', serif" } as const;

export const LandingPage: React.FC<LandingPageProps> = ({ onAuthClick, onLegalClick }) => {
  const { t } = useTranslation();

  const freeItems: TKey[] = ['landing.pricing.free1', 'landing.pricing.free2', 'landing.pricing.free3', 'landing.pricing.free4', 'landing.pricing.free5'];
  const proItems: TKey[] = ['landing.pricing.pro1', 'landing.pricing.pro2', 'landing.pricing.pro3', 'landing.pricing.pro4', 'landing.pricing.pro5', 'landing.pricing.pro6', 'landing.pricing.pro7'];

  return (
    <div style={{ background: '#FBF9F4', color: '#1B2A4A' }}>

      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-xl border-b" style={{ background: 'rgba(251,249,244,0.82)', borderColor: 'rgba(27,42,74,0.08)' }}>
        <div className="max-w-6xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark size={26} strokeColor="#1B2A4A" peakColor="var(--primary)" />
            <span className="text-xl" style={{ ...serif, letterSpacing: '-0.01em' }}>
              <span style={{ fontWeight: 500 }}>Stude</span><span style={{ fontWeight: 700, color: 'var(--primary)' }}>Arc</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[13px] font-medium" style={{ color: '#4A4636' }}>
            <a href="#akt1" className="hover:opacity-70 transition-opacity">{t('landing.nav.act1')}</a>
            <a href="#akt2" className="hover:opacity-70 transition-opacity">{t('landing.nav.act2')}</a>
            <a href="#akt3" className="hover:opacity-70 transition-opacity">{t('landing.nav.act3')}</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageToggle className="hidden sm:inline-flex" />
            <button
              onClick={() => onAuthClick('login')}
              className="px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-colors hidden sm:block"
              style={{ color: '#5B5647' }}
            >
              {t('landing.nav.login')}
            </button>
            <button
              onClick={() => onAuthClick('register')}
              className="px-4 sm:px-5 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest text-white transition-all hover:scale-105 whitespace-nowrap"
              style={{ background: '#1B2A4A' }}
            >
              {t('landing.nav.startFree')}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 sm:px-8 pt-20 sm:pt-28 pb-20 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] mb-7" style={{ color: 'var(--primary)' }}>
          {t('landing.hero.badge')}
        </p>

        <h1 style={{ ...serif, fontSize: 'clamp(40px, 7vw, 84px)', lineHeight: 1.04, fontWeight: 600, letterSpacing: '-0.02em' }}>
          {t('landing.hero.title1')} <span style={{ fontWeight: 700, color: 'var(--primary)', fontStyle: 'italic' }}>{t('landing.hero.titleAccent')}</span><br />
          {t('landing.hero.title2')}
        </h1>

        <p className="text-lg sm:text-xl max-w-2xl mx-auto mt-8 mb-12 leading-relaxed" style={{ color: '#5B5647' }}>
          {t('landing.hero.subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => onAuthClick('register')}
            className="px-8 py-4 rounded-full text-[11px] font-black uppercase tracking-widest text-white shadow-xl hover:scale-105 transition-all"
            style={{ background: '#1B2A4A' }}
          >
            {t('landing.hero.ctaPrimary')}
          </button>
          <button
            onClick={() => onAuthClick('login')}
            className="px-8 py-4 rounded-full text-[11px] font-black uppercase tracking-widest transition-all hover:opacity-70"
            style={{ background: 'transparent', border: '1px solid rgba(27,42,74,0.2)', color: '#1B2A4A' }}
          >
            {t('landing.hero.ctaSecondary')}
          </button>
        </div>

        <p className="mt-7 text-[11px] font-black uppercase tracking-widest" style={{ color: '#8A8172' }}>
          {t('landing.hero.trust')}
        </p>
      </section>

      {/* Akt I — Tiefpunkt */}
      <section id="akt1" style={{ background: '#1B2A4A', color: '#FBF9F4', padding: '120px 24px' }} className="sm:px-14">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <p style={{ ...serif, fontSize: 15, fontWeight: 600, color: 'var(--primary)', marginBottom: 18 }}>{t('landing.act1.eyebrow')}</p>
            <h2 style={{ ...serif, fontSize: 'clamp(30px, 3.6vw, 46px)', fontWeight: 600, lineHeight: 1.12, marginBottom: 20 }}>
              {t('landing.act1.title')}
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: '#C9CFDD', maxWidth: 440 }}>
              {t('landing.act1.body')}
            </p>
          </Reveal>
          <Reveal className="flex justify-center">
            <ArcArt />
          </Reveal>
        </div>
      </section>

      {/* Akt II — Features */}
      <section id="akt2" className="max-w-6xl mx-auto px-6 sm:px-8 py-24 sm:py-32">
        <Reveal className="text-center mb-16">
          <p style={{ ...serif, fontSize: 15, fontWeight: 600, color: 'var(--primary)', marginBottom: 18 }}>{t('landing.act2.eyebrow')}</p>
          <h2 style={{ ...serif, fontSize: 'clamp(30px, 3.6vw, 46px)', fontWeight: 600, lineHeight: 1.12 }}>{t('landing.features.title')}</h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal key={f.titleKey} style={{ transitionDelay: `${i * 60}ms` } as React.CSSProperties}>
                <div
                  className="group p-8 h-full rounded-[6px] border border-[rgba(27,42,74,0.1)] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_rgba(27,42,74,0.12)] hover:border-[var(--primary)]"
                  style={{ background: '#FBF9F4' }}
                >
                  <div className="w-11 h-11 rounded-full border border-[rgba(27,42,74,0.15)] flex items-center justify-center mb-7 transition-all duration-300 group-hover:border-[var(--primary)] group-hover:bg-[var(--primary)]/10">
                    <Icon className="w-[18px] h-[18px] transition-transform duration-300 group-hover:scale-110" strokeWidth={1.75} style={{ color: 'var(--primary)' }} />
                  </div>
                  <h3 style={{ ...serif, fontSize: 20, fontWeight: 600, marginBottom: 12 }}>{t(f.titleKey)}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: '#5B5647' }}>{t(f.descKey)}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Akt III — Aufstieg */}
      <section id="akt3" style={{ background: '#EDE8DE', padding: '120px 24px' }} className="sm:px-14">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <Reveal className="flex justify-center order-2 lg:order-1">
            <ArcArt flip />
          </Reveal>
          <Reveal className="order-1 lg:order-2">
            <p style={{ ...serif, fontSize: 15, fontWeight: 600, color: 'var(--primary)', marginBottom: 18 }}>{t('landing.act3.eyebrow')}</p>
            <h2 style={{ ...serif, fontSize: 'clamp(30px, 3.6vw, 46px)', fontWeight: 600, lineHeight: 1.12, marginBottom: 20 }}>
              {t('landing.act3.title')}
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: '#4A4636', maxWidth: 440 }}>
              {t('landing.act3.body')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Preise */}
      <section className="max-w-5xl mx-auto px-6 sm:px-8 py-24 sm:py-32">
        <Reveal className="text-center mb-16">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] mb-3" style={{ color: '#8A8172' }}>{t('landing.pricing.eyebrow')}</p>
          <h2 style={{ ...serif, fontSize: 'clamp(30px, 3.6vw, 46px)', fontWeight: 600, lineHeight: 1.12 }}>{t('landing.pricing.title')}</h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">

          {/* Free */}
          <Reveal>
            <div className="p-8 rounded-[6px] border border-[rgba(27,42,74,0.15)] h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[var(--primary)]">
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#8A8172' }}>{t('landing.pricing.free')}</p>
              <p style={{ ...serif, fontSize: 44, fontWeight: 600 }} className="mb-1">{t('landing.pricing.freePrice')}</p>
              <p className="text-[11px] mb-8" style={{ color: '#8A8172' }}>{t('landing.pricing.freeSub')}</p>
              <ul className="space-y-3 mb-8">
                {freeItems.map(item => (
                  <li key={item} className="flex items-center gap-3 text-sm" style={{ color: '#4A4636' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="20 6 9 17 4 12" /></svg>
                    {t(item)}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onAuthClick('register')}
                className="w-full py-3.5 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all hover:opacity-70"
                style={{ borderColor: 'rgba(27,42,74,0.2)', color: '#1B2A4A' }}
              >
                {t('landing.pricing.freeCta')}
              </button>
            </div>
          </Reveal>

          {/* Pro */}
          <Reveal style={{ transitionDelay: '90ms' } as React.CSSProperties}>
            <div className="p-8 rounded-[6px] border-2 relative h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl" style={{ borderColor: 'var(--primary)', background: '#1B2A4A', color: '#FBF9F4' }}>
              <div className="absolute top-6 right-6 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest" style={{ background: 'var(--primary)', color: '#1B2A4A' }}>
                {t('landing.pricing.recommended')}
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--primary)' }}>Pro</p>
              <div className="flex items-end gap-3 mb-1">
                <p style={{ ...serif, fontSize: 44, fontWeight: 600 }}>9,99 €</p>
                <p className="text-xl font-black mb-1.5 line-through" style={{ color: '#5B6B8C' }}>14,99 €</p>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>{t('landing.pricing.proSub')}</p>
              <p className="text-[11px] mb-8" style={{ color: '#C9CFDD' }}>{t('landing.pricing.proPeriod')}</p>
              <ul className="space-y-3 mb-8">
                {proItems.map(item => (
                  <li key={item} className="flex items-center gap-3 text-sm" style={{ color: '#E6E9F2' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="20 6 9 17 4 12" /></svg>
                    {t(item)}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onAuthClick('register')}
                className="w-full py-3.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
                style={{ background: 'var(--primary)', color: '#1B2A4A' }}
              >
                {t('landing.pricing.proCta')}
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Finale / CTA */}
      <section className="px-6 sm:px-8 py-28 sm:py-36 text-center">
        <Reveal className="max-w-2xl mx-auto">
          <p style={{ ...serif, fontSize: 15, fontWeight: 600, color: 'var(--primary)', marginBottom: 18 }}>{t('landing.final.eyebrow')}</p>
          <h2 style={{ ...serif, fontSize: 'clamp(32px, 4.4vw, 56px)', fontWeight: 600, lineHeight: 1.1, marginBottom: 22 }}>
            {t('landing.final.titlePre')} <span style={{ fontStyle: 'italic', color: 'var(--primary)' }}>{t('landing.final.titleAccent')}</span>
          </h2>
          <p className="text-lg mb-10" style={{ color: '#5B5647' }}>{t('landing.cta.subtitle')}</p>
          <button
            onClick={() => onAuthClick('register')}
            className="px-10 py-5 rounded-full text-[11px] font-black uppercase tracking-widest text-white shadow-xl hover:scale-105 transition-all"
            style={{ background: '#1B2A4A' }}
          >
            {t('landing.cta.button')}
          </button>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t py-9" style={{ borderColor: 'rgba(27,42,74,0.1)' }}>
        <div className="max-w-6xl mx-auto px-6 sm:px-8 flex flex-col sm:flex-row justify-between items-center gap-5">
          <div className="flex items-center gap-2.5">
            <BrandMark size={20} strokeColor="#1B2A4A" peakColor="var(--primary)" />
            <span style={{ ...serif, fontSize: 15 }}>
              <span style={{ fontWeight: 500 }}>Stude</span><span style={{ fontWeight: 700, color: 'var(--primary)' }}>Arc</span>
            </span>
          </div>
          <div className="flex gap-6">
            {([
              { labelKey: 'landing.footer.privacy', page: 'datenschutz' },
              { labelKey: 'landing.footer.imprint', page: 'impressum' },
              { labelKey: 'landing.footer.terms', page: 'agb' },
            ] as { labelKey: TKey; page: 'impressum' | 'datenschutz' | 'agb' }[]).map(({ labelKey, page }) => (
              <button
                key={labelKey}
                onClick={() => onLegalClick(page)}
                className="text-[11px] font-bold uppercase tracking-widest transition-colors hover:opacity-70"
                style={{ color: '#8A8172' }}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <p className="text-[11px] font-black tracking-widest uppercase" style={{ color: '#8A8172' }}>
            © {new Date().getFullYear()} StudeArc
          </p>
        </div>
      </footer>
    </div>
  );
};
