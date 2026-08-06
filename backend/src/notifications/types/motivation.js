const { minutesSinceMidnight, parseHHMM, timeMatches, todayStr } = require('../time');
const { blocksForDate, blocksForWeek, toDateStr } = require('../dayBlocks');
const { formatDuration } = require('../messageText');

const RISK_TIME = '20:00';

function goalReached(blocks) {
  return blocks.length > 0 && blocks.every(b => b.status === 'erledigt');
}

function mondayOf(date) {
  const weekday = date.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

/**
 * Fünf eigenständige, aber leichtgewichtige Motivations-Typen — jeder
 * einzeln über sein Toggle abschaltbar. Kein Cross-Tick-State nötig: der
 * gemeinsame Dedup-Log (höchstens 1x pro Tag/Woche je dedupKey) reicht,
 * um Wiederholungen zu verhindern.
 */
function evaluate(ctx) {
  const out = [];
  for (const userId of ctx.userIds) {
    const u = ctx.data.forUser(userId);
    const s = u.settings.motivation;
    const today = todayStr(ctx.now);

    if (s.dailyGoalReached) {
      const blocks = blocksForDate(ctx.now, u.recurringSessions, u.calendarSessions, u.blockStatus);
      if (goalReached(blocks)) {
        out.push({
          userId,
          dedupKey: `daily-goal:${today}`,
          title: 'Tagesziel erreicht',
          body: 'Du hast dein heutiges Lernziel erreicht.',
          url: '/',
        });
      }
    }

    if (s.weeklyGoalReached) {
      const weekBlocks = blocksForWeek(ctx.now, u.recurringSessions, u.calendarSessions, u.blockStatus);
      if (goalReached(weekBlocks)) {
        const weekKey = toDateStr(mondayOf(ctx.now));
        out.push({
          userId,
          dedupKey: `weekly-goal:${weekKey}`,
          title: 'Wochenziel erreicht',
          body: 'Du hast dein Wochenziel im Studienplaner erreicht.',
          url: '/',
        });
      }
    }

    const todayDone = u.streak?.lastDay === today;
    const streakCurrent = u.streak?.current || 0;

    if (s.streakAtRisk && timeMatches(ctx.now, RISK_TIME) && streakCurrent > 0 && !todayDone) {
      out.push({
        userId,
        dedupKey: `streak-risk:${today}`,
        title: 'Deine Streak braucht dich',
        body: `Deine Lernstreak von ${streakCurrent} Tagen endet heute, wenn du jetzt nicht kurz lernst.`,
        url: '/',
      });
    }

    if (s.streakSaved && streakCurrent > 0 && todayDone && minutesSinceMidnight(ctx.now) >= parseHHMM(RISK_TIME)) {
      out.push({
        userId,
        dedupKey: `streak-saved:${today}`,
        title: 'Streak gerettet',
        body: `Streak gerettet: ${streakCurrent} Tage in Folge.`,
        url: '/',
      });
    }

    if (s.newPersonalBest) {
      const best = findFreshPersonalBest(u.quizHistory, u.examHistory, ctx.now);
      if (best) {
        out.push({
          userId,
          dedupKey: `personal-best:${today}`,
          title: 'Neue Bestleistung',
          body: `Neue persönliche Bestleistung: ${best.score}% in ${best.label}.`,
          url: '/',
        });
      }
    }
  }
  return out;
}

/** Neuester Eintrag (heute) mit dem höchsten Score in der gesamten Historie. */
function findFreshPersonalBest(quizHistory, examHistory, now) {
  const all = [
    ...(quizHistory || []).map(r => ({ ...r, label: 'einem Quiz' })),
    ...(examHistory || []).map(r => ({ ...r, label: 'einer Klausur' })),
  ];
  if (!all.length) return null;

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const latest = all.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
  if (latest.timestamp < todayMidnight) return null;

  const maxScore = Math.max(...all.map(r => r.score));
  if (latest.score < maxScore) return null;
  const priorMax = Math.max(0, ...all.filter(r => r.id !== latest.id).map(r => r.score));
  if (latest.score <= priorMax) return null;

  return latest;
}

module.exports = { id: 'motivation', evaluate };
