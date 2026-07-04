const cron = require('node-cron');
const webpush = require('web-push');
const { supabaseAdmin } = require('../middleware/auth');

/**
 * Tägliche Lern-Erinnerung (17:00 Europe/Berlin).
 *
 * Für jeden Nutzer mit Push-Subscription: fällige Karteikarten
 * (flashcard_decks.cards[].srs.nextReview) + fällige Fehlerfragen
 * (user_learning_data.mistake_queue) zählen. Nur bei > 0 fällig wird
 * gesendet — keine leeren Pings. Abgelaufene Subscriptions (404/410)
 * werden aufgeräumt.
 */

const countDueCards = (decks) => {
  const now = Date.now();
  let due = 0;
  for (const deck of decks || []) {
    for (const card of deck.cards || []) {
      const next = card.srs?.nextReview ?? card.nextReview ?? 0;
      if (next <= now) due += 1;
    }
  }
  return due;
};

const countDueMistakes = (queue) => {
  const now = Date.now();
  return (queue || []).filter(item => (item.srs?.nextReview ?? 0) <= now).length;
};

async function sendReminders() {
  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, user_id, subscription');
  if (error || !subs?.length) return;

  // Fällig-Daten pro Nutzer (dedupliziert — ein Nutzer kann mehrere Geräte haben)
  const userIds = [...new Set(subs.map(s => s.user_id))];
  const [decksRes, learningRes] = await Promise.all([
    supabaseAdmin.from('flashcard_decks').select('user_id, cards').in('user_id', userIds),
    supabaseAdmin.from('user_learning_data').select('user_id, mistake_queue').in('user_id', userIds),
  ]);

  const decksByUser = new Map();
  (decksRes.data || []).forEach(row => {
    const arr = decksByUser.get(row.user_id) || [];
    arr.push({ cards: row.cards });
    decksByUser.set(row.user_id, arr);
  });
  const queueByUser = new Map();
  (learningRes.data || []).forEach(row => queueByUser.set(row.user_id, row.mistake_queue));

  for (const sub of subs) {
    const dueCards = countDueCards(decksByUser.get(sub.user_id));
    const dueMistakes = countDueMistakes(queueByUser.get(sub.user_id));
    const total = dueCards + dueMistakes;
    if (total === 0) continue;

    const parts = [];
    if (dueCards > 0) parts.push(`${dueCards} Karte${dueCards !== 1 ? 'n' : ''}`);
    if (dueMistakes > 0) parts.push(`${dueMistakes} Frage${dueMistakes !== 1 ? 'n' : ''}`);

    const payload = JSON.stringify({
      title: 'Zeit zum Wiederholen 🔥',
      body: `${parts.join(' und ')} fällig — eine kurze Session hält deine Streak am Leben.`,
      url: '/',
    });

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

function startReminderCron() {
  cron.schedule('0 17 * * *', () => {
    sendReminders().catch(e => console.error('reminder cron:', e.message));
  }, { timezone: 'Europe/Berlin' });
  console.log('Push-Reminder-Cron aktiv (täglich 17:00 Europe/Berlin)');
}

module.exports = { startReminderCron, sendReminders };
