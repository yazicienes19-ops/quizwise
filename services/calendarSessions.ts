import type { RecurringStudySession, CalendarStudySession, Collection, StudyEntry } from '../types';

/** Bekannte Zufallsfarben aus LibrarySystem.createCollection (Tailwind-Klassen aus der
 *  Zeit vor dem Farbwähler) auf Hex abgebildet, damit ältere Module trotzdem eine gültige
 *  CSS-Farbe für color-mix() liefern. Neu gewählte Farben sind bereits Hex-Strings. */
const LEGACY_TAILWIND_COLORS: Record<string, string> = {
  'bg-blue-500': '#3B82F6',
  'bg-emerald-500': '#10B981',
  'bg-rose-500': '#F43F5E',
  'bg-indigo-500': '#6366F1',
  'bg-amber-500': '#F59E0B',
};
export const DEFAULT_MODULE_COLOR = '#6366F1';

/** Dieselben Farbwerte wie im Accent-ColorPicker der App-Einstellungen (ColorPicker.tsx),
 *  damit Modul-Farben sich visuell in die bestehende Palette einfügen. */
export const MODULE_COLOR_SWATCHES = [
  '#D97757', '#6366F1', '#3B82F6', '#14B8A6', '#22C55E', '#F43F5E', '#8B5CF6', '#F59E0B',
];

