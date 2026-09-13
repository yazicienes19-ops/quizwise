import { describe, it, expect, beforeEach, vi } from 'vitest';
import { claimLocalUserData, wipeLocalUserData, watchOwnerChange, ownerMarker, LOCAL_OWNER_KEY } from './localAccountGuard';

const seed = () => {
  localStorage.setItem('studearc_quiz_history', '[{"id":"q"}]');
  localStorage.setItem('studearc_mistake_queue', '[1]');
  localStorage.setItem('studearc_streak', '{"current":3}');
  localStorage.setItem('study_events', '[1]');
  localStorage.setItem('flashcard_decks', '[1]');
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('cookie_consent', 'all');
  localStorage.setItem('studearc_language', 'de');
  localStorage.setItem('sb-projekt-auth-token', '{"session":1}');
  sessionStorage.setItem('studearc_feynman_draft_v1', '{}');
};

describe('localAccountGuard', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('fremdes Konto: Lerndaten weg, Geräteeinstellungen und Sitzung bleiben, Neuladen nötig', () => {
    seed();
    localStorage.setItem(LOCAL_OWNER_KEY, ownerMarker('demo'));
    expect(claimLocalUserData('haupt')).toBe(true);
    expect(localStorage.getItem('studearc_quiz_history')).toBeNull();
    expect(localStorage.getItem('studearc_mistake_queue')).toBeNull();
    expect(localStorage.getItem('studearc_streak')).toBeNull();
    expect(localStorage.getItem('study_events')).toBeNull();
    expect(localStorage.getItem('flashcard_decks')).toBeNull();
    expect(sessionStorage.getItem('studearc_feynman_draft_v1')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('cookie_consent')).toBe('all');
    expect(localStorage.getItem('studearc_language')).toBe('de');
    expect(localStorage.getItem('sb-projekt-auth-token')).not.toBeNull();
    expect(localStorage.getItem(LOCAL_OWNER_KEY)).toBe(ownerMarker('haupt'));
  });

  it('gleiches Konto: nichts wird gelöscht, kein Neuladen', () => {
    seed();
    localStorage.setItem(LOCAL_OWNER_KEY, ownerMarker('haupt'));
    expect(claimLocalUserData('haupt')).toBe(false);
    expect(localStorage.getItem('studearc_quiz_history')).not.toBeNull();
  });

  it('Altbestand ohne Besitzer wird einmalig geleert (kann aus mehreren Konten stammen)', () => {
    seed();
    expect(claimLocalUserData('haupt')).toBe(true);
    expect(localStorage.getItem('studearc_quiz_history')).toBeNull();
    expect(claimLocalUserData('haupt')).toBe(false); // kein Neulade-Kreislauf
  });

  it('Vermerk aus einer älteren Epoche (gleiches Konto) erzwingt einmalig frisches Laden', () => {
    seed();
    localStorage.setItem(LOCAL_OWNER_KEY, 'haupt|0');
    expect(claimLocalUserData('haupt')).toBe(true);
    expect(localStorage.getItem('studearc_quiz_history')).toBeNull();
  });

  it('wipeLocalUserData zählt nur Nutzerdaten', () => {
    seed();
    expect(wipeLocalUserData()).toBe(6);
  });

  it('meldet, wenn ein anderer Tab das Konto wechselt', () => {
    const spy = vi.fn();
    const off = watchOwnerChange('haupt', spy);
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_OWNER_KEY, newValue: ownerMarker('haupt') }));
    expect(spy).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_OWNER_KEY, newValue: ownerMarker('demo') }));
    expect(spy).toHaveBeenCalledTimes(1);
    off();
  });
});
