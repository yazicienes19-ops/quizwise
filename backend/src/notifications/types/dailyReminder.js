const { timeMatches, todayStr } = require('../time');
const { blocksForDate } = require('../dayBlocks');
const { formatDuration, pluralBlocks } = require('../messageText');

/**
 * Tägliche Lernerinnerung. "Tagesziel erreicht" ist per Definition
 * gleichbedeutend mit "keine offenen Blöcke mehr heute" (s. Plan-
 * Entscheidung: Tagesziel = alle heutigen Planner-Blöcke erledigt) —
 * `skipIfGoalReached` beschreibt dieses bereits natürliche Verhalten
 * explizit in den Einstellungen, ändert aber die Logik nicht: gibt es
 * nichts Offenes, gibt es nichts Sinnvolles zu erinnern.
 */
function evaluate(ctx) {
  const out = [];
  for (const userId of ctx.userIds) {
    const u = ctx.data.forUser(userId);
    const s = u.settings.dailyReminder;
    if (!s.enabled) continue;
    if (!timeMatches(ctx.now, s.time)) continue;
    if (!s.includeWeekends && (ctx.weekday === 0 || ctx.weekday === 6)) continue;

    const blocks = blocksForDate(ctx.now, u.recurringSessions, u.calendarSessions, u.blockStatus);
    const open = blocks.filter(b => b.status !== 'erledigt');
    const dedupKey = `daily-reminder:${todayStr(ctx.now)}`;

    if (blocks.length === 0) {
      if (s.onlyIfBlocksToday) continue;
      out.push({ userId, dedupKey, title: 'Dein Lernplan heute', body: 'Heute gibt es keine offenen Lernaufgaben.', url: '/' });
      continue;
    }

    if (open.length === 0) continue; // Tagesziel bereits erreicht

    const minutes = open.reduce((sum, b) => sum + b.durationMinutes, 0);
    out.push({
      userId,
      dedupKey,
      title: 'Dein Lernplan heute',
      body: `Du hast heute noch ${pluralBlocks(open.length)} (${formatDuration(minutes)}) offen.`,
      url: '/',
    });
  }
  return out;
}

module.exports = { id: 'daily-reminder', evaluate };