export function resolveModuleColor(color: string | undefined): string {
  if (!color) return DEFAULT_MODULE_COLOR;
  if (color.startsWith('#')) return color;
  return LEGACY_TAILWIND_COLORS[color] ?? DEFAULT_MODULE_COLOR;
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Anzahl Kalendertage zwischen "today" und dem gegebenen Datum (0 = heute).
 * Normalisiert BEIDE Seiten auf lokale Mitternacht, bevor differenziert wird —
 * Vergleich einer exakten Uhrzeit ("today" hat z.B. 08:00) gegen ein auf 12:00
 * verankertes Zieldatum ergibt sonst je nach Tageszeit ein Off-by-one (ein
 * Termin für HEUTE zeigt vormittags fälschlich "morgen").
 */
export function daysUntilDate(dateStr: string, today: Date): number {
  const target = new Date(dateStr + 'T00:00:00');
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

export interface ResolvedSession {
  id: string;
  topic: string;
  subjectLabel: string;
  color: string;
  startTime: string;
  endTime: string;
  recurring: boolean;
  moduleId?: string;
  customSubject?: string;
  /** Bei recurring=true: id der zugrunde liegenden RecurringStudySession. */
  sourceRuleId?: string;
}

/** Alle Sessions (wiederkehrend + einmalig), die an diesem Kalendertag sichtbar sind,
 *  chronologisch sortiert. Wiederkehrende Vorkommen mit einem skipDate für dieses
 *  Datum werden ausgelassen (die Überschreibung liegt dann als eigener oneOff-Eintrag vor). */
export function sessionsForDate(
  date: Date,
  recurring: RecurringStudySession[],
  oneOff: CalendarStudySession[],
  collections: Collection[]
): ResolvedSession[] {
  const dateStr = toDateStr(date);
  const weekday = date.getDay();
  const result: ResolvedSession[] = [];

  for (const rule of recurring) {
    if (rule.weekday !== weekday) continue;
    if (rule.startDate && dateStr < rule.startDate) continue;
    if (rule.skipDates?.includes(dateStr)) continue;
    const mod = rule.moduleId ? collections.find(c => c.id === rule.moduleId) : undefined;
    result.push({
      id: `${rule.id}__${dateStr}`,
      topic: rule.topic,
      subjectLabel: mod?.name ?? rule.customSubject ?? '',
      color: resolveModuleColor(mod?.color),
      startTime: rule.startTime,
      endTime: rule.endTime,
      recurring: true,
      moduleId: rule.moduleId,
      customSubject: rule.customSubject,
      sourceRuleId: rule.id,
    });
  }

  for (const s of oneOff) {
    if (s.date !== dateStr) continue;
    const mod = s.moduleId ? collections.find(c => c.id === s.moduleId) : undefined;
    result.push({
      id: s.id,
      topic: s.topic,
      subjectLabel: mod?.name ?? s.customSubject ?? '',
      color: resolveModuleColor(mod?.color),
      startTime: s.startTime,
      endTime: s.endTime,
      recurring: false,
      moduleId: s.moduleId,
      customSubject: s.customSubject,
    });
  }

  return result.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export type SessionEditTarget =
  | { kind: 'oneoff'; id: string }
  | { kind: 'recurring'; ruleId: string };

export interface SessionFormInput {
  editing?: SessionEditTarget;
  moduleId?: string;
  customSubject?: string;
  topic: string;
  startTime: string;
  endTime: string;
  repeat: 'once' | 'weekly';
}

export interface SessionSaveResult {
  recurring: RecurringStudySession[];
  oneOff: CalendarStudySession[];
}

/**
 * Wendet das Formular-Ergebnis auf die beiden Listen an. Deckt 5 Fälle ab:
 * neu+einmalig, neu+wöchentlich, wöchentlich-Regel-bearbeiten, wiederkehrendes
 * Vorkommen auf "nur dieser Tag" reduzieren (skip + Override anlegen),
 * einmaligen Eintrag bearbeiten.
 */
export function applySessionSave(
  input: SessionFormInput,
  dateStr: string,
  weekday: number,
  recurring: RecurringStudySession[],
  oneOff: CalendarStudySession[],
  genId: () => string
): SessionSaveResult {
  const base = {
    moduleId: input.moduleId,
    customSubject: input.customSubject,
    topic: input.topic,
    startTime: input.startTime,
    endTime: input.endTime,
  };

  const editing = input.editing;

  if (input.repeat === 'weekly') {
    if (editing?.kind === 'recurring') {
      const ruleId = editing.ruleId;
      return {
        recurring: recurring.map(r => (r.id === ruleId ? { ...r, ...base } : r)),
        oneOff,
      };
    }
    const newRule: RecurringStudySession = { id: genId(), weekday, startDate: dateStr, ...base };
    return {
      recurring: [...recurring, newRule],
      oneOff: editing?.kind === 'oneoff' ? oneOff.filter(s => s.id !== editing.id) : oneOff,
    };
  }

  // repeat === 'once'
  if (editing?.kind === 'recurring') {
    const ruleId = editing.ruleId;
    return {
      recurring: recurring.map(r =>
        r.id === ruleId ? { ...r, skipDates: [...(r.skipDates ?? []), dateStr] } : r
      ),
      oneOff: [...oneOff, { id: genId(), date: dateStr, ...base }],
    };
  }
  if (editing?.kind === 'oneoff') {
    const oneOffId = editing.id;
    return {
      recurring,
      oneOff: oneOff.map(s => (s.id === oneOffId ? { ...s, date: dateStr, ...base } : s)),
    };
  }
  return {
    recurring,
    oneOff: [...oneOff, { id: genId(), date: dateStr, ...base }],
  };
}

const GERMAN_DAY_TO_WEEKDAY: Record<string, number> = {
  Sonntag: 0, Montag: 1, Dienstag: 2, Mittwoch: 3, Donnerstag: 4, Freitag: 5, Samstag: 6,
};

/** Nächstes Datum (inkl. heute) für einen gegebenen Wochentag (0=So..6=Sa). */
export function nextDateForWeekday(from: Date, weekday: number): Date {
  const fromWeekday = from.getDay();
  let diff = weekday - fromWeekday;
  if (diff < 0) diff += 7;
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + diff);
}

/** Einmalige Migration des entfernten manuellen Wochenplan-Tabs (StudyEntry, wochentag-
 *  basiert, localStorage 'study_plan') in das neue datumsechte System. completed/color/
 *  isAutoGenerated haben im neuen Modell keine Entsprechung (kein Fortschritts-Flag, Farbe
 *  kommt vom Modul) und werden bewusst nicht übernommen — reiner Struktur-Transfer von
 *  Fach/Thema/Uhrzeit/Wochentag, damit bestehende Blöcke nach dem Tab-Wegfall nicht
 *  unsichtbar verloren gehen. */
export function migrateStudyEntriesToRecurring(
  entries: StudyEntry[],
  genId: () => string
): RecurringStudySession[] {
  return entries
    .filter(e => GERMAN_DAY_TO_WEEKDAY[e.day] !== undefined)
    .map(e => ({
      id: genId(),
      weekday: GERMAN_DAY_TO_WEEKDAY[e.day],
      customSubject: e.subject,
      topic: e.topic,
      startTime: e.startTime,
      endTime: e.endTime,
    }));
}

export interface SmartPlanEntry {
  day: string;
  /** YYYY-MM-DD, falls Gemini es mitliefert; sonst zählt nur "day". */
  date?: string;
  subject: string;
  topic: string;
  startTime: string;
  endTime: string;
}

/** Rahmen für den Smart-Plan: Lernzeit 08 bis 20 Uhr, Blöcke 60 bis 120 Minuten
 *  (notfalls auf 45 gekürzt, wenn nur noch eine kleinere Lücke frei ist), 15 Minuten
 *  Abstand zu anderen Einträgen, heute frühestens 30 Minuten ab jetzt. */
const PLAN_DAY_START = 8 * 60;
const PLAN_DAY_END = 20 * 60;
const PLAN_MIN_BLOCK = 60;
const PLAN_MAX_BLOCK = 120;
const PLAN_SHORTEST_BLOCK = 45;
const PLAN_BUFFER = 15;
const PLAN_LEAD_TODAY = 30;
const PLAN_MAX_PER_DAY = 3;

export interface TimeWindow { start: number; end: number }

export interface DayAvailability {
  date: string;
  /** Deutscher Wochentag, wie ihn der Prompt im Feld "day" verlangt. */
  day: string;
  free: TimeWindow[];
}

const WEEKDAY_TO_GERMAN_DAY = Object.fromEntries(
  Object.entries(GERMAN_DAY_TO_WEEKDAY).map(([name, idx]) => [idx, name])
) as Record<number, string>;

export function timeToMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Nimmt [start, end) aus den freien Fenstern heraus. */
function subtractWindow(free: TimeWindow[], start: number, end: number): TimeWindow[] {
  const result: TimeWindow[] = [];
  for (const w of free) {
    if (end <= w.start || start >= w.end) { result.push(w); continue; }
    if (start > w.start) result.push({ start: w.start, end: start });
    if (end < w.end) result.push({ start: end, end: w.end });
  }
  return result;
}

/**
 * Freie Zeitfenster der nächsten Tage (heute eingeschlossen). Belegt sind alle
 * festen und manuellen Einträge samt 15 Minuten Abstand. Künftige Einträge eines
 * früheren Smart-Plans zählen nicht, weil der neue Plan sie ersetzt. Heute beginnt
 * frühestens 30 Minuten nach "now", auf die nächste Viertelstunde gerundet.
 */
export function buildPlanAvailability(
  now: Date,
  recurring: RecurringStudySession[],
  oneOff: CalendarStudySession[],
  collections: Collection[],
  days = 7,
): DayAvailability[] {
  const manual = oneOff.filter(s => !s.fromSmartPlan);
  const result: DayAvailability[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    let earliest = PLAN_DAY_START;
    if (i === 0) {
      const lead = now.getHours() * 60 + now.getMinutes() + PLAN_LEAD_TODAY;
      earliest = Math.max(PLAN_DAY_START, Math.ceil(lead / 15) * 15);
    }
    let free: TimeWindow[] = earliest < PLAN_DAY_END ? [{ start: earliest, end: PLAN_DAY_END }] : [];
    for (const s of sessionsForDate(date, recurring, manual, collections)) {
      const start = timeToMinutes(s.startTime);
      const end = timeToMinutes(s.endTime);
      if (start === null || end === null || end <= start) continue;
      free = subtractWindow(free, start - PLAN_BUFFER, end + PLAN_BUFFER);
    }
    result.push({
      date: toDateStr(date),
      day: WEEKDAY_TO_GERMAN_DAY[date.getDay()],
      free: free.filter(w => w.end - w.start >= PLAN_SHORTEST_BLOCK),
    });
  }
  return result;
}

/** Für den Prompt: freie Fenster als "08:00-12:30". */
export function availabilityForPrompt(availability: DayAvailability[]): { date: string; day: string; free: string[] }[] {
  return availability.map(a => ({
    date: a.date,
    day: a.day,
    free: a.free.map(w => `${minutesToTime(w.start)}-${minutesToTime(w.end)}`),
  }));
}

const ROMAN_NUMERALS: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
};

/** "Statistik I" und "statistik 1" werden gleich, "Statistik II" bleibt verschieden. */
export function normalizeSubjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,:;!?()[\]{}"'/\\_–—-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => ROMAN_NUMERALS[token] ?? token)
    .join(' ');
}

