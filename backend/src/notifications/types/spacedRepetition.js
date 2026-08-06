const { timeMatches, todayStr } = require('../time');
const { pluralCards, pluralQuestions } = require('../messageText');

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

/**
 * Fällige Karteikarten/Fehlerfragen. Drei Modi (Radio, nicht kombinierbar):
 * "immediate" (fest 1 fällige Karte reicht), "threshold" (frei konfigurierte
 * Mindestanzahl), beide feuern sobald die Schwelle überschritten ist, höchstens
 * 1x/Tag. "bundled" nutzt stattdessen den Zeitpunkt der täglichen Erinnerung
 * statt sofort zu feuern.
 */
function evaluate(ctx) {
  const out = [];
  for (const userId of ctx.userIds) {
    const u = ctx.data.forUser(userId);
    const s = u.settings.spacedRepetition;
    if (!s.enabled) continue;

    if (s.mode === 'bundled') {
      if (!timeMatches(ctx.now, u.settings.dailyReminder.time)) continue;
    }

    const dueCards = countDueCards(u.decks);
    const dueMistakes = countDueMistakes(u.mistakeQueue);
    const total = dueCards + dueMistakes;
    const minRequired = s.mode === 'threshold' ? Math.max(1, s.threshold) : 1;
    if (total < minRequired) continue;

    const parts = [];
    if (dueCards > 0) parts.push(pluralCards(dueCards));
    if (dueMistakes > 0) parts.push(pluralQuestions(dueMistakes));
    const verb = total === 1 ? 'wartet' : 'warten';

    out.push({
      userId,
      dedupKey: `spaced-repetition:${todayStr(ctx.now)}`,
      title: 'Zeit zum Wiederholen',
      body: `${parts.join(' und ')} ${verb} auf ihre Wiederholung.`,
      url: '/',
    });
  }
  return out;
}

module.exports = { id: 'spaced-repetition', evaluate };
