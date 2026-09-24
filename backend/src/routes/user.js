const express = require('express');
const crypto = require('crypto');
const Stripe = require('stripe');
const { supabaseAdmin } = require('../middleware/auth');
const { buildUserExport } = require('../utils/userExport');
const { deleteUserStorage } = require('../utils/userStorage');
const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Für den zurückgegebenen Abo-Link (routes/calendarFeed.js hängt selbst nicht
// von dieser Konstante ab, nur die URL, die wir dem Client zeigen).
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || 'https://quizwise-backend-production.up.railway.app';

// GET /api/user/calendar-feed-token
// Liefert den persönlichen .ics-Abo-Link für den Handy-Kalender-Sync,
// erzeugt bei Erstaufruf einen zufälligen Token (s. migration_calendar_
// feed_token.sql). Derselbe Token bei jedem weiteren Aufruf — ein neuer
// Link würde alle bereits im Handy-Kalender abonnierten Feeds ungültig
// machen.
router.get('/calendar-feed-token', async (req, res, next) => {
  try {
    const { data: profile, error: readErr } = await supabaseAdmin
      .from('profiles').select('calendar_feed_token').eq('id', req.user.id).single();
    if (readErr) throw readErr;

    let token = profile.calendar_feed_token;
    if (!token) {
      token = crypto.randomBytes(24).toString('hex');
      const { error: writeErr } = await supabaseAdmin
        .from('profiles').update({ calendar_feed_token: token }).eq('id', req.user.id);
      if (writeErr) throw writeErr;
    }
    res.json({ url: `${PUBLIC_BACKEND_URL}/api/calendar-feed/${token}.ics` });
  } catch (err) { next(err); }
});

// GET /api/user/profile
router.get('/profile', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: profile, error } = await req.supabase
      .from('profiles')
      .select('full_name, plan, api_calls_today, api_calls_reset_at, created_at, preferences')
      .eq('id', req.user.id)
      .single();
    if (error) throw error;
    const used = profile.api_calls_reset_at === today ? profile.api_calls_today : 0;
    const limit = profile.plan === 'pro' ? null : 20;
    res.json({
      name: profile.full_name,
      email: req.user.email,
      plan: profile.plan,
      usage: { used, limit, remaining: limit ? limit - used : null },
      preferences: profile.preferences || {},
    });
  } catch (err) { next(err); }
});

// POST /api/user/activity-heartbeat
// Leichtgewichtiges Signal fürs Admin-Dashboard (wer lernt wann wie lange).
// seconds wird server-seitig gedeckelt, damit ein manipulierter Client nicht
// beliebige Aktivzeit vortäuschen kann.
router.post('/activity-heartbeat', async (req, res, next) => {
  try {
    const seconds = Math.min(Math.max(Number(req.body?.seconds) || 0, 0), 120);
    const { error } = await supabaseAdmin.rpc('record_activity_heartbeat', {
      p_user_id: req.user.id,
      p_seconds: seconds,
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/user/export
// Alle Nutzerdaten als JSON — DSGVO Recht auf Datenmitnahme
// Vollständiger Datenexport (Art. 15/20 DSGVO), s. utils/userExport.js
router.get('/export', async (req, res, next) => {
  try {
    const exportData = await buildUserExport(supabaseAdmin, req.user);
    res.setHeader('Content-Disposition', 'attachment; filename="studearc-data.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) { next(err); }
});

router.delete('/account', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Aktives Stripe-Abo zuerst SOFORT kündigen (nicht erst zum Periodenende
    // wie beim freiwilligen /api/stripe/cancel) — sonst wird der Nutzer nach
    // der Konto-Löschung weiter belastet, obwohl er die Pro-Features nicht
    // mehr nutzen kann und sein Abo nicht mehr selbst verwalten könnte.
    try {
      const customers = await stripe.customers.list({ email: req.user.email, limit: 1 });
      const customer = customers.data[0];
      if (customer) {
        const subscriptions = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 10 });
        await Promise.all(subscriptions.data.map(sub => stripe.subscriptions.cancel(sub.id)));
      }
    } catch (stripeErr) {
      console.error('Stripe-Kündigung bei Konto-Löschung fehlgeschlagen:', stripeErr.message);
      return res.status(502).json({ error: 'Konto konnte nicht gelöscht werden: Aktives Abo ließ sich nicht kündigen. Bitte versuche es erneut oder kontaktiere den Support.' });
    }

    // Supabase Admin API: löscht User aus auth.users
    // Dank CASCADE werden auch profiles, metrics, decks etc. gelöscht
    // Dateien VOR dem Konto löschen: Schlägt das fehl, bleibt das Konto
    // bestehen und der Nutzer kann es erneut versuchen, statt dass verwaiste
    // Dateien ohne Besitzer zurückbleiben.
    try {
      await deleteUserStorage(supabaseAdmin, userId);
    } catch (storageErr) {
      console.error('Storage-Löschung bei Konto-Löschung fehlgeschlagen:', storageErr.message);
      return res.status(502).json({ error: 'Konto konnte nicht gelöscht werden: Deine Dateien ließen sich nicht entfernen. Bitte versuche es erneut oder kontaktiere den Support.' });
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
