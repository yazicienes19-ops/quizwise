import type { RecurringStudySession, CalendarStudySession, Collection } from '../types';

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
    const newRule: RecurringStudySession = { id: genId(), weekday, ...base };
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
