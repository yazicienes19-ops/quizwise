/**
 * recallQuestionDedup.ts — deterministische Frage-Deduplizierung für die
 * Feynman-Methode ("Erklären üben").
 *
 * Anlass (Live-Browser-Test 2026-08-22): Zwei aufeinanderfolgende Challenges
 * waren inhaltlich nahezu identisch ("Warum ist der Fokus auf beobachtbares
 * Verhalten …" vs. "Warum ist die Konzentration auf beobachtbares Verhalten …").
 * Die Themen-Steuerung allein verhindert das nicht zuverlässig (falsches
 * Topic in der History, Modell-Ignoranz) — deshalb zusätzlich ein rein
 * deterministischer, KOSTENLOSER Ähnlichkeitscheck (kein zweiter Gemini-Call):
 *
 * - Normalisierung (Kleinbuchstaben, Satzzeichen raus, Whitespace kollabiert)
 * - Token-Menge ohne deutsche Stoppwörter → Jaccard
 * - Zeichen-Trigramme → Jaccard (robust gegen Umformulierungen/Wortstellung)
 * - Ähnlichkeit = max(beide); ab DUPLICATE_THRESHOLD gilt "zu ähnlich"
 *
 * Die zuletzt AUSGELIEFERTEN Fragen liegen in einem kleinen localStorage-
 * Ringpuffer (letzte 20) — bewusst ausgeliefert statt beantwortet: Auch eine
 * abgebrochene Challenge darf nicht sofort identisch nachkommen.
 */

const STORAGE_KEY = 'studearc_recall_recent_questions';
const MAX_QUESTIONS = 20;

/** Ab dieser Ähnlichkeit gilt eine Frage als Duplikat (max(Token- Jaccard,
 * Trigramm-Jaccard)). Empirisch kalibriert am Live-Fund vom 2026-08-22:
 * nahezu identische Fragepaare (Behaviorismus-Duplikat: 0.523, reine
 * Umformulierung: 0.571) vs. thematisch verschiedene Fragen (0.086-0.119) —
 * 0.45 liegt mit breitem Abstand zwischen beiden Klassen. */
export const DUPLICATE_THRESHOLD = 0.45;

const STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'und', 'oder', 'aber', 'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'wurde', 'wurden',
  'kann', 'können', 'muss', 'müssen', 'soll', 'sollen', 'darf', 'dürfen', 'haben', 'hat', 'hatte',
  'im', 'in', 'am', 'an', 'auf', 'aus', 'bei', 'mit', 'nach', 'von', 'vom', 'zu', 'zum', 'zur',
  'für', 'über', 'unter', 'vor', 'durch', 'gegen', 'um', 'als', 'wie', 'was', 'welche', 'welcher',
  'dieser', 'diese', 'dieses', 'sich', 'ihre', 'ihren', 'sein', 'seine', 'seinen', 'man', 'nicht',
  'auch', 'noch', 'nur', 'so', 'sehr', 'mehr', 'immer', 'wenn', 'dass', 'denn', 'jedoch', 'laut',
]);

export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(q: string): Set<string> {
  return new Set(normalizeQuestion(q).split(' ').filter(t => t.length > 2 && !STOPWORDS.has(t)));
}

function trigramSet(q: string): Set<string> {
  const s = ` ${normalizeQuestion(q)} `;
  const set = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) set.add(s.slice(i, i + 3));
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Deterministische Ähnlichkeit zweier Fragen in [0,1]. */
export function questionSimilarity(a: string, b: string): number {
  const tokens = jaccard(tokenSet(a), tokenSet(b));
  const trigrams = jaccard(trigramSet(a), trigramSet(b));
  return Math.max(tokens, trigrams);
}

/** Zu ähnlich zu einer der letzten Fragen? (Schwellwert DUPLICATE_THRESHOLD) */
export function isQuestionTooSimilar(question: string, recent: string[], threshold: number = DUPLICATE_THRESHOLD): boolean {
  const q = question.trim();
  if (!q) return false;
  return recent.some(r => r.trim() && questionSimilarity(q, r) >= threshold);
}

export interface RecentQuestionEntry { q: string; ts: number; }

export function getRecentRecallQuestions(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is RecentQuestionEntry => !!e && typeof e.q === 'string')
      .map(e => e.q);
  } catch {
    return [];
  }
}

/** Merkt sich eine ausgelieferte Frage (neueste zuerst, max. 20). */
export function rememberRecallQuestion(question: string): void {
  const q = question.trim();
  if (!q) return;
  const existing = getRecentRecallQuestions().filter(r => r !== q);
  const next: RecentQuestionEntry[] = [{ q, ts: Date.now() }, ...existing.map(r => ({ q: r, ts: 0 }))];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_QUESTIONS)));
  } catch {}
}