/** Fach zu Modul: erst genauer Name, dann normalisiert. Nur ein eindeutiger Treffer zählt. */
export function matchSubjectToCollection(subject: string, collections: Collection[]): Collection | undefined {
  const exact = collections.filter(c => c.name.trim().toLowerCase() === subject.trim().toLowerCase());
  if (exact.length === 1) return exact[0];
  const target = normalizeSubjectName(subject);
  if (!target) return undefined;
  const normalized = collections.filter(c => normalizeSubjectName(c.name) === target);
  return normalized.length === 1 ? normalized[0] : undefined;
}

/** Sucht für einen Block der Länge "duration" einen Platz: zuerst ab der
 *  gewünschten Startzeit, sonst im frühesten passenden Fenster, sonst gekürzt
 *  im größten Fenster (mindestens 45 Minuten). */
function placeBlock(free: TimeWindow[], wantedStart: number, duration: number): TimeWindow | null {
  const sorted = [...free].sort((a, b) => a.start - b.start);
  for (const w of sorted) {
    const start = Math.max(w.start, wantedStart);
    if (start + duration <= w.end) return { start, end: start + duration };
  }
  for (const w of sorted) {
    if (w.end - w.start >= duration) return { start: w.start, end: w.start + duration };
  }
  const largest = sorted.reduce<TimeWindow | null>((best, w) => (!best || w.end - w.start > best.end - best.start ? w : best), null);
  if (largest && largest.end - largest.start >= PLAN_SHORTEST_BLOCK) {
    return { start: largest.start, end: largest.start + Math.min(duration, largest.end - largest.start) };
  }
  return null;
}

