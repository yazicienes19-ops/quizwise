
import React, { useState, useEffect } from 'react';
import { ActiveTab } from '../types';
import {
  Home, BookOpen, HelpCircle, Calendar, Brain, GraduationCap,
  Layers, Lightbulb, BarChart2, Search, FileText, Moon, Sun,
  X, Menu, KeyRound, LogIn, LogOut, Zap, Settings, Bell, type LucideIcon
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

export const Layout: React.FC<LayoutProps> = ({
  children, activeTab, onTabChange, user,
  onLoginClick, onLogout, onUpgradeClick, onSettingsClick,
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

  const studioItems: { id: ActiveTab; label: string; icon: LucideIcon }[] = [
    { id: ActiveTab.DASHBOARD, label: 'Dashboard',  icon: Home },
    { id: ActiveTab.LIBRARY,   label: 'Bibliothek', icon: BookOpen },
    { id: ActiveTab.QUIZ,      label: 'Quiz',        icon: HelpCircle },
    { id: ActiveTab.PLANNER,   label: 'Lernplaner',  icon: Calendar },
  ];

  const toolItems: { id: ActiveTab; label: string; icon: LucideIcon }[] = [
    { id: ActiveTab.RECALL,    label: 'Recall Studio',  icon: Brain },
    { id: ActiveTab.EXAM,      label: 'Klausur-Modus',  icon: GraduationCap },
    { id: ActiveTab.CARDS,     label: 'Karteikarten',   icon: Layers },
    { id: ActiveTab.EXPLAINER, label: 'KI-Erklärer',    icon: Lightbulb },
    { id: ActiveTab.RADAR,     label: 'Lern-Analyse',   icon: BarChart2 },
    { id: ActiveTab.SEARCH,    label: 'Recherche',      icon: Search },
    { id: ActiveTab.PAPER,     label: 'Hausarbeit',     icon: FileText },
  ];

  const navItemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 10px', borderRadius: 6, fontSize: 14, width: '100%',
    fontFamily: 'var(--font-sans)', textAlign: 'left', cursor: 'pointer',
    background: active ? 'color-mix(in srgb, var(--ink) 8%, transparent)' : 'transparent',
    color: active ? 'var(--ink)' : 'var(--ink2)',
    fontWeight: active ? 500 : 400,
    border: 'none', whiteSpace: 'nowrap',
    transition: 'background 0.12s, color 0.12s',
  });

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 10, letterSpacing: '0.18em', color: 'var(--mute)',
    textTransform: 'uppercase', padding: '12px 8px 4px',
    fontFamily: 'var(--font-sans)',
  };

  const handleMobileTabChange = (tab: ActiveTab) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

  const legalLabels = { impressum: 'Impressum', datenschutz: 'Datenschutz', agb: 'AGB' } as const;

  return (
    <div className="min-h-screen flex transition-colors duration-300 overflow-hidden bg-transparent" style={{ position: 'relative' }}>

      {/* ── Rote Randlinie (Notizbuch-Margin) — nur Desktop ── */}
      <div className="hidden lg:block" style={{
        position: 'fixed', top: 0, bottom: 0, left: 289,
        width: 1.5, background: 'rgba(178,52,52,0.5)',
        pointerEvents: 'none', zIndex: 30,
      }} />
      <div className="hidden lg:block" style={{
        position: 'fixed', top: 0, bottom: 0, left: 292,
        width: 0.5, background: 'rgba(178,52,52,0.25)',
        pointerEvents: 'none', zIndex: 30,
      }} />

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex flex-col h-screen sticky top-0 z-20" style={{
        width: 240, padding: '28px 0', flexShrink: 0,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-color)',
      }}>

        {/* Wordmark */}
        <div style={{ padding: '0 22px 24px' }}>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500,
            letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.1,
          }}>
            QuizWise
          </div>
          <div style={{
            fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--mute)',
            letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 4,
          }}>
            Studienjahr&nbsp;·&nbsp;SS&nbsp;26
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto" style={{ padding: '0 14px' }}>
          <div style={{ ...sectionLabelStyle, paddingTop: 4 }}>Studio</div>
          {studioItems.map(item => (
            <button key={item.id} style={navItemStyle(activeTab === item.id)} onClick={() => onTabChange(item.id)}>
              <item.icon style={{ width: 16, height: 16, color: 'var(--mute)', flexShrink: 0 }} strokeWidth={1.5} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {activeTab === item.id && (
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
              )}
            </button>
          ))}

          <div style={{ ...sectionLabelStyle, paddingTop: 18 }}>Werkzeuge</div>
          {toolItems.map(item => (
            <button key={item.id} style={navItemStyle(activeTab === item.id)} onClick={() => onTabChange(item.id)}>
              <item.icon style={{ width: 16, height: 16, color: 'var(--mute)', flexShrink: 0 }} strokeWidth={1.5} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {activeTab === item.id && (
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </nav>

        {/* User section */}
        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border-color)' }}>
          {user ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-serif)', fontSize: 14, fontWeight: 500,
                }}>
                  {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
                    color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {user.user_metadata?.full_name || 'Nutzer'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.email}
                  </div>
                </div>
                <button onClick={onSettingsClick} style={{
                  color: 'var(--mute)', cursor: 'pointer', flexShrink: 0,
                  background: 'none', border: 'none', padding: 0, display: 'flex',
                }}>
                  <Settings style={{ width: 15, height: 15 }} strokeWidth={1.5} />
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button onClick={onUpgradeClick} style={{
                  flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  fontFamily: 'var(--font-sans)', cursor: 'pointer',
                  background: 'var(--primary-soft)', color: 'var(--primary)',
                  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                  <Zap style={{ width: 12, height: 12 }} strokeWidth={1.75} />
                  Pro
                </button>
                <button onClick={toggleTheme} title={isDark ? 'Tagmodus' : 'Nachtmodus'} style={{
                  padding: '6px 9px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', color: 'var(--mute)',
                  border: '1px solid var(--border-color)', display: 'flex',
                }}>
                  {isDark
                    ? <Sun style={{ width: 14, height: 14 }} strokeWidth={1.5} />
                    : <Moon style={{ width: 14, height: 14 }} strokeWidth={1.5} />}
                </button>
                <button onClick={onLogout} title="Abmelden" style={{
                  padding: '6px 9px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', color: 'var(--mute)',
                  border: '1px solid var(--border-color)', display: 'flex',
                }}>
                  <LogOut style={{ width: 14, height: 14 }} strokeWidth={1.5} />
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 10 }}>
                {(['impressum', 'datenschutz', 'agb'] as const).map(p => (
                  <button key={p} onClick={() => setLegalPage(p)} style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--mute)', background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {legalLabels[p]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button onClick={onLoginClick} style={{
                width: '100%', padding: '9px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                fontFamily: 'var(--font-sans)', cursor: 'pointer',
                background: 'var(--primary)', color: '#fff', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <LogIn style={{ width: 15, height: 15 }} strokeWidth={1.75} />
                Einloggen / Registrieren
              </button>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <button onClick={toggleTheme} style={{
                  padding: '5px 9px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', color: 'var(--mute)',
                  border: '1px solid var(--border-color)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 11, fontFamily: 'var(--font-sans)',
                }}>
                  {isDark ? <Sun style={{ width: 13, height: 13 }} strokeWidth={1.5} /> : <Moon style={{ width: 13, height: 13 }} strokeWidth={1.5} />}
                  {isDark ? 'Tag' : 'Nacht'}
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['impressum', 'datenschutz', 'agb'] as const).map(p => (
                    <button key={p} onClick={() => setLegalPage(p)} style={{
                      fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: 'var(--mute)', background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}>
                      {legalLabels[p]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 backdrop-blur-xl z-[60] flex justify-around items-center pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" style={{
        background: 'color-mix(in srgb, var(--bg-sidebar) 95%, transparent)',
        borderTop: '1px solid var(--border-color)',
      }}>
        {studioItems.map(item => (
          <button key={item.id} onClick={() => handleMobileTabChange(item.id)}
            className="flex flex-col items-center gap-1 p-2 transition-all active:scale-90"
            style={{ color: activeTab === item.id ? 'var(--primary)' : 'var(--mute)', border: 'none', background: 'none', cursor: 'pointer' }}
          >
            <item.icon className="w-6 h-6" strokeWidth={1.5} />
            <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-sans)' }}>
              {item.label}
            </span>
          </button>
        ))}
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex flex-col items-center gap-1 p-2 transition-all active:scale-90"
          style={{ color: isMobileMenuOpen ? 'var(--primary)' : 'var(--mute)', border: 'none', background: 'none', cursor: 'pointer' }}
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" strokeWidth={1.5} /> : <Menu className="w-6 h-6" strokeWidth={1.5} />}
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-sans)' }}>Mehr</span>
        </button>
      </nav>

      {/* ── Mobile Menu Overlay ── */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[55] backdrop-blur-sm animate-in fade-in duration-300"
          style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="absolute bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] left-4 right-4 p-5 animate-in slide-in-from-bottom-8 duration-500 overflow-y-auto max-h-[70vh]"
            style={{ borderRadius: 20, background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', boxShadow: '0 30px 60px rgba(0,0,0,0.25)' }}>
            <div className="grid grid-cols-2 gap-2.5">
              {toolItems.map(item => (
                <button key={item.id} onClick={() => handleMobileTabChange(item.id)}
                  className="flex items-center gap-3 p-3.5 transition-all active:scale-95"
                  style={{
                    borderRadius: 8, border: '1px solid var(--border-color)', cursor: 'pointer',
                    background: activeTab === item.id ? 'var(--primary-soft)' : 'var(--card)',
                    color: activeTab === item.id ? 'var(--primary)' : 'var(--ink2)',
                  }}>
                  <item.icon className="w-5 h-5 shrink-0" strokeWidth={1.5} />
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-sans)' }}>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <button onClick={() => { setIsMobileMenuOpen(false); setShowApiSettings(true); }}
                className="flex-1 flex items-center justify-between p-3.5 transition-all active:scale-95"
                style={{
                  borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  border: apiKeySet ? '1px solid var(--border-color)' : '1px solid #f59e0b',
                  background: apiKeySet ? 'var(--card)' : 'rgba(245,158,11,0.08)',
                  color: apiKeySet ? 'var(--ink2)' : '#f59e0b',
                }}>
                <span className="text-xs flex items-center gap-2">
                  <KeyRound className="w-4 h-4" strokeWidth={1.5} />
                  {apiKeySet ? 'API-Schlüssel' : 'API-Key fehlt!'}
                </span>
                <span className={`w-2 h-2 rounded-full ${apiKeySet ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
              </button>
              <button onClick={toggleTheme}
                className="p-3.5 transition-all active:scale-95"
                style={{ borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--card)', color: 'var(--ink2)', cursor: 'pointer' }}>
                {isDark ? <Sun className="w-5 h-5" strokeWidth={1.5} /> : <Moon className="w-5 h-5" strokeWidth={1.5} />}
              </button>
            </div>
            <ColorPicker />
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-grow flex flex-col overflow-hidden w-full">
        {/* Top bar — desktop only */}
        <header className="hidden lg:flex items-center gap-5 flex-shrink-0" style={{
          padding: '20px 48px', borderBottom: '1px solid var(--border-color)',
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 12, top: 9, width: 15, height: 15, color: 'var(--mute)' }} strokeWidth={1.5} />
            <input
              placeholder="In Skripten, Karten und Notizen suchen…"
              style={{
                width: '100%', padding: '8px 48px 8px 36px',
                border: '1px solid var(--border-color)',
                background: 'rgba(255,250,240,0.5)', borderRadius: 4,
                fontFamily: 'var(--font-sans)', fontSize: 13,
                color: 'var(--ink)', outline: 'none',
              }}
            />
            <span style={{
              position: 'absolute', right: 10, top: 7, padding: '2px 6px', borderRadius: 3,
              border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)',
              fontSize: 11, color: 'var(--mute)', whiteSpace: 'nowrap',
            }}>⌘ K</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--ink2)', flexShrink: 0 }}>
            <Bell style={{ width: 17, height: 17 }} strokeWidth={1.4} />
            <span style={{
              fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15,
              color: 'var(--ink2)', whiteSpace: 'nowrap',
            }}>
              {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/(\w+),\s(\d+)\.\s(\w+)/, '$1, $2. $3')}
            </span>
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 pb-32 lg:pb-12 pt-[max(1rem,env(safe-area-inset-top))] lg:pt-0">
          <div className="lg:px-12 lg:py-9">{children}</div>
        </div>
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
