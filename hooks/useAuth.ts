import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { fetchUserProfile } from '../services/geminiService';
import { setLocale } from '../i18n';
import { setFunctionalPref } from '../services/cookieConsent';
import { claimLocalUserData, watchOwnerChange } from '../services/localAccountGuard';
import { applyTypography } from '../services/appFonts';

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
    // Konto-Schutz (services/localAccountGuard.ts): gehört der Browser-Speicher
    // einem anderen Konto (oder niemandem), wird er geleert und die App lädt
    // neu, BEVOR sie mit diesem Konto rendert, zusammenführt oder hochlädt.
    const applyUser = (next: User | null): boolean => {
      if (next && claimLocalUserData(next.id)) {
        clearTimeout(timeout);
        window.location.reload();
        return false;
      }
      setUser(next);
      return true;
    };
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      if (applyUser(session?.user ?? null)) setAuthChecked(true);
    }).catch(() => {
      clearTimeout(timeout);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Wechselt ein anderer Tab das Konto, nicht mit dem alten weiterschreiben.
  useEffect(() => {
    if (!user) return;
    return watchOwnerChange(user.id, () => window.location.reload());
  }, [user]);

  useEffect(() => {
    if (!user) { setUserPlan('free'); return; }
    fetchUserProfile()
      .then(p => {
        setUserPlan(p.plan === 'pro' ? 'pro' : 'free');
        if (p.preferences) {
          const pr = p.preferences;
          if (pr.theme) { const dark = pr.theme === 'dark'; setIsDark(dark); document.documentElement.classList.toggle('dark', dark); setFunctionalPref('theme', pr.theme); }
          // Einmaliger Reset auf die neue Logo-Farbe (Gold) für JEDEN Account,
          // unabhängig davon, was vorher als Akzentfarbe gespeichert war —
          // Auswahl in den Einstellungen bleibt danach normal frei änderbar.
          // v2 (29.07.2026): der hellere Gold-Ton #D9A94E ersetzt den erdigeren
          // #A9772C aus v1 — Accounts, die den v1-Reset schon hatten, bekamen
          // sonst weiterhin die alte, in Supabase gespeicherte Farbe zurück.
          if (!localStorage.getItem('studearc_accent_reset_v2')) {
            import('../components/ColorPicker').then(({ applyAccentColor }) => applyAccentColor('#D9A94E'));
            localStorage.setItem('studearc_accent_reset_v1', '1');
            localStorage.setItem('studearc_accent_reset_v2', '1');
            import('../services/syncService').then(({ syncPreferences }) => syncPreferences(user.id, { accent_color: '#D9A94E' })).catch(() => {});
          } else if (pr.accent_color) {
            import('../components/ColorPicker').then(({ applyAccentColor }) => applyAccentColor(pr.accent_color));
          }
          if (pr.font_choice) setFunctionalPref('font_choice', pr.font_choice);
          if (pr.line_height) setFunctionalPref('line_height', pr.line_height);
          applyTypography(pr.font_choice, pr.line_height);
          if (pr.notification_settings) setFunctionalPref('studearc_notification_settings', JSON.stringify(pr.notification_settings));
          if (pr.language === 'de' || pr.language === 'tr' || pr.language === 'en') { setFunctionalPref('studearc_language', pr.language); setLocale(pr.language); }
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
    setFunctionalPref('theme', next ? 'dark' : 'light');
    if (user) import('../services/syncService').then(({ syncPreferences }) => syncPreferences(user.id, { theme: next ? 'dark' : 'light' })).catch(() => {});
  };

  return { user, authChecked, userPlan, showAuthModal, setShowAuthModal, isDark, toggleTheme };
};
