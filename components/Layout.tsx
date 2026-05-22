
import React, { useState, useEffect } from 'react';
import { ActiveTab } from '../types';
import {
  Home, BookOpen, HelpCircle, Calendar, Brain, GraduationCap,
  Layers, Lightbulb, BarChart2, Search, FileText, Moon, Sun,
  X, Menu, KeyRound, LogIn, LogOut, Zap, Settings, type LucideIcon
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { ColorPicker } from './ColorPicker';
import { ApiKeySettings } from './ApiKeySettings';
import { LegalModal } from './LegalModal';
import { hasApiKey } from '../services/geminiService';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  user?: User | null;
  onLoginClick?: () => void;
  onLogout?: () => void;
  onUpgradeClick?: () => void;
  onSettingsClick?: () => void;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

export const Layout: React.FC<LayoutProps> = ({
  children, activeTab, onTabChange, user,
  onLoginClick, onLogout, onUpgradeClick, onSettingsClick
}) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return document.documentElement.classList.contains('dark');
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(hasApiKey);
  const [legalPage, setLegalPage] = useState<'impressum' | 'datenschutz' | 'agb' | null>(null);

  useEffect(() => {
    const check = () => setApiKeySet(hasApiKey());
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(d => !d);

  const mainNavItems: NavItem[] = [
    { id: ActiveTab.DASHBOARD, label: 'Home',  shortLabel: 'Home', icon: Home },
    { id: ActiveTab.LIBRARY,   label: 'Bib',   shortLabel: 'Bib',  icon: BookOpen },
    { id: ActiveTab.QUIZ,      label: 'Quiz',  shortLabel: 'Quiz', icon: HelpCircle },
    { id: ActiveTab.PLANNER,   label: 'Plan',  shortLabel: 'Plan', icon: Calendar },
  ];

  const secondaryNavItems: NavItem[] = [
    { id: ActiveTab.RECALL,    label: 'Recall Studio',  shortLabel: 'Recall',   icon: Brain },
    { id: ActiveTab.EXAM,      label: 'Klausur-Modus',  shortLabel: 'Klausur',  icon: GraduationCap },
    { id: ActiveTab.CARDS,     label: 'Karteikarten',   shortLabel: 'Karten',   icon: Layers },
    { id: ActiveTab.EXPLAINER, label: 'KI-Erklärer',    shortLabel: 'Erklärer', icon: Lightbulb },
    { id: ActiveTab.RADAR,     label: 'Lern-Analyse',   shortLabel: 'Analyse',  icon: BarChart2 },
    { id: ActiveTab.SEARCH,    label: 'Recherche',      shortLabel: 'Suche',    icon: Search },
    { id: ActiveTab.PAPER,     label: 'Hausarbeit',     shortLabel: 'Arbeit',   icon: FileText },
  ];

  const allNavItems = [...mainNavItems, ...secondaryNavItems];
  const currentPageLabel = allNavItems.find(i => i.id === activeTab)?.label ?? '';
  const userInitial = (user?.user_metadata?.full_name || user?.email || 'U')[0].toUpperCase();

  const handleMobileTabChange = (tab: ActiveTab) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex transition-colors duration-300 overflow-hidden bg-transparent">

      {/* ── DESKTOP SIDEBAR (≥ 1024px) ── */}
      <aside
        className="w-72 hidden lg:flex flex-col h-screen sticky top-0 shadow-[4px_0_24px_rgba(0,0,0,0.05)] z-20"
        style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-color)' }}
      >
        <div className="p-10 flex flex-col h-full">
          <div className="flex items-center gap-4 mb-12">
            <div
              className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black transform rotate-3 shrink-0"
              style={{ color: 'var(--primary-text)', boxShadow: '0 4px 12px color-mix(in srgb, var(--primary) 40%, transparent)' }}
            >QW</div>
            <span className="text-xl font-black tracking-tighter text-slate-900 dark:text-white uppercase truncate">QuizWise</span>
          </div>

          <nav className="space-y-1.5 overflow-y-auto pr-2 scrollbar-hide flex-1">
            {allNavItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center gap-4 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                    isActive
                      ? 'bg-indigo-600 scale-[1.02]'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:translate-x-1'
                  }`}
                  style={isActive ? { boxShadow: '0 8px 16px color-mix(in srgb, var(--primary) 35%, transparent)', color: 'var(--primary-text)', background: 'var(--primary)' } : {}}
                >
                  <item.icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-6 space-y-2">
            {user ? (
              <>
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))' }}
                >
                  <div
                    className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0"
                    style={{ color: 'var(--primary-text)', background: 'var(--primary)' }}
                  >{userInitial}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black dark:text-white truncate">{user.user_metadata?.full_name || 'Nutzer'}</p>
                    <p className="text-[9px] text-slate-400 truncate">{user.email}</p>
                  </div>
                  <button onClick={onLogout} className="text-slate-400 hover:text-rose-500 transition-colors shrink-0">
                    <LogOut className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
                <button
                  onClick={onUpgradeClick}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95"
                  style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
                >
                  <Zap className="w-3.5 h-3.5" strokeWidth={2} />
                  Upgrade zu Pro
                </button>
              </>
            ) : (
              <button
                onClick={onLoginClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                <LogIn className="w-4 h-4" strokeWidth={1.75} />
                Einloggen / Registrieren
              </button>
            )}
          </div>

          <div className="mt-4 pt-6 space-y-2" style={{ borderTop: '1px solid var(--border-color)' }}>
            <button
              onClick={onSettingsClick}
              className="w-full flex items-center px-4 py-3 rounded-xl text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all active:scale-95 group"
              style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))' }}
            >
              <span className="group-hover:translate-x-1 transition-transform flex items-center gap-2">
                <Settings className="w-4 h-4" strokeWidth={1.75} />
                Einstellungen
              </span>
            </button>
            <div className="flex justify-center gap-3 pt-2">
              {(['impressum', 'datenschutz', 'agb'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setLegalPage(p)}
                  className="text-[8px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {p === 'impressum' ? 'Impressum' : p === 'datenschutz' ? 'Datenschutz' : 'AGB'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── TABLET SIDEBAR (768px – 1023px) ── */}
      <aside
        className="hidden md:flex lg:hidden flex-col w-[72px] h-screen sticky top-0 z-20"
        style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-color)' }}
      >
        {/* Scrollable top: logo + all nav items */}
        <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col items-center gap-1 pt-4 pb-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] mb-5 shrink-0 transform rotate-3"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)', boxShadow: '0 4px 12px color-mix(in srgb, var(--primary) 40%, transparent)' }}
          >QW</div>

          {allNavItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                title={item.label}
                className={`w-12 h-12 flex flex-col items-center justify-center gap-[3px] rounded-xl transition-all duration-200 active:scale-90 shrink-0 ${
                  isActive ? '' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                style={isActive ? { background: 'var(--primary)', color: 'var(--primary-text)' } : {}}
              >
                <item.icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                <span className="text-[7px] font-black uppercase tracking-wide leading-none">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Fixed bottom: settings + user */}
        <div
          className="shrink-0 flex flex-col items-center gap-2 py-3"
          style={{ borderTop: '1px solid var(--border-color)' }}
        >
          <button
            onClick={onSettingsClick}
            title="Einstellungen"
            className="w-12 h-12 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
          >
            <Settings className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
          {user ? (
            <button
              title={`${user.email} – Abmelden`}
              onClick={onLogout}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black transition-all hover:scale-105 active:scale-90"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >{userInitial}</button>
          ) : (
            <button
              onClick={onLoginClick}
              title="Einloggen"
              className="w-12 h-12 flex items-center justify-center rounded-xl transition-all active:scale-95"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              <LogIn className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </aside>

      {/* ── MOBILE TOPBAR (< 768px) ── */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between px-4 backdrop-blur-xl"
        style={{ background: 'color-mix(in srgb, var(--bg-sidebar) 95%, transparent)', borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-[9px] transform rotate-3 shrink-0"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >QW</div>
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-900 dark:text-white">QuizWise</span>
        </div>

        <span className="absolute left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-widest text-slate-400 pointer-events-none max-w-[110px] truncate">
          {currentPageLabel}
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onSettingsClick}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-90"
          >
            <Settings className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
          {user ? (
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black transition-all active:scale-90"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >{userInitial}</button>
          ) : (
            <button
              onClick={onLoginClick}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              <LogIn className="w-[14px] h-[14px]" strokeWidth={1.75} />
              Login
            </button>
          )}
        </div>
      </header>

      {/* ── MOBILE BOTTOM NAV (< 768px) ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-[60] flex justify-around items-center pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl shadow-2xl"
        style={{ background: 'color-mix(in srgb, var(--bg-sidebar) 95%, transparent)', borderTop: '1px solid var(--border-color)' }}
      >
        {mainNavItems.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleMobileTabChange(item.id)}
              className="flex flex-col items-center gap-1 min-w-[3rem] px-2 py-1 rounded-xl transition-all active:scale-90"
              style={isActive ? { color: 'var(--primary)' } : { color: 'rgb(148 163 184)' }}
            >
              <item.icon className="w-6 h-6" strokeWidth={1.75} />
              <span className="text-[8px] font-black uppercase tracking-widest">{item.shortLabel}</span>
            </button>
          );
        })}
        <button
          onClick={() => setIsMobileMenuOpen(v => !v)}
          className="flex flex-col items-center gap-1 min-w-[3rem] px-2 py-1 rounded-xl transition-all active:scale-90"
          style={isMobileMenuOpen ? { color: 'var(--primary)' } : { color: 'rgb(148 163 184)' }}
        >
          {isMobileMenuOpen
            ? <X className="w-6 h-6" strokeWidth={1.75} />
            : <Menu className="w-6 h-6" strokeWidth={1.75} />}
          <span className="text-[8px] font-black uppercase tracking-widest">Mehr</span>
        </button>
      </nav>

      {/* ── MOBILE "MEHR" BOTTOM SHEET (< 768px) ── */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="absolute bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] inset-x-0 rounded-t-[28px] shadow-2xl"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="pt-3 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            <div className="overflow-y-auto max-h-[68vh] px-5 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] space-y-3">
              {/* Secondary nav grid */}
              <div className="grid grid-cols-2 gap-3">
                {secondaryNavItems.map(item => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleMobileTabChange(item.id)}
                      className="flex items-center gap-3 p-4 rounded-2xl border transition-all active:scale-95 text-left"
                      style={
                        isActive
                          ? { background: 'var(--primary)', color: 'var(--primary-text)', borderColor: 'var(--primary)' }
                          : { background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))', borderColor: 'var(--border-color)' }
                      }
                    >
                      <item.icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
                      <span className="text-[9px] font-black uppercase tracking-wider leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="h-px" style={{ background: 'var(--border-color)' }} />

              {/* API Key */}
              <button
                onClick={() => { setIsMobileMenuOpen(false); setShowApiSettings(true); }}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all active:scale-95"
                style={{
                  borderColor: apiKeySet ? 'var(--border-color)' : '#f59e0b',
                  background: apiKeySet ? 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))' : 'rgba(245,158,11,0.08)',
                  color: apiKeySet ? 'inherit' : '#f59e0b',
                }}
              >
                <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                  <KeyRound className="w-4 h-4" strokeWidth={1.75} />
                  {apiKeySet ? 'API-Schlüssel' : 'API-Key fehlt!'}
                </span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${apiKeySet ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
              </button>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all active:scale-95"
                style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))', borderColor: 'var(--border-color)' }}
              >
                <span className="text-[10px] font-black uppercase tracking-wider">
                  {isDark ? 'Tagmodus' : 'Nachtmodus'}
                </span>
                {isDark ? <Sun className="w-5 h-5" strokeWidth={1.75} /> : <Moon className="w-5 h-5" strokeWidth={1.75} />}
              </button>

              <ColorPicker />

              {/* Login / Logout */}
              {user ? (
                <button
                  onClick={() => { onLogout?.(); setIsMobileMenuOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-rose-500 transition-all active:scale-95"
                  style={{ background: 'color-mix(in srgb, #f43f5e 8%, var(--bg-sidebar))', border: '1px solid color-mix(in srgb, #f43f5e 20%, transparent)' }}
                >
                  <LogOut className="w-4 h-4" strokeWidth={1.75} />
                  Abmelden
                </button>
              ) : (
                <button
                  onClick={() => { onLoginClick?.(); setIsMobileMenuOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                >
                  <LogIn className="w-4 h-4" strokeWidth={1.75} />
                  Einloggen / Registrieren
                </button>
              )}

              {/* Legal */}
              <div className="flex justify-center gap-4 pt-1">
                {(['impressum', 'datenschutz', 'agb'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => { setIsMobileMenuOpen(false); setLegalPage(p); }}
                    className="text-[8px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {p === 'impressum' ? 'Impressum' : p === 'datenschutz' ? 'Datenschutz' : 'AGB'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <main className="flex-grow overflow-y-auto w-full relative pt-16 pb-24 px-4 sm:px-6 md:pt-8 md:pb-8 md:px-8 lg:pt-16 lg:pb-16 lg:px-16">
        <div className="max-w-6xl mx-auto relative z-10">{children}</div>
      </main>

      {showApiSettings && (
        <ApiKeySettings onClose={() => { setShowApiSettings(false); setApiKeySet(hasApiKey()); }} />
      )}
      {legalPage && (
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />
      )}
    </div>
  );
};
