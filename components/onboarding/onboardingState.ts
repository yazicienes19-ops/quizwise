import type { OnboardingProfile } from '../../types';

const ONBOARDING_KEY = 'studearc_onboarding_done';
const DRAFT_KEY = 'studearc_onboarding_draft';
const PROFILE_CACHE_KEY = 'studearc_onboarding_profile';

export const isOnboardingDone = () => localStorage.getItem(ONBOARDING_KEY) === 'true';

export const resetOnboarding = () => {
  localStorage.removeItem(ONBOARDING_KEY);
  localStorage.removeItem(DRAFT_KEY);
};

/** Beendet den Flow: Flag setzen, Entwurf verwerfen (nicht mehr gebraucht). */
export const markOnboardingDone = () => {
  localStorage.setItem(ONBOARDING_KEY, 'true');
  localStorage.removeItem(DRAFT_KEY);
};

export interface OnboardingDraft {
  stepIndex: number;
  profile: Partial<OnboardingProfile>;
}

/**
 * Entwurf überlebt einen Reload mitten im Flow (z. B. während der Digest-Wartezeit
 * in Schritt 8). Reines Komfort-Feature — ein Schreibfehler (voller/deaktivierter
 * Storage) darf den Flow nie blockieren, deshalb schluckt saveDraft Fehler still.
 */
export const loadDraft = (): OnboardingDraft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.stepIndex !== 'number' || typeof parsed?.profile !== 'object' || parsed.profile === null) return null;
    return parsed as OnboardingDraft;
  } catch {
    return null;
  }
};

export const saveDraft = (draft: OnboardingDraft) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage voll/deaktiviert - Draft ist nur ein Komfort-Feature, kein Blocker.
  }
};

/**
 * Cacht das fertige Profil lokal, damit "StudeArc kennenlernen" (Settings →
 * Wiedereinstieg in die App-Tour) es ohne Netzwerk-Roundtrip direkt wieder
 * verwenden kann — die eigentliche, geräteübergreifende Quelle bleibt
 * `CloudPreferences.onboarding` (services/syncService.ts), dies ist nur ein
 * schneller lokaler Zweitspeicher für einen einzelnen, schnellen Wiedereinstieg.
 */
export const cacheOnboardingProfile = (profile: Partial<OnboardingProfile>) => {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // Kein Blocker, s. saveDraft.
  }
};

export const getCachedOnboardingProfile = (): Partial<OnboardingProfile> | undefined => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Partial<OnboardingProfile>) : undefined;
  } catch {
    return undefined;
  }
};
