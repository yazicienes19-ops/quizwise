const express = require('express');
const webpush = require('web-push');
const { requireAuth, supabaseAdmin } = require('../middleware/auth');

const router = express.Router();

const vapidConfigured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (vapidConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:kontakt@quizwise.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Öffentlich: der Public Key ist per Definition nicht geheim
router.get('/vapid-key', (req, res) => {
  res.json({ key: vapidConfigured ? process.env.VAPID_PUBLIC_KEY : null });
});

router.post('/subscribe', requireAuth, async (req, res) => {
  const sub = req.body?.subscription;
  if (!sub?.endpoint || !sub?.keys) {
    return res.status(400).json({ error: 'Ungültige Subscription.' });
  }
  const { error } = await supabaseAdmin.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    user_id: req.user.id,
    subscription: sub,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) {
    console.error('push subscribe:', error.message);
    return res.status(500).json({ error: 'Subscription konnte nicht gespeichert werden.' });
  }
  res.json({ ok: true });
});

router.delete('/subscribe', requireAuth, async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint fehlt.' });
  await supabaseAdmin.from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', req.user.id);
  res.json({ ok: true });
});

module.exports = { router, vapidConfigured };
