// Der Server ruft fremde URLs im Auftrag des Nutzers ab — interne Ziele
// (localhost, private Netze, Cloud-Metadaten) dürfen dabei nie erreichbar sein.
// Gemeinsam genutzt von importUrl.js (Artikel-Import) und search.js (Quellen-Lookup).

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.(local|internal)$/i,
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./, /^\[?::1\]?$/, /^\[?fc/i, /^\[?fe80/i,
];

function validatePublicHttpUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (PRIVATE_HOST_PATTERNS.some(p => p.test(url.hostname))) return null;
  return url;
}

module.exports = { validatePublicHttpUrl };
