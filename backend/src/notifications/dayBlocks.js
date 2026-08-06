/**
 * Backend-Port von sessionsForDate() aus services/calendarSessions.ts —
 * reine JS-Reimplementierung derselben Wochentag/skipDates/oneOff-Logik,
 * da das Backend eine separate Node-Runtime ist und kein TS importieren
 * kann (gleiches Muster wie countDueCards/countDueMistakes in der
 * bisherigen reminderCron.js). Beschränkt sich bewusst auf die manuell
 * geplanten Blöcke (recurring + calendar sessions) — die KI-Empfehlungen
 * (ai-today/ai-review) werden erst zur Laufzeit im Client aus dem
 * Lernprofil berechnet und liegen dem Backend nicht vor; das wäre eine
 * eigene, hier nicht angeforderte Nachbau-Aufgabe der Planungs-Engine.
 */

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveDurationMinutes(s) {
  if (typeof s.durationMinutes === 'number' && s.durationMinutes > 0) return s.durationMinutes;
  return 30;
}

/** Blöcke (recurring + calendar sessions), die am gegebenen Datum sichtbar
 *  sind, angereichert um den Erledigt-Status aus block_status. */
function blocksForDate(date, recurring, oneOff, blockStatus) {
  const dateStr = toDateStr(date);
  const weekday = date.getDay();
  const result = [];

  for (const rule of recurring || []) {
    if (rule.weekday !== weekday) continue;
    if (rule.startDate && dateStr < rule.startDate) continue;
    if (rule.skipDates?.includes(dateStr)) continue;
    const id = `${rule.id}__${dateStr}`;
    result.push({
      id,
      topic: rule.topic,
      startTime: rule.startTime,
      durationMinutes: resolveDurationMinutes(rule),
      priority: rule.priority || 'mittel',
      status: blockStatus[id] || 'offen',
    });
  }

  for (const s of oneOff || []) {
    if (s.date !== dateStr) continue;
    result.push({
      id: s.id,
      topic: s.topic,
      startTime: s.startTime,
      durationMinutes: resolveDurationMinutes(s),
      priority: s.priority || 'mittel',
      status: blockStatus[s.id] || 'offen',
    });
  }

  return result;
}

/** Alle Blöcke einer Kalenderwoche (Montag–Sonntag), die `date` enthält. */
function blocksForWeek(date, recurring, oneOff, blockStatus) {
  const weekday = date.getDay(); // 0=So..6=Sa
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + mondayOffset);
  const all = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    all.push(...blocksForDate(d, recurring, oneOff, blockStatus));
  }
  return all;
}

module.exports = { toDateStr, blocksForDate, blocksForWeek };
