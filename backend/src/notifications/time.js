/**
 * Zeit-Helfer für den 5-Minuten-Scheduler-Tick (Europe/Berlin, da der Cron
 * mit `timezone: 'Europe/Berlin'` läuft und `now` bereits in dieser Zone
 * tickt). Ein fester Zielzeitpunkt "HH:MM" feuert dadurch zuverlässig genau
 * einmal pro Tag, auch wenn er nicht exakt auf ein 5-Minuten-Raster fällt
 * (z.B. 18:07 → erster Tick danach ist 18:10, Differenz 3 Minuten).
 */
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function parseHHMM(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/** true, wenn `now` der erste 5-Minuten-Tick bei oder nach `hhmm` ist. */
function timeMatches(now, hhmm) {
  const target = parseHHMM(hhmm);
  const diff = minutesSinceMidnight(now) - target;
  return diff >= 0 && diff < 5;
}

/** Minuten bis zu einer "HH:MM"-Uhrzeit am selben Kalendertag wie `now`. */
function minutesUntilTimeToday(now, hhmm) {
  return parseHHMM(hhmm) - minutesSinceMidnight(now);
}

function todayStr(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

module.exports = { timeMatches, minutesUntilTimeToday, todayStr, minutesSinceMidnight, parseHHMM };
