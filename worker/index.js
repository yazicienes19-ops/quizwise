// Cloudflare Worker vor den statischen Assets (dist/) — einziger Zweck: beim
// ALLERERSTEN Besuch (noch kein studearc_language-Cookie) die Sprache anhand
// des Cloudflare-Edge-Länderfelds (request.cf.country, kostenlos, kein
// Drittanbieter-Geo-API) vorschlagen, per Cookie festhalten. Danach NIE wieder
// überschreiben — das übernimmt ab dann localStorage bzw. der Account-Sync
// (s. i18n/index.ts detectInitial() / I18nProvider.tsx changeLocale()).
const COUNTRY_TO_LOCALE = {
  TR: 'tr',
  DE: 'de', AT: 'de', CH: 'de', LI: 'de',
  // alles andere (inkl. GB/US/...) fällt bewusst auf 'en', nicht 'de' —
  // Englisch ist die naheliegendere Standardsprache für unbekannte Länder.
};

const LANG_COOKIE = 'studearc_language';

// Sicherheits-Check 28.09.2026: http://studearc.com lud unverschlüsselt und
// ohne Sicherheits-Header. Nur die Live-Domains umleiten, nicht wrangler dev.
const LIVE_HOSTS = new Set(['studearc.com', 'www.studearc.com']);

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function hasLangCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  return new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=`).test(cookie);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === 'http:' && LIVE_HOSTS.has(url.hostname)) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    const response = await env.ASSETS.fetch(request);
    const newResponse = new Response(response.body, response);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      newResponse.headers.set(name, value);
    }

    if (hasLangCookie(request)) return newResponse;

    const country = request.cf?.country;
    const locale = country ? (COUNTRY_TO_LOCALE[country] || 'en') : 'de';

    newResponse.headers.append(
      'Set-Cookie',
      `${LANG_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`
    );
    return newResponse;
  },
};
