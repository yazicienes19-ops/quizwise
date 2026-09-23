/**
 * Social Login, der im Login-Fenster angeboten wird.
 *
 * Nur Anbieter eintragen, die in Supabase unter Authentication → Providers
 * wirklich eingerichtet sind. Ein sichtbarer, aber nicht eingerichteter
 * Anbieter endet für Nutzer mit "provider is not enabled" (Audit 23.09.2026).
 * Leere Liste = kein Social Login, das Fenster zeigt nur E-Mail und Passwort.
 */
export type OAuthProvider = 'google' | 'apple';

export const OAUTH_PROVIDERS: OAuthProvider[] = [];
