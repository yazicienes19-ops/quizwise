import type { FlashcardDeck } from '../types';
import { isCardDue } from './spacedRepetition';
import type { ReviewEntry } from './reviewLog';

/** Reine Auswertungen für die Statistik (Heatmap, Prognose, Serie). */

const DAY_MS = 24 * 60 * 60 * 1000;
export const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Heatmap: Wochen-Spalten (Montag oben), älteste links, bis heute. */
export const heatmapWeeks = (counts: Map<string, number>, weeks: number, now: number = Date.now()) => {
  const today = startOfDay(now);
  const weekday = (new Date(today).getDay() + 6) % 7; // Montag = 0
  const firstMonday = today - (weekday + (weeks - 1) * 7) * DAY_MS;
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    // Tagesweise weiterzählen statt Millisekunden addieren: Sommerzeit-Wechsel verschieben sonst den Tag.
    const date = new Date(firstMonday); date.setDate(date.getDate() + w * 7 + d);
    const t = date.getTime();
    return { key: dayKey(t), count: t > today ? -1 : counts.get(dayKey(t)) ?? 0 };
  }));
};

/** Stufe 0 bis 4 für die Farbe eines Heatmap-Feldes. */
export const heatLevel = (count: number): number =>
  count <= 0 ? 0 : count < 10 ? 1 : count < 30 ? 2 : count < 60 ? 3 : 4;

/** Tage in Folge mit mindestens einer Wiederholung, bis heute (oder gestern, wenn heute noch nichts). */
export const reviewStreak = (counts: Map<string, number>, now: number = Date.now()): number => {
  const d = new Date(startOfDay(now));
  if (!counts.get(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (counts.get(dayKey(d.getTime()))) { n++; d.setDate(d.getDate() - 1); }
  return n;
};

/** Fällige Karten je Tag der nächsten `days` Tage; Überfälliges zählt heute. */
export const dueForecast = (decks: Pick<FlashcardDeck, 'cards'>[], days: number, now: number = Date.now()): number[] => {
  const today = startOfDay(now);
  const out = new Array<number>(days).fill(0);
  for (const deck of decks) for (const c of deck.cards) {
    if (c.suspended) continue;
    const next = Math.max(c.srs?.nextReview ?? now, c.buriedUntil ?? 0);
    if (next <= now && isCardDue(c, now)) { out[0]++; continue; }
    const idx = Math.floor((startOfDay(next) - today) / DAY_MS);
    if (idx >= 0 && idx < days) out[idx]++;
  }
  return out;
};

export const reviewsSince = (entries: ReviewEntry[], since: number) => entries.filter(e => e.reviewedAt >= since).length;
