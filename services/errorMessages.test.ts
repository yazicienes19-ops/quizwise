import { describe, it, expect, vi } from 'vitest';

// i18n gemockt: t gibt einfach den Key zurück — so testen wir die Zuordnung
// (ERROR_MAP) deterministisch ohne Kopplung an Locale-Texte.
vi.mock('../i18n', () => ({ t: (k: string) => k }));

import { resolveErrorMessage } from './errorMessages';

describe('resolveErrorMessage', () => {
  it('bildet Supabase-Auth-Fehler auf verständliche Keys ab', () => {
    expect(resolveErrorMessage(new Error('Invalid login credentials'))).toBe('auth.errInvalid');
    expect(resolveErrorMessage(new Error('User already registered'))).toBe('auth.errExists');
    expect(resolveErrorMessage(new Error('Password should be at least 6 characters'))).toBe('auth.errShortPw');
    expect(resolveErrorMessage(new Error('Email not confirmed'))).toBe('errors.authNotConfirmed');
    // Trust-Fall Nr. 1: Rate-Limit beim Login/Mailversand darf nicht als
    // generisches "stark ausgelastet" (AI-Quota) durchgehen
    expect(resolveErrorMessage(new Error('Email rate limit exceeded'))).toBe('errors.authRateLimit');
  });

  it('behält die bestehenden API-/Netzwerk-Mappings bei', () => {
    expect(resolveErrorMessage(new Error('LIMIT_REACHED'))).toBe('errors.limitReached');
    expect(resolveErrorMessage(new Error('Failed to fetch'))).toBe('errors.network');
    expect(resolveErrorMessage(new Error('429 RESOURCE_EXHAUSTED'))).toBe('errors.quota');
    expect(resolveErrorMessage(new Error('DEADLINE_EXCEEDED'))).toBe('errors.timeout');
    expect(resolveErrorMessage(new Error('SAFETY blocked'))).toBe('errors.safety');
    expect(resolveErrorMessage(new Error('Unexpected token in JSON'))).toBe('errors.badJson');
  });

  it('reicht konkrete kurze Meldungen unverändert durch (bewusstes Design)', () => {
    const msg = 'Konnte Metadaten nicht laden';
    expect(resolveErrorMessage(new Error(msg))).toBe(msg);
  });

  it('fängt lange/leere/nicht-Error-Eingaben mit dem generischen Text ab', () => {
    expect(resolveErrorMessage(new Error('x'.repeat(200)))).toBe('errors.generic');
    expect(resolveErrorMessage(new Error(''))).toBe('errors.generic');
    expect(resolveErrorMessage(undefined)).toBe('errors.generic');
    // Rohe Strings statt Error-Instanzen kommen in catch(err:any)-Ketten vor
    expect(resolveErrorMessage('Invalid login credentials')).toBe('auth.errInvalid');
  });
});
