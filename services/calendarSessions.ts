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

/** Wochentage (0=So..6=Sa), an denen bereits eine feste RecurringStudySession liegt —
 *  Kontext für den Smart-Plan-Prompt UND deterministischer Ausschluss danach (verlässt
 *  sich nicht allein darauf, dass die KI die Prompt-Anweisung befolgt). */
export function fixedWeekdaysFromRecurring(
  recurring: RecurringStudySession[],
  collections: Collection[]
): { day: string; subject: string }[] {
  const dayNames = Object.entries(GERMAN_DAY_TO_WEEKDAY).reduce<Record<number, string>>((acc, [name, idx]) => {
    acc[idx] = name;
    return acc;
  }, {});
  return recurring.map(r => {
    const mod = r.moduleId ? collections.find(c => c.id === r.moduleId) : undefined;
    return { day: dayNames[r.weekday], subject: mod?.name ?? r.customSubject ?? '' };
  });
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
  subject: string;
  topic: string;
  startTime: string;
  endTime: string;
}

/**
 * Bildet den Gemini-Wochenplan (Wochentag-Namen, kein Datum) auf konkrete
 * CalendarStudySession-Einträge ab: nächstes passendes Datum ab "today",
 * Fach wird gegen vorhandene Module abgeglichen (exakter Namenstreffer),
 * Tage mit bereits fester Wiederholung werden komplett übersprungen
 * (unabhängig davon, ob die KI die Prompt-Anweisung befolgt hat).
 */
export function mapSmartPlanToCalendarSessions(
  entries: SmartPlanEntry[],
  today: Date,
  collections: Collection[],
  recurring: RecurringStudySession[],
  genId: () => string
): CalendarStudySession[] {
  const blockedWeekdays = new Set(recurring.map(r => r.weekday));
  const result: CalendarStudySession[] = [];

  for (const entry of entries) {
    const weekday = GERMAN_DAY_TO_WEEKDAY[entry.day];
    if (weekday === undefined || blockedWeekdays.has(weekday)) continue;
    const date = nextDateForWeekday(today, weekday);
    const match = collections.find(c => c.name.trim().toLowerCase() === entry.subject.trim().toLowerCase());
    result.push({
      id: genId(),
      date: toDateStr(date),
      moduleId: match?.id,
      customSubject: match ? undefined : entry.subject,
      topic: entry.topic,
      startTime: entry.startTime,
      endTime: entry.endTime,
    });
  }

  return result;
}