/**
 * Bildet Geminis Vorschläge auf echte Kalendereinträge ab und verlässt sich dabei
 * nicht auf den Prompt: Jeder Block landet nur in einem freien Fenster (keine
 * Überschneidung mit festen oder manuellen Einträgen, nichts in der Vergangenheit),
 * wird auf 60 bis 120 Minuten gebracht, notfalls verschoben oder verworfen, und
 * Smart-Plan-Blöcke überschneiden sich nicht gegenseitig. Höchstens 3 pro Tag.
 * Tag: "date" aus der Antwort, wenn es im Planungszeitraum liegt, sonst der
 * nächste passende Wochentag.
 * Inhalt: Gibt es Module, zählen nur Blöcke, die einem Modul zugeordnet werden
 * können. Ein Thema bleibt nur stehen, wenn es eine bekannte Schwäche aus dem
 * Lernfortschritt ist (weakTopics); sonst trägt der Eintrag nur den Modulnamen.
 */
export function mapSmartPlanToCalendarSessions(
  entries: SmartPlanEntry[],
  availability: DayAvailability[],
  collections: Collection[],
  genId: () => string,
  weakTopics: string[] = [],
): CalendarStudySession[] {
  const weakByName = new Map(weakTopics.map(topic => [normalizeSubjectName(topic), topic]));
  const freeByDate = new Map(availability.map(a => [a.date, [...a.free]]));
  const countByDate = new Map<string, number>();
  const resolveDate = (entry: SmartPlanEntry): string | undefined => {
    if (entry.date && freeByDate.has(entry.date)) return entry.date;
    return availability.find(a => a.day === entry.day?.trim())?.date;
  };

  const prepared = entries
    .map(entry => ({ entry, date: resolveDate(entry), start: timeToMinutes(entry.startTime ?? ''), end: timeToMinutes(entry.endTime ?? '') }))
    .filter((e): e is { entry: SmartPlanEntry; date: string; start: number; end: number | null } => !!e.date && e.start !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

  const result: CalendarStudySession[] = [];
  for (const { entry, date, start, end } of prepared) {
    if ((countByDate.get(date) ?? 0) >= PLAN_MAX_PER_DAY) continue;
    const match = matchSubjectToCollection(entry.subject ?? '', collections);
    if (!match && collections.length > 0) continue;
    const wanted = end !== null && end > start ? end - start : PLAN_MIN_BLOCK;
    const duration = Math.min(PLAN_MAX_BLOCK, Math.max(PLAN_MIN_BLOCK, wanted));
    const free = freeByDate.get(date)!;
    const slot = placeBlock(free, start, duration);
    if (!slot) continue;
    freeByDate.set(date, subtractWindow(free, slot.start - PLAN_BUFFER, slot.end + PLAN_BUFFER));
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1);

    result.push({
      id: genId(),
      date,
      moduleId: match?.id,
      customSubject: match ? undefined : entry.subject,
      topic: weakByName.get(normalizeSubjectName(entry.topic ?? '')) ?? '',
      startTime: minutesToTime(slot.start),
      endTime: minutesToTime(slot.end),
      fromSmartPlan: true,
    });
  }

  return result;
}

/**
 * Ersetzt künftige Sessions eines früheren Smart-Plans durch den neuen Plan.
 * Vorher hängte jeder Klick auf "Smart Plan" nur an: zwei Klicks ergaben
 * doppelte Sessions an denselben Tagen. Manuell angelegte und vergangene
 * Sessions bleiben unberührt.
 */
export function replaceSmartPlanSessions(
  existing: CalendarStudySession[],
  planned: CalendarStudySession[],
  todayStr: string,
): { sessions: CalendarStudySession[]; replaced: number } {
  const kept = existing.filter(s => !(s.fromSmartPlan && s.date >= todayStr));
  return { sessions: [...kept, ...planned], replaced: existing.length - kept.length };
}
