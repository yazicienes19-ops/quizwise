const express = require('express');
const crypto = require('crypto');
const Stripe = require('stripe');
const { supabaseAdmin } = require('../middleware/auth');
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
router.get('/export', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const sb = req.supabase;
    const [profileRes, metricsRes, decksRes, planRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', userId).single(),
      sb.from('metrics').select('*').eq('user_id', userId),
      sb.from('flashcard_decks').select('*').eq('user_id', userId),
      sb.from('study_plan').select('*').eq('user_id', userId).single(),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      account: { email: req.user.email, ...profileRes.data },
      metrics: metricsRes.data || [],
      flashcardDecks: decksRes.data || [],
      studyPlan: planRes.data || null,
    };

    res.setHeader('Content-Disposition', 'attachment; filename="studearc-data.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) { next(err); }
});

// DELETE /api/user/account
// Konto vollständig löschen — DSGVO Recht auf Vergessenwerden
// Alle Dateien eines Nutzers im Storage löschen (Recht auf Vergessenwerden).
// Die Tabellen räumt ON DELETE CASCADE beim Löschen des Auth-Users ab, den
// Bucket nicht. Pfade: <userId>/<docId>/<dateiname> (services/documentService.ts).
// Quelle 1: storage_path aus documents. Quelle 2: Ordner-Listing, damit auch
// Dateien ohne Tabellenzeile (abgebrochene Uploads) erfasst werden.
const STORAGE_BUCKET = 'document-files';

const collectUserStoragePaths = async (userId) => {
  const paths = new Set();

  const { data: docs, error: docsErr } = await supabaseAdmin
    .from('documents').select('storage_path').eq('user_id', userId).not('storage_path', 'is', null);
  if (docsErr) throw docsErr;
  (docs || []).forEach(d => paths.add(d.storage_path));

  const bucket = supabaseAdmin.storage.from(STORAGE_BUCKET);
  const { data: folders, error: listErr } = await bucket.list(userId, { limit: 1000 });
  if (listErr) throw listErr;
  for (const entry of folders || []) {
    // Ordner haben keine id, Dateien direkt unter <userId>/ schon.
    if (entry.id) { paths.add(`${userId}/${entry.name}`); continue; }
    const { data: files, error: fileErr } = await bucket.list(`${userId}/${entry.name}`, { limit: 1000 });
    if (fileErr) throw fileErr;
    (files || []).forEach(f => paths.add(`${userId}/${entry.name}/${f.name}`));
  }
  return [...paths];
};

const deleteUserStorage = async (userId) => {
  const paths = await collectUserStoragePaths(userId);
  // Storage-API nimmt große Listen, aber in Blöcken bleibt ein Fehler eingrenzbar.
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
  return paths.length;
};

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
      await deleteUserStorage(userId);
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
