import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { fetchUserProfile } from '../services/geminiService';
import { setLocale } from '../i18n';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [userPlan, setUserPlan] = useState<'free' | 'pro'>('free');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const timeout = setTimeout(() => setAuthChecked(true), 1500);
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setUser(session?.user ?? null);
      setAuthChecked(true);
    }).catch(() => {
      clearTimeout(timeout);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setUserPlan('free'); return; }
    fetchUserProfile()
      .then(p => {
        setUserPlan(p.plan === 'pro' ? 'pro' : 'free');
        if (p.preferences) {
          const pr = p.preferences;
          if (pr.theme) { const dark = pr.theme === 'dark'; setIsDark(dark); document.documentElement.classList.toggle('dark', dark); localStorage.setItem('theme', pr.theme); }
          // Einmaliger Reset auf die neue Logo-Farbe (Gold) für JEDEN Account,
          // unabhängig davon, was vorher als Akzentfarbe gespeichert war —
          // Auswahl in den Einstellungen bleibt danach normal frei änderbar.
          // v2 (29.07.2026): der hellere Gold-Ton #D9A94E ersetzt den erdigeren
          // #A9772C aus v1 — Accounts, die den v1-Reset schon hatten, bekamen
          // sonst weiterhin die alte, in Supabase gespeicherte Farbe zurück.
          if (!localStorage.getItem('studearc_accent_reset_v2')) {
            document.documentElement.style.setProperty('--primary', '#D9A94E');
            document.documentElement.style.setProperty('--primary-text', '#1B2A4A');
            localStorage.setItem('accent_color', '#D9A94E');
            localStorage.setItem('studearc_accent_reset_v1', '1');
            localStorage.setItem('studearc_accent_reset_v2', '1');
            import('../services/syncService').then(({ syncPreferences }) => syncPreferences(user.id, { accent_color: '#D9A94E' })).catch(() => {});
          } else if (pr.accent_color) {
            document.documentElement.style.setProperty('--primary', pr.accent_color);
            localStorage.setItem('accent_color', pr.accent_color);
          }
          if (pr.font_choice) localStorage.setItem('font_choice', pr.font_choice);
          if (pr.line_height) localStorage.setItem('line_height', pr.line_height);
          if (pr.notification_settings) localStorage.setItem('studearc_notification_settings', JSON.stringify(pr.notification_settings));
          if (pr.language === 'de' || pr.language === 'tr' || pr.language === 'en') { localStorage.setItem('studearc_language', pr.language); setLocale(pr.language); }
          // Einmal-Flags aus der Cloud wiederherstellen — sonst hält die App
          // Bestandsnutzer nach gelöschten Website-Daten für Neulinge und
          // blockiert den Login mit dem Onboarding-Overlay.
          if (pr.onboarding_done) {
            localStorage.setItem('studearc_onboarding_done', 'true');
            window.dispatchEvent(new Event('studearc-onboarding-done'));
          }
          if (pr.feynman_intro_done) localStorage.setItem('studearc_feynman_intro_v1', 'true');
          if (pr.recall_intro_done) localStorage.setItem('studearc_feynman_intro_done', '1');
        }
      })
      .catch(() => {});
  }, [user]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    if (user) import('../services/syncService').then(({ syncPreferences }) => syncPreferences(user.id, { theme: next ? 'dark' : 'light' })).catch(() => {});
  };

  return { user, authChecked, userPlan, showAuthModal, setShowAuthModal, isDark, toggleTheme };
};
