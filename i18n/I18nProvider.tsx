import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Locale, getLocale, setLocale, localeTag, t, tp, _registerListener } from './index';

interface I18nContextValue {
  locale: Locale;
  /** Sprache wechseln: Modul-State, localStorage, document.lang und optional Cloud-Sync. */
  changeLocale: (l: Locale, userId?: string | null) => void;
  t: typeof t;
  tp: typeof tp;
  localeTag: () => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(getLocale());

  // Sprachwechsel aus Services/Cloud-Login (via setLocale) lösen hier ein Re-Render aus.
  useEffect(() => {
    _registerListener(setLocaleState);
    return () => _registerListener(null);
  }, []);

  const changeLocale = useCallback((l: Locale, userId?: string | null) => {
    localStorage.setItem('quizwise_language', l);
    setLocale(l); // benachrichtigt den Listener → setLocaleState
    if (userId) {
      import('../services/syncService')
        .then(({ syncPreferences }) => syncPreferences(userId, { language: l }))
        .catch(() => {});
    }
  }, []);

  return (
    <I18nContext.Provider value={{ locale, changeLocale, t, tp, localeTag }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider');
  return ctx;
};
