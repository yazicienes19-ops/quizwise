import { supabase } from './supabaseClient';

// ── Quellen-Import per Link (YouTube-Video oder Webartikel) ───────────────────
// Der Abruf läuft über das Backend: YouTube wird dort zu einem Lernskript
// verarbeitet, Webseiten werden auf den Artikeltext reduziert.

export type UrlKind = 'youtube' | 'web';

export interface ImportedSource {
  kind: UrlKind;
  url: string;
  title: string;
  author?: string;
  siteName?: string;
  text: string;
}

/** Erkennt, ob eine Eingabe ein YouTube-Link, eine sonstige Web-Adresse oder keine URL ist. */
export const detectUrlKind = (raw: string): UrlKind | null => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    // Nutzer tippen URLs oft ohne Protokoll ein
    try { url = new URL(`https://${raw.trim()}`); } catch { return null; }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.')) return null;

  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host === 'youtu.be') return url.pathname.length > 1 ? 'youtube' : null;
  if (host === 'youtube.com') {
    if (url.pathname === '/watch' && url.searchParams.get('v')) return 'youtube';
    if (/^\/(shorts|live|embed)\/[\w-]{6,}/.test(url.pathname)) return 'youtube';
    return null; // Kanal-/Playlist-Seiten haben keinen importierbaren Inhalt
  }
  return 'web';
};

/** Normalisiert eine Eingabe zur vollständigen URL (ergänzt fehlendes https://). */
export const normalizeUrl = (raw: string): string => {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const importFromUrl = async (raw: string): Promise<ImportedSource> => {
  const kind = detectUrlKind(raw);
  if (!kind) throw new Error('Das ist keine gültige Web-Adresse.');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Zum Importieren von Links bitte zuerst anmelden.');

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  const response = await fetch(`${backendUrl}/api/import/${kind}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ url: normalizeUrl(raw) }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Link konnte nicht importiert werden.');
  }
  return body as ImportedSource;
};
