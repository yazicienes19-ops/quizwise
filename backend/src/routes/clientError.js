const express = require('express');
const { supabaseAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Fehler-Telemetrie: Frontend meldet unbehandelte JS-Fehler hierher.
 * Kein Auth (Fehler passieren auch ausgeloggt), dafür strenges Rate-Limit
 * (in index.js) und harte Größen-Caps. Landet im Railway-Log UND — sobald
 * die Tabelle existiert — in Supabase `client_errors`.
 */
router.post('/', (req, res) => {
  const b = req.body || {};
  const entry = {
    message:     String(b.message || '').slice(0, 500),
    stack:       String(b.stack || '').slice(0, 2000),
    source:      String(b.source || '').slice(0, 40),
    url:         String(b.url || '').slice(0, 200),
    user_agent:  String(b.userAgent || '').slice(0, 300),
    app_version: String(b.appVersion || '').slice(0, 60),
  };
  if (!entry.message) return res.status(400).json({ error: 'message fehlt' });

  console.error('[CLIENT-ERROR]', JSON.stringify(entry));

  // Best effort — Supabase-Query-Chains sind nur thenable: NIE .catch() anhängen!
  (async () => {
    try {
      const { error } = await supabaseAdmin.from('client_errors').insert(entry);
      if (error && !/relation .* does not exist/i.test(error.message)) {
        console.error('client_errors insert:', error.message);
      }
    } catch (e) {
      console.error('client_errors insert:', e?.message);
    }
  })();

  res.json({ ok: true });
});

module.exports = router;
