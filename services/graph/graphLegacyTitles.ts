import type { GraphNode, GraphState } from './types';
import { updateNode } from './graphMutationService';

/**
 * Frühere Standardtitel neu angelegter Konzepte. Seit der Umbenennung von
 * "Node" zu "Konzept" (Audit 23.09.2026) legt die App "Neues Konzept" an,
 * ältere Netze enthalten aber noch Konzepte mit diesen Titeln.
 */
const LEGACY_DEFAULT_TITLES = new Set(['neuer node', 'new node', 'neuer knoten', 'yeni düğüm', 'yeni node']);

export function isLegacyDefaultTitle(title: string): boolean {
  return LEGACY_DEFAULT_TITLES.has(title.trim().toLowerCase());
}

/**
 * Benennt aktive Konzepte mit altem Standardtitel in `replacement` um.
 * Liefert den neuen Zustand und die geänderten Konzepte, damit der Aufrufer
 * sie wie jede andere Änderung speichert (einmalig, danach greift nichts mehr).
 */
export function renameLegacyDefaultTitles(state: GraphState, replacement: string): { state: GraphState; renamed: GraphNode[] } {
  let next = state;
  const renamed: GraphNode[] = [];
  for (const node of state.nodesById.values()) {
    if (node.archivedAt !== undefined || !isLegacyDefaultTitle(node.title)) continue;
    const result = updateNode(next, node.id, { title: replacement });
    if (result.error || !result.entity) continue;
    next = result.state;
    renamed.push(result.entity);
  }
  return { state: next, renamed };
}
