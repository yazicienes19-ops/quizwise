const cron = require('node-cron');
const webpush = require('web-push');
const { supabaseAdmin } = require('../middleware/auth');
const { loadContext } = require('./dataLoader');
const { NOTIFICATION_TYPES } = require('./registry');
const { EMAIL_TYPE_IDS, buildEmail } = require('./emailDigest');
const { sendMail, isConfigured: isMailConfigured } = require('../utils/mailer');

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

/** Nutzer, die E-Mail-Erinnerungen eingeschaltet haben (Standard: aus). */
async function loadEmailUserIds() {
  if (!isMailConfigured()) return [];
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .filter('preferences->notification_settings->email->>enabled', 'eq', 'true');
  if (error) { console.error('email users:', error.message); return []; }
  return (data || []).map(r => r.id);
}

async function sendEmailDigest(userId, messages) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  const to = data?.user?.email;
  if (error || !to) return;
  await sendMail({ to, ...buildEmail(messages) });
}

async function tick() {
  const [{ data: subs, error }, emailUserIds] = await Promise.all([
    supabaseAdmin.from('push_subscriptions').select('endpoint, user_id, subscription'),
    loadEmailUserIds(),
  ]);
  if (error) return;
  const pushSubs = subs || [];
  const emailUsers = new Set(emailUserIds);

  const userIds = [...new Set([...pushSubs.map(s => s.user_id), ...emailUserIds])];
  if (!userIds.length) return;
  const data = await loadContext(userIds);
  const now = new Date();
  const ctx = { now, weekday: now.getDay(), userIds, data };

  const messages = [];
  for (const type of NOTIFICATION_TYPES) {
    try {
      messages.push(...(await type.evaluate(ctx)).map(m => ({ ...m, typeId: type.id })));
    } catch (e) {
      console.error(`notification type ${type.id}:`, e.message);
    }
  }
  if (!messages.length) return;

  const subsByUser = new Map();
  pushSubs.forEach(s => {
    const arr = subsByUser.get(s.user_id) || [];
    arr.push(s);
    subsByUser.set(s.user_id, arr);
  });

  const emailByUser = new Map();
  for (const msg of messages) {
    if (emailUsers.has(msg.userId) && EMAIL_TYPE_IDS.has(msg.typeId)
      && await claimDedup(msg.userId, `email:${msg.dedupKey}`)) {
      emailByUser.set(msg.userId, [...(emailByUser.get(msg.userId) || []), msg]);
    }

    // Ohne Push-Abo nichts beanspruchen, sonst wäre die Meldung für ein
    // später angemeldetes Gerät heute schon als gesendet verbucht.
    if (!subsByUser.has(msg.userId)) continue;
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

  for (const [userId, list] of emailByUser) {
    await sendEmailDigest(userId, list).catch(e => console.error('email digest:', e.message));
  }
}

function startNotificationScheduler() {
  cron.schedule('*/5 * * * *', () => {
    tick().catch(e => console.error('notification scheduler:', e.message));
  }, { timezone: 'Europe/Berlin' });
  console.log('Notification-Scheduler aktiv (alle 5 Minuten, Europe/Berlin)');
}

module.exports = { startNotificationScheduler, tick };
