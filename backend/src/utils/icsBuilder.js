// Baut einen .ics-Feed (RFC 5545) aus den drei Kalender-Datenquellen des
// Studienplaners — für den Handy-Kalender-Sync (öffentlicher Abo-Link,
// s. routes/calendarFeed.js). Bewusst "floating time" (kein TZID/Z-Suffix):
// die im Studienplaner eingegebenen Uhrzeiten sind bereits Nutzer-Wandzeit,
// ein Zeitzonen-Offset würde sie beim Sync verschieben.

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** RFC 5545 TEXT-Escaping: Backslash zuerst, sonst würden später eingefügte
 *  Escapes selbst nochmal escaped. */
function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Zeilen >75 Oktette müssen laut RFC gefaltet werden (Fortsetzung mit
 *  einem einzelnen Leerzeichen eingerückt) — Sicherheitsnetz für lange
 *  Freitext-Themen, in der Praxis meist ein No-Op. */
function foldLine(line) {
  const bytes = Buffer.byteLength(line, 'utf8');
  if (bytes <= 75) return line;
  const out = [];
  let rest = line;
  let first = true;
  while (Buffer.byteLength(rest, 'utf8') > (first ? 75 : 74)) {
    let cut = first ? 75 : 74;
    // Nie mitten in einem Mehrbyte-Zeichen schneiden.
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > (first ? 75 : 74)) cut--;
    out.push((first ? '' : ' ') + rest.slice(0, cut));
    rest = rest.slice(cut);
    first = false;
  }
  out.push(' ' + rest);
  return out.join('\r\n');
}

const pad = (n) => String(n).padStart(2, '0');

/** YYYY-MM-DD + "HH:MM" → lokale ICS-DATE-TIME (YYYYMMDDTHHMMSS, ohne Z/TZID). */
function toIcsDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  const [hh, mm] = (timeStr || '00:00').split(':');
  return `${y}${m}${d}T${pad(hh)}${pad(mm)}00`;
}

function toIcsDate(dateStr) {
  return dateStr.replaceAll('-', '');
}

/** Datum um n Tage verschieben, ohne Zeitzonen-Sprünge (reine Kalenderarithmetik). */
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Erstes Vorkommen eines Wochentags an/nach referenceDate. */
function firstOccurrenceOnOrAfter(referenceDate, weekday) {
  const [y, m, d] = referenceDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const diff = (weekday - dt.getUTCDay() + 7) % 7;
  return addDays(referenceDate, diff);
}

function subjectLabel(session, collectionNameById) {
  if (session.customSubject?.trim()) return session.customSubject.trim();
  if (session.moduleId && collectionNameById.get(session.moduleId)) return collectionNameById.get(session.moduleId);
  return null;
}

function eventTitle(session, collectionNameById) {
  const subject = subjectLabel(session, collectionNameById);
  return subject ? `${subject}: ${session.topic}` : session.topic;
}

function buildEvent(lines, { uid, dtstamp, dtstart, dtend, summary, rrule, exdates, allDay }) {
  lines.push('BEGIN:VEVENT');
  lines.push(foldLine(`UID:${uid}@studearc.com`));
  lines.push(`DTSTAMP:${dtstamp}`);
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dtstart}`);
    if (dtend) lines.push(`DTEND;VALUE=DATE:${dtend}`);
  } else {
    lines.push(`DTSTART:${dtstart}`);
    if (dtend) lines.push(`DTEND:${dtend}`);
  }
  if (rrule) lines.push(`RRULE:${rrule}`);
  (exdates || []).forEach(ex => lines.push(`EXDATE:${ex}`));
  lines.push(foldLine(`SUMMARY:${escapeText(summary)}`));
  lines.push('END:VEVENT');
}

/**
 * @param {{examTerms: any[], recurringSessions: any[], calendarSessions: any[], collections: {id:string, name:string}[]}} data
 * @returns {string} vollständiger .ics-Feed-Inhalt (CRLF-Zeilenenden)
 */
function buildIcsFeed({ examTerms = [], recurringSessions = [], calendarSessions = [], collections = [] }) {
  const collectionNameById = new Map(collections.map(c => [c.id, c.name]));
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//StudeArc//Studienplaner//DE');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(foldLine('X-WR-CALNAME:StudeArc Studienplaner'));

  examTerms.forEach(exam => {
    buildEvent(lines, {
      uid: `exam-${exam.id}`,
      dtstamp,
      dtstart: toIcsDate(exam.date),
      dtend: toIcsDate(addDays(exam.date, 1)),
      summary: `📝 ${exam.title}`,
      allDay: true,
    });
  });

  recurringSessions.forEach(session => {
    const reference = session.startDate || addDays(todayStr(), -56); // ~8 Wochen Vorlauf für Verlauf im Kalender
    const firstDate = firstOccurrenceOnOrAfter(reference, session.weekday);
    const exdates = (session.skipDates || [])
      .filter(d => d >= reference)
      .map(d => toIcsDateTime(d, session.startTime));
    buildEvent(lines, {
      uid: `recurring-${session.id}`,
      dtstamp,
      dtstart: toIcsDateTime(firstDate, session.startTime),
      dtend: toIcsDateTime(firstDate, session.endTime),
      summary: eventTitle(session, collectionNameById),
      rrule: `FREQ=WEEKLY;BYDAY=${WEEKDAY_CODES[session.weekday]}`,
      exdates,
    });
  });

  calendarSessions.forEach(session => {
    buildEvent(lines, {
      uid: `session-${session.id}`,
      dtstamp,
      dtstart: toIcsDateTime(session.date, session.startTime),
      dtend: toIcsDateTime(session.date, session.endTime),
      summary: eventTitle(session, collectionNameById),
    });
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

module.exports = { buildIcsFeed };
