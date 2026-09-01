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

function hasLangCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  return new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=`).test(cookie);
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);

    if (hasLangCookie(request)) return response;

    const country = request.cf?.country;
    const locale = country ? (COUNTRY_TO_LOCALE[country] || 'en') : 'de';

    const newResponse = new Response(response.body, response);
    newResponse.headers.append(
      'Set-Cookie',
      `${LANG_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`
    );
    return newResponse;
  },
};
