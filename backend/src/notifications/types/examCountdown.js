const { timeMatches, todayStr } = require('../time');

const SUGGESTED_MINUTES = { 7: 30, 3: 45, 1: 60 };

/** Kalendertage zwischen heute (lokale Mitternacht) und dem Prüfungsdatum. */
function daysUntilDate(dateStr, today) {
  const target = new Date(dateStr + 'T00:00:00');
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Klausur-Countdown. Fixer Trigger-Zeitpunkt 08:00 (kein eigener Zeitpunkt
 * in der Anfrage spezifiziert, unabhängig von der täglichen Erinnerung).
 * "Sinnvolle Minuten" ist eine einfache, transparente Heuristik aus der
 * Nähe zur Prüfung — kein KI-generierter Wert.
 */
function evaluate(ctx) {
  const out = [];
  const EXAM_TIME = '08:00';
  if (!timeMatches(ctx.now, EXAM_TIME)) return out;

  for (const userId of ctx.userIds) {
    const u = ctx.data.forUser(userId);
    const s = u.settings.exams;
    if (!s.enabled) continue;

    for (const exam of u.examTerms || []) {
      const days = daysUntilDate(exam.date, ctx.now);
      if (!s.days.includes(days)) continue;

      const dedupKey = `exam:${exam.id}:${days}:${todayStr(ctx.now)}`;
      if (days === 0) {
        out.push({ userId, dedupKey, title: 'Klausur heute', body: `Heute schreibst du ${exam.title}. Viel Erfolg!`, url: '/' });
        continue;
      }

      const mins = SUGGESTED_MINUTES[days];
      const dayWord = days === 1 ? 'Tag' : 'Tagen';
      const body = mins
        ? `In ${days} ${dayWord} schreibst du ${exam.title}. Heute wären ${mins} Minuten sinnvoll.`
        : `In ${days} ${dayWord} schreibst du ${exam.title}.`;
      out.push({ userId, dedupKey, title: 'Klausur-Countdown', body, url: '/' });
    }
  }
  return out;
}

module.exports = { id: 'exam-countdown', evaluate };
