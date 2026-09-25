import { FSRS_WEIGHTS, DECAY, FACTOR, setFsrsParams, type FsrsParams } from './spacedRepetition';
import type { ReviewEntry } from './reviewLog';

/**
 * FSRS an den eigenen Lernverlauf anpassen (Anki: "Parameter optimieren").
 *
 * Umgesetzt ist der erste Schritt von Ankis Optimierer, das Vortraining der
 * Startstabilitäten w0 bis w3: Für jede erste Bewertung (Nochmal, Schwer,
 * Gut, Einfach) wird geschätzt, wie lange man die Karte danach tatsächlich
 * behält, per Maximum-Likelihood über die Vergessenskurve
 * R(t, S) = (1 + F·t/S)^-0,5. Die übrigen 15 Gewichte bleiben Standard.
 * Dazu kommt die gewünschte Behaltensrate.
 */

export interface RecallPair { t: number; recalled: boolean }

const R = (t: number, s: number) => Math.pow(1 + FACTOR * t / s, DECAY);

/** Paare (Abstand, gewusst?) zwischen erster und zweiter Bewertung, je erster Note 1 bis 4. */
export const firstReviewPairs = (entries: ReviewEntry[]): Record<1 | 2 | 3 | 4, RecallPair[]> => {
  const out: Record<1 | 2 | 3 | 4, RecallPair[]> = { 1: [], 2: [], 3: [], 4: [] };
  const byCard = new Map<string, ReviewEntry[]>();
  for (const e of entries) byCard.set(e.cardId, [...(byCard.get(e.cardId) ?? []), e]);
  for (const list of byCard.values()) {
    list.sort((a, b) => a.reviewedAt - b.reviewedAt);
    const firstIdx = list.findIndex(e => e.elapsedDays === null);
    if (firstIdx < 0) continue;
    // Nächste Wiederholung mit mindestens einem halben Tag Abstand (Wiederholen am
    // selben Tag sagt nichts über das Behalten aus).
    const next = list.slice(firstIdx + 1).find(e => (e.reviewedAt - list[firstIdx].reviewedAt) / 86_400_000 >= 0.5);
    if (!next) continue;
    out[list[firstIdx].rating].push({ t: (next.reviewedAt - list[firstIdx].reviewedAt) / 86_400_000, recalled: next.rating > 1 });
  }
  return out;
};

/** Stabilität mit der größten Wahrscheinlichkeit für die beobachteten Paare (Goldener Schnitt auf log S). */
export const fitStability = (pairs: RecallPair[]): number => {
  const ll = (logS: number) => {
    const s = Math.exp(logS);
    return pairs.reduce((sum, p) => {
      const r = Math.min(1 - 1e-6, Math.max(1e-6, R(p.t, s)));
      return sum + (p.recalled ? Math.log(r) : Math.log(1 - r));
    }, 0);
  };
  let a = Math.log(0.1); let b = Math.log(365);
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a); let d = a + g * (b - a);
  for (let i = 0; i < 80; i++) {
    if (ll(c) > ll(d)) b = d; else a = c;
    c = b - g * (b - a); d = a + g * (b - a);
  }
  return Math.exp((a + b) / 2);
};

/** Ab so vielen Paaren insgesamt lohnt die Anpassung. */
export const MIN_PAIRS = 50;
/** Glättung Richtung Standard: bei wenigen Paaren je Note bleibt der Standard stärker. */
const PRIOR_WEIGHT = 16;
const MIN_PAIRS_PER_GRADE = 8;

export interface PersonalizeResult {
  ok: boolean;
  pairsUsed: number;
  perGrade: [number, number, number, number];
  initialStability: [number, number, number, number];
}

export const personalize = (entries: ReviewEntry[]): PersonalizeResult => {
  const pairs = firstReviewPairs(entries);
  const perGrade = [1, 2, 3, 4].map(g => pairs[g as 1].length) as [number, number, number, number];
  const pairsUsed = perGrade.reduce((a, b) => a + b, 0);
  const fitted = [1, 2, 3, 4].map((g, i) => {
    const n = perGrade[i];
    const prior = FSRS_WEIGHTS[i];
    if (n < MIN_PAIRS_PER_GRADE) return prior;
    const fit = fitStability(pairs[g as 1]);
    return Math.exp((n * Math.log(fit) + PRIOR_WEIGHT * Math.log(prior)) / (n + PRIOR_WEIGHT));
  });
  // Wie in Anki: bessere erste Note darf nie eine kürzere Startstabilität haben.
  for (let i = 1; i < 4; i++) fitted[i] = Math.max(fitted[i], fitted[i - 1]);
  return {
    ok: pairsUsed >= MIN_PAIRS,
    pairsUsed,
    perGrade,
    initialStability: fitted.map(s => Math.round(s * 100) / 100) as [number, number, number, number],
  };
};

// ── Speichern und anwenden ──────────────────────────────────────────────────
export const FSRS_PARAMS_KEY = 'studearc_fsrs_params';
export const RETENTION_OPTIONS = [0.8, 0.85, 0.9, 0.93, 0.95, 0.97];

export const getFsrsParams = (): FsrsParams => {
  try { return JSON.parse(localStorage.getItem(FSRS_PARAMS_KEY) || '{}') as FsrsParams; } catch { return {}; }
};

export const saveFsrsParams = (p: FsrsParams, userId?: string | null): void => {
  try { localStorage.setItem(FSRS_PARAMS_KEY, JSON.stringify(p)); } catch { /* Speicher gesperrt */ }
  setFsrsParams(p);
  if (userId) {
    import('./syncService').then(({ syncPreferences }) => syncPreferences(userId, { fsrs_params: p })).catch(() => {});
  }
};

/** Beim Start: gespeicherte Werte in die Planung übernehmen. */
export const applyStoredFsrsParams = (): void => setFsrsParams(getFsrsParams());
