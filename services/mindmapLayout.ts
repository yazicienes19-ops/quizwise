import * as d3 from 'd3';
import { MindmapNode, pruneCollapsed } from './mindmapTree';

export const NODE_HEIGHT = 40;
const SIBLING_SPACING = 56;
const DEPTH_SPACING = 200;

export const estimateWidth = (text: string): number => Math.min(260, Math.max(80, text.length * 7.5 + 32));

export interface PositionedNode {
  node: MindmapNode;
  x: number;
  y: number;
  width: number;
  parentId: string | null;
}

export interface MindmapLink {
  id: string;
  d: string;
  color: string | undefined;
}

export interface MindmapLayout {
  positioned: PositionedNode[];
  links: MindmapLink[];
  colorMap: Map<string, string | undefined>;
  hasChildrenMap: Map<string, boolean>;
}

/**
 * Reine Layout-Berechnung (Positionen, Verbindungslinien, vererbte Farben) —
 * gemeinsam genutzt von der interaktiven Vorschau (MindmapCanvas.tsx) und dem
 * PNG-Export (mindmapExport.ts), damit beide exakt dieselbe Darstellung
 * berechnen und nicht auseinanderlaufen.
 */
export function computeMindmapLayout(tree: MindmapNode, untitledLabel: string): MindmapLayout {
  // Eingeklappte Äste beeinflussen nur die Darstellung, nie die Daten —
  // hasChildrenMap kommt bewusst aus dem UNGEKÜRZTEN Baum, damit ein
  // eingeklappter Knoten trotzdem sein Auf-/Zuklapp-Symbol behält.
  const visibleTree = pruneCollapsed(tree);

  const hasChildrenMap = new Map<string, boolean>();
  const walkChildren = (n: MindmapNode) => { hasChildrenMap.set(n.id, n.children.length > 0); n.children.forEach(walkChildren); };
  walkChildren(tree);

  // Eine gesetzte Farbe vererbt sich an alle Unterpunkte, bis ein Nachfahre
  // selbst eine eigene Farbe bekommt.
  const colorMap = new Map<string, string | undefined>();
  const walkColor = (n: MindmapNode, inherited: string | undefined) => {
    const effective = n.color ?? inherited;
    colorMap.set(n.id, effective);
    n.children.forEach(c => walkColor(c, effective));
  };
  walkColor(visibleTree, undefined);

  const hierarchyRoot = d3.hierarchy(visibleTree, d => d.children);
  d3.tree<MindmapNode>().nodeSize([SIBLING_SPACING, DEPTH_SPACING])(hierarchyRoot);
  const positioned: PositionedNode[] = [];
  hierarchyRoot.each(d => {
    positioned.push({
      node: d.data,
      x: d.y,
      y: d.x,
      width: estimateWidth(d.data.text || untitledLabel),
      parentId: d.parent ? d.parent.data.id : null,
    });
  });

  const byId = new Map(positioned.map(p => [p.node.id, p]));
  const linkGen = d3.linkHorizontal<unknown, { x: number; y: number }>().x(d => d.x).y(d => d.y);
  const links = positioned
    .filter(p => p.parentId)
    .map(p => {
      const parent = byId.get(p.parentId!);
      if (!parent) return null;
      const d = linkGen({
        source: { x: parent.x + parent.width / 2, y: parent.y },
        target: { x: p.x - p.width / 2, y: p.y },
      } as never);
      return d ? { id: p.node.id, d, color: colorMap.get(p.node.id) } : null;
    })
    .filter((l): l is MindmapLink => l !== null);

  return { positioned, links, colorMap, hasChildrenMap };
}
