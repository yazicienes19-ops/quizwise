import type { Unit } from './types';

/**
 * Wichtigkeits-Signal: Inhalte, die auf Wiederholungs- oder Quizfolien
 * (practice_question) wieder auftauchen, gelten als prüfungsrelevant und
 * dürfen beim Kürzen nicht wegfallen. Erkannt über gemeinsame Fachwörter;
 * Wörter, die in vielen Einheiten stehen ("Psychologie"), zählen nicht.
 */

const STOP = new Set(['der', 'die', 'das', 'und', 'oder', 'ist', 'sind', 'was', 'wie', 'wann', 'wenn', 'eine', 'einer', 'eines', 'einen', 'nicht', 'mit', 'von', 'für', 'auf', 'aus', 'bei', 'dem', 'den', 'des', 'sich', 'auch', 'hier', 'trifft', 'welche', 'welcher', 'welches', 'bedeutet', 'begriff', 'frage', 'gibt', 'mindestens', 'beim', 'eine']);

const stems = (t: string): Set<string> => new Set(
  (t.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter(w => !STOP.has(w)).map(w => w.slice(0, 6)),
);

export const PRIORITY_MIN_SHARED = 3;
const CONTENT = new Set(['definition', 'concept', 'study', 'finding', 'example', 'list', 'comparison']);

export const markPriority = (units: Unit[]): Unit[] => {
  const questions = units.filter(u => u.type === 'practice_question');
  if (!questions.length) return units;
  const content = units.filter(u => CONTENT.has(u.type));
  const df = new Map<string, number>();
  const stemsOf = new Map(units.map(u => [u.id, stems(`${u.title ?? ''} ${u.text} ${u.answer ?? ''}`)]));
  for (const u of content) for (const s of stemsOf.get(u.id)!) df.set(s, (df.get(s) ?? 0) + 1);
  const common = (s: string) => (df.get(s) ?? 0) > Math.max(3, content.length * 0.15);
  const qStems = questions.map(q => [...stemsOf.get(q.id)!].filter(s => !common(s)));
  return units.map(u => {
    if (!CONTENT.has(u.type) || u.illustrative) return u;
    const own = stemsOf.get(u.id)!;
    const hit = qStems.some(q => q.filter(s => own.has(s)).length >= Math.min(PRIORITY_MIN_SHARED, Math.max(2, q.length)));
    return hit ? { ...u, priority: true } : u;
  });
};
