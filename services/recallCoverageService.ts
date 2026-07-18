// Themen-Abdeckung für die Feynman-Methode: pro Dokument wird gemerkt, welche
// Kapitel-Themen schon einmal abgefragt wurden. Solange etwas fehlt, wählt die
// KI aus den offenen Kapiteln — erst danach übernimmt die adaptive Vertiefung
// (Schwächen zuerst). localStorage-first wie überall, kein Cloud-Sync (v1).

const STORAGE_KEY = 'quizwise_recall_coverage_v1';
const MAX_TOPICS_PER_DOC = 200;

type CoverageMap = Record<string, string[]>;

const readMap = (): CoverageMap => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};

const writeMap = (map: CoverageMap): void => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
};

// Markdown-Präfixe fliegen raus: die KI gibt "## Ursprung" als "Ursprung" zurück,
// der Abgleich muss das trotzdem als dasselbe Thema erkennen.
const norm = (s: string) => s.trim().replace(/^#{1,6}\s*/, '').trim().toLowerCase();

export interface RecallCoverage {
  /** Kapitel-Themen, die noch nie abgefragt wurden — in Dokumentreihenfolge. */
  uncovered: string[];
  coveredCount: number;
  total: number;
}

export function getCoverage(docId: string, chapterTitles: string[]): RecallCoverage {
  const titles = chapterTitles.map(t => t.trim()).filter(Boolean);
  const covered = new Set(readMap()[docId]?.map(norm) ?? []);
  const uncovered = titles.filter(t => !covered.has(norm(t)));
  return { uncovered, coveredCount: titles.length - uncovered.length, total: titles.length };
}

export function markTopicCovered(docId: string, topic: string): void {
  const clean = topic.trim();
  if (!docId || !clean) return;
  const map = readMap();
  const list = map[docId] ?? [];
  if (list.some(t => norm(t) === norm(clean))) return;
  map[docId] = [...list, clean].slice(-MAX_TOPICS_PER_DOC);
  writeMap(map);
}
