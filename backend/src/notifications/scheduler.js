const cron = require('node-cron');
const webpush = require('web-push');
const { supabaseAdmin } = require('../middleware/auth');
const { loadContext } = require('./dataLoader');
const { NOTIFICATION_TYPES } = require('./registry');

/**
 * Beansprucht einen Versand-Slot: schlägt fehl (Unique-Constraint,
 * Postgres-Code 23505), wenn für (userId, dedupKey) heute schon gesendet
 * wurde. Race-sicher über INSERT statt "erst lesen, dann schreiben".
 */
async function claimDedup(userId, dedupKey) {
  const { error } = await supabaseAdmin.from('notification_log').insert({ user_id: userId, dedup_key: dedupKey });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.error('claimDedup:', error.message);
  return false; // im Zweifel nicht senden statt riskiert doppelt zu senden
}

async function tick() {
  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, user_id, subscription');
  if (error || !subs?.length) return;

  const userIds = [...new Set(subs.map(s => s.user_id))];
  const data = await loadContext(userIds);
  const now = new Date();
  const ctx = { now, weekday: now.getDay(), userIds, data };

  const messages = [];
  for (const type of NOTIFICATION_TYPES) {
    try {
      messages.push(...(await type.evaluate(ctx)));
    } catch (e) {
      console.error(`notification type ${type.id}:`, e.message);
    }
  }
  if (!messages.length) return;

  const subsByUser = new Map();
  subs.forEach(s => {
    const arr = subsByUser.get(s.user_id) || [];
    arr.push(s);
    subsByUser.set(s.user_id, arr);
  });

  for (const msg of messages) {
    const claimed = await claimDedup(msg.userId, msg.dedupKey);
    if (!claimed) continue;

    const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url });
    for (const sub of subsByUser.get(msg.userId) || []) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } else {
          console.error('push send:', err.statusCode || err.message);
        }
      }
    }
  }
}

function startNotificationScheduler() {
  cron.schedule('*/5 * * * *', () => {
    tick().catch(e => console.error('notification scheduler:', e.message));
  }, { timezone: 'Europe/Berlin' });
  console.log('Notification-Scheduler aktiv (alle 5 Minuten, Europe/Berlin)');
}

module.exports = { startNotificationScheduler, tick };
