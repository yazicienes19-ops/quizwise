import type { GraphNodeSummary } from './types';

/**
 * In-Memory-Substring-Suche über bereits geladene GraphNodeSummary-Objekte
 * (Titel, Tags) — Grundlage der künftigen ⌘K-Befehlsleiste.
 *
 * Bei "hunderten" Nodes (realistische Phase-1-Größenordnung) ist eine echte
 * Suchmaschine verfrühte Komplexität. Sollte Volltextsuche über description/
 * notes bei tausenden Nodes je nötig werden, ist der natürliche nächste
 * Schritt Postgres' eingebaute Volltextsuche (tsvector-Spalte + GIN-Index)
 * serverseitig — s. KNOWLEDGE_GRAPH_PHASE1_PLAN.md, hier bewusst nicht gebaut.
 */

export type SearchMatchReason = 'title-exact' | 'title-prefix' | 'title-contains' | 'tag-exact' | 'tag-contains';

export interface GraphSearchResult {
  node: GraphNodeSummary;
  score: number;
  matchedOn: SearchMatchReason;
}

const SCORES: Record<SearchMatchReason, number> = {
  'title-exact': 100,
  'title-prefix': 80,
  'title-contains': 60,
  'tag-exact': 50,
  'tag-contains': 40,
};

function bestMatch(node: GraphNodeSummary, normalizedQuery: string): { reason: SearchMatchReason } | undefined {
  const title = node.title.trim().toLowerCase();

  if (title === normalizedQuery) return { reason: 'title-exact' };
  if (title.startsWith(normalizedQuery)) return { reason: 'title-prefix' };
  if (title.includes(normalizedQuery)) return { reason: 'title-contains' };

  for (const tag of node.tags) {
    const normalizedTag = tag.trim().toLowerCase();
    if (normalizedTag === normalizedQuery) return { reason: 'tag-exact' };
  }
  for (const tag of node.tags) {
    if (tag.trim().toLowerCase().includes(normalizedQuery)) return { reason: 'tag-contains' };
  }

  return undefined;
}

/**
 * Leere/nur-Leerzeichen-Anfragen liefern bewusst KEINE Ergebnisse (keine
 * "letzte Nodes"-Heuristik ohne Nutzungsverlauf-Tracking, das wäre eine
 * eigene, hier nicht geplante Funktion) — die Befehlsleiste zeigt vor der
 * ersten Eingabe entsprechend nichts oder einen eigenen Leerzustand.
 */
export function searchNodes(nodes: GraphNodeSummary[], query: string, limit = 20): GraphSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return [];

  const results: GraphSearchResult[] = [];
  for (const node of nodes) {
    const match = bestMatch(node, normalizedQuery);
    if (match) results.push({ node, score: SCORES[match.reason], matchedOn: match.reason });
  }

  results.sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title));
  return results.slice(0, limit);
}
