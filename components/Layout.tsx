
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

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, user, onLoginClick, onLogout, onUpgradeClick, onSettingsClick }) => {
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

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const mainNavItems: { id: ActiveTab; label: string; icon: LucideIcon }[] = [
    { id: ActiveTab.DASHBOARD, label: 'Home', icon: Home },
    { id: ActiveTab.LIBRARY, label: 'Bib', icon: BookOpen },
    { id: ActiveTab.QUIZ, label: 'Quiz', icon: HelpCircle },
    { id: ActiveTab.PLANNER, label: 'Plan', icon: Calendar },
  ];

  const secondaryNavItems: { id: ActiveTab; label: string; icon: LucideIcon }[] = [
    { id: ActiveTab.RECALL, label: 'Recall Studio', icon: Brain },
    { id: ActiveTab.EXAM, label: 'Klausur-Modus', icon: GraduationCap },
    { id: ActiveTab.CARDS, label: 'Karteikarten', icon: Layers },
    { id: ActiveTab.EXPLAINER, label: 'KI-Erklärer', icon: Lightbulb },
    { id: ActiveTab.RADAR, label: 'Lern-Analyse', icon: BarChart2 },
    { id: ActiveTab.SEARCH, label: 'Recherche', icon: Search },
    { id: ActiveTab.PAPER, label: 'Hausarbeit', icon: FileText },
  ];

  const handleMobileTabChange = (tab: ActiveTab) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex transition-colors duration-300 overflow-hidden bg-transparent">
      {/* Desktop Sidebar */}
      <aside className="w-72 hidden lg:flex flex-col h-screen sticky top-0 shadow-[4px_0_24px_rgba(0,0,0,0.05)] z-20" style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-color)' }}>
        <div className="p-10 flex flex-col h-full">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black shadow-[0_4px_12px_rgba(79,70,229,0.4)] transform rotate-3 shrink-0">QW</div>
            <span className="text-xl font-black tracking-tighter text-slate-900 dark:text-white uppercase truncate">QuizWise</span>
          </div>
          
          <nav className="space-y-1.5 overflow-y-auto pr-2 scrollbar-hide">
            {[...mainNavItems, ...secondaryNavItems].map(item => (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-4 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                  activeTab === item.id
                    ? 'bg-indigo-600 text-white scale-[1.02]'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:translate-x-1'
                }`}
                style={activeTab === item.id ? { boxShadow: '0 8px 16px color-mix(in srgb, var(--primary) 35%, transparent)' } : {}}
              >
                <item.icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* User / Login */}
          <div className="mt-6 space-y-2">
            {user ? (
              <>
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))' }}>
                  <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white text-[10px] font-black shrink-0">
                    {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                  </div>
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
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95"
                style={{ background: 'var(--primary)' }}
              >
                <LogIn className="w-4 h-4" strokeWidth={1.75} />
                Einloggen / Registrieren
              </button>
            )}
          </div>

          <div className="mt-4 pt-6 space-y-2" style={{ borderTop: '1px solid var(--border-color)' }}>
            <button
              onClick={onSettingsClick}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all active:scale-95 group"
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
      
      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 backdrop-blur-xl z-[60] flex justify-around items-center pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl" style={{ background: 'color-mix(in srgb, var(--bg-sidebar) 95%, transparent)', borderTop: '1px solid var(--border-color)' }}>
        {mainNavItems.map(item => (
          <button
            key={item.id}
            onClick={() => handleMobileTabChange(item.id)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-90 ${
              activeTab === item.id ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <item.icon className="w-6 h-6" strokeWidth={1.75} />
            <span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
        
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-90 ${
            isMobileMenuOpen ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <span className="text-2xl flex items-center justify-center">
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" strokeWidth={1.75} />
            ) : (
              <Menu className="w-6 h-6" strokeWidth={1.75} />
            )}
          </span>
          <span className="text-[8px] font-black uppercase tracking-widest">Mehr</span>
        </button>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[55] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="absolute bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] left-4 right-4 rounded-[32px] p-6 shadow-3d-deep animate-in slide-in-from-bottom-8 duration-500 overflow-y-auto max-h-[70vh]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <div className="grid grid-cols-2 gap-4">
              {secondaryNavItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleMobileTabChange(item.id)}
                  className={`flex items-center gap-3 p-4 rounded-2xl border transition-all active:scale-95 ${
                    activeTab === item.id
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <item.icon className="w-6 h-6 shrink-0" strokeWidth={1.75} />
                  <span className="text-[9px] font-black uppercase tracking-wider text-left">{item.label}</span>
                </button>
              ))}
            </div>

            {/* API Key button in mobile menu */}
            <button
              onClick={() => { setIsMobileMenuOpen(false); setShowApiSettings(true); }}
              className="mt-4 w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all active:scale-95"
              style={{ borderColor: apiKeySet ? 'var(--border-color)' : '#f59e0b', background: apiKeySet ? 'var(--bg-main)' : 'rgba(245,158,11,0.08)', color: apiKeySet ? 'var(--text-main)' : '#f59e0b' }}
            >
              <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                <KeyRound className="w-4 h-4" strokeWidth={1.75} />
                {apiKeySet ? 'API-Schlüssel' : 'API-Key fehlt!'}
              </span>
              <span className={`w-2 h-2 rounded-full ${apiKeySet ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
            </button>

            {/* Theme toggle in mobile menu */}
            <button
              onClick={toggleTheme}
              className="mt-2 w-full flex items-center justify-between px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all active:scale-95"
            >
              <span className="text-[10px] font-black uppercase tracking-wider">
                {isDark ? 'Tagmodus' : 'Nachtmodus'}
              </span>
              {isDark
                ? <Sun className="w-5 h-5 text-indigo-400" strokeWidth={1.75} />
                : <Moon className="w-5 h-5 text-slate-500" strokeWidth={1.75} />
              }
            </button>
            <ColorPicker />
          </div>
        </div>
      )}
      
      <main className="flex-grow p-4 sm:p-8 lg:p-16 overflow-y-auto w-full relative pb-32 lg:pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
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
