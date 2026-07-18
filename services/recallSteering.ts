import type { RecallResult } from './recallHistoryService';

/**
 * Letzte, unterschiedliche Recall-Themen als Ausschlussliste für die nächste
 * Herausforderung — damit dieselbe Quelle nicht immer wieder dieselben zwei,
 * drei auffälligsten Konzepte abfragt.
 *
 * Alt-Einträge tragen als Thema den Quellnamen (kein echtes Thema bekannt);
 * solche Einträge lassen sich über `dropNames` herausfiltern.
 */
export function recentRecallTopics(
  results: RecallResult[],
  opts?: { limit?: number; dropNames?: string[] }
): string[] {
  const limit = opts?.limit ?? 8;
  const drop = new Set((opts?.dropNames ?? []).map(n => n.trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const r of [...results].sort((a, b) => b.timestamp - a.timestamp)) {
    const topic = r.topic?.trim();
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key) || drop.has(key)) continue;
    seen.add(key);
    topics.push(topic);
    if (topics.length >= limit) break;
  }
  return topics;
}
