import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { fetchUserProfile } from '../services/geminiService';

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
      .then(p => setUserPlan(p.plan === 'pro' ? 'pro' : 'free'))
      .catch(() => {});
  }, [user]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return { user, authChecked, userPlan, showAuthModal, setShowAuthModal, isDark, toggleTheme };
};
