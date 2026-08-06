const { minutesSinceMidnight, parseHHMM, todayStr } = require('../time');
const { blocksForDate } = require('../dayBlocks');

/** Erinnerung X Minuten vor einem geplanten Lernblock mit fester Uhrzeit. */
function evaluate(ctx) {
  const out = [];
  for (const userId of ctx.userIds) {
    const u = ctx.data.forUser(userId);
    const s = u.settings.blockLeadTime;
    if (!s.enabled) continue;

    const blocks = blocksForDate(ctx.now, u.recurringSessions, u.calendarSessions, u.blockStatus);
    for (const block of blocks) {
      if (!block.startTime || block.status === 'erledigt') continue;
      if (s.onlyHighPriority && block.priority !== 'hoch') continue;

      const targetMinutes = parseHHMM(block.startTime) - s.leadMinutes;
      const diff = minutesSinceMidnight(ctx.now) - targetMinutes;
      if (diff < 0 || diff >= 5) continue;

      out.push({
        userId,
        dedupKey: `block-lead:${block.id}:${todayStr(ctx.now)}`,
        title: 'Bald geht’s los',
        body: `In ${s.leadMinutes} Minuten beginnt „${block.topic}" (${block.startTime} Uhr).`,
        url: '/',
      });
    }
  }
  return out;
}

module.exports = { id: 'block-lead-time', evaluate };
