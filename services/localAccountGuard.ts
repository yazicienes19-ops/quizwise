/**
 * localAccountGuard — bindet den Browser-Speicher an genau ein Konto.
 *
 * Befund 13.09.2026: localStorage ist für alle Konten und Tabs eines Browsers
 * gemeinsam. Beim Login vereinte App.tsx den lokalen Stand mit der Cloud und
 * schrieb das Ergebnis zurück, also landeten Quiz-/Feynman-/Klausurverlauf,
 * Fehlerfragen, Lernserie usw. eines Kontos in der Cloud des anderen (zwei
 * Tabs, zwei Konten: am Ende hatten beide dieselbe Vereinigung).
 *
 * Regel: Der lokale Stand gehört dem Konto in OWNER_KEY. Meldet sich ein
 * anderes Konto an (oder ist noch kein Besitzer vermerkt, Altbestand vor
 * diesem Schutz), werden alle nutzerbezogenen Daten gelöscht und die App lädt
 * neu, damit nichts Fremdes mehr gerendert, zusammengeführt oder hochgeladen
 * wird. Geräteeinstellungen und die Supabase-Sitzung bleiben erhalten.
 */

export const LOCAL_OWNER_KEY = 'studearc_local_owner';

/** Hochzählen erzwingt auf JEDEM Gerät einmalig ein Leeren + frisches Laden
 *  aus der Cloud (z.B. nachdem vermischte Cloud-Daten bereinigt wurden, damit
 *  alte Browser-Stände sie nicht per Merge wieder hochladen). */
export const LOCAL_DATA_EPOCH = 2; // 2: Lernverlauf-Reset Hauptkonto 13.09.2026

/** Besitzer-Vermerk: Konto plus Epoche. */
export const ownerMarker = (userId: string): string => `${userId}|${LOCAL_DATA_EPOCH}`;
const markerUser = (marker: string | null): string | null => (marker ? marker.split('|')[0] : null);

/** Geräteeinstellungen: bleiben beim Kontowechsel erhalten. */
const KEEP_KEYS = new Set<string>([
  LOCAL_OWNER_KEY,
  'theme', 'accent_color', 'font_choice', 'line_height', 'cookie_consent', 'gemini_api_key',
  'studearc_language', 'studearc_sidebar_collapsed', 'studearc_accent_reset_v1', 'studearc_accent_reset_v2',
  'studearc_analytics_events', 'studearc_analytics_first_seen', 'studearc_analytics_once',
  'studearc_sw_reload_at', 'studearc_feynman_audience', 'studearc_feynman_intro_done', 'studearc_feynman_intro_v1',
]);

/** Nutzerdaten ohne studearc_-Präfix (ältere Schlüssel). */
const LEGACY_USER_KEYS = new Set<string>(['study_events', 'study_plan', 'study_templates', 'flashcard_decks', 'flashcard_decks_owner']);

const isUserDataKey = (key: string): boolean => {
  if (KEEP_KEYS.has(key)) return false;
  if (key.startsWith('sb-')) return false; // Supabase-Sitzung
  return key.startsWith('studearc_') || key.startsWith('quizwise_') || LEGACY_USER_KEYS.has(key);
};

const keysOf = (storage: Storage): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k) keys.push(k); }
  return keys;
};

/** Löscht alle nutzerbezogenen Einträge aus local- und sessionStorage. Rückgabe: Anzahl. */
export const wipeLocalUserData = (): number => {
  let removed = 0;
  for (const storage of [localStorage, sessionStorage]) {
    try {
      for (const key of keysOf(storage)) {
        if (isUserDataKey(key)) { storage.removeItem(key); removed++; }
      }
    } catch { /* Speicher gesperrt */ }
  }
  return removed;
};

/**
 * Vor dem ersten Rendern mit einem Konto aufrufen. true = fremder oder
 * herrenloser Stand wurde gelöscht, die App muss neu laden.
 */
export const claimLocalUserData = (userId: string): boolean => {
  let owner: string | null;
  try { owner = localStorage.getItem(LOCAL_OWNER_KEY); } catch { return false; }
  if (owner === ownerMarker(userId)) return false;
  wipeLocalUserData();
  try { localStorage.setItem(LOCAL_OWNER_KEY, ownerMarker(userId)); } catch { /* ignore */ }
  return true;
};

/** Wechselt ein anderer Tab das Konto, darf dieser Tab nicht mit dem alten
 *  Konto im Speicher weiterschreiben: dann neu laden (die Supabase-Sitzung ist
 *  ohnehin browserweit und gehört jetzt dem neuen Konto). */
export const watchOwnerChange = (currentUserId: string, onForeignOwner: () => void): (() => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_OWNER_KEY && e.newValue && markerUser(e.newValue) !== currentUserId) onForeignOwner();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
};
