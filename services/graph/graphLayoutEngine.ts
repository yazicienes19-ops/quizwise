import * as d3 from 'd3';
import type { GraphNodePosition } from './types';

/**
 * Reine Layout-Berechnung, kein React, kein DOM-Zugriff. d3-force statt
 * d3.tree() (wie im alten MindmapCanvas.tsx) — ein Wissensgraph ist kein
 * Baum, verträgt aber ein Kraft-Layout gut, s. Konzeptdokument Abschnitt 11.
 *
 * Zentrale Regel (bindend, Konzeptdokument Abschnitt 11): "manuelle Position
 * ist die Wahrheit" — ein Node mit einer bereits unterscheidbaren Position
 * wird NIE automatisch verschoben, nur beim expliziten, nutzerausgelösten
 * "Automatisch anordnen" (computeForceLayout ohne fixedIds-Filter, eine
 * spätere UI-Aktion, kein automatischer Hintergrundprozess). Was diese Datei
 * automatisch beim Laden anwenden darf, ist ausschließlich das Entzerren
 * exakt überlappender Nodes (resolveOverlaps) — die haben per Definition
 * noch keine unterscheidbare, absichtliche Position.
 */

export interface LayoutNodeInput {
  id: string;
  position: GraphNodePosition;
  pinned: boolean;
}

export interface LayoutEdgeInput {
  sourceNodeId: string;
  targetNodeId: string;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
}

const SIM_TICKS = 300;
const LINK_DISTANCE = 140;
const CHARGE_STRENGTH = -300;
const COLLIDE_RADIUS = LINK_DISTANCE / 2;

/**
 * Einmalige, statische Kraft-Layout-Berechnung — keine laufende, animierte
 * Simulation. Läuft synchron `SIM_TICKS` Schritte und liest dann die
 * konvergierten Positionen aus (etabliertes d3-force-Muster für nicht-
 * interaktive Layouts). Nodes in `fixedIds` (oder mit `pinned: true`) bleiben
 * exakt an ihrer Ausgangsposition — Grundlage dafür, dass resolveOverlaps
 * gezielt nur einen Teil des Graphen umordnen kann, ohne den Rest zu bewegen.
 */
export function computeForceLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  fixedIds: ReadonlySet<string> = new Set(),
): Map<string, GraphNodePosition> {
  if (nodes.length === 0) return new Map();

  const simNodes: SimNode[] = nodes.map(n => {
    const fixed = n.pinned || fixedIds.has(n.id);
    return {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      fx: fixed ? n.position.x : null,
      fy: fixed ? n.position.y : null,
    };
  });

  const nodeIds = new Set(nodes.map(n => n.id));
  const simLinks = edges
    .filter(e => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId))
    .map(e => ({ source: e.sourceNodeId, target: e.targetNodeId }));

  const simulation = d3
    .forceSimulation(simNodes)
    .force('link', d3.forceLink(simLinks as d3.SimulationLinkDatum<SimNode>[]).id((d: d3.SimulationNodeDatum) => (d as SimNode).id).distance(LINK_DISTANCE))
    .force('charge', d3.forceManyBody().strength(CHARGE_STRENGTH))
    .force('collide', d3.forceCollide(COLLIDE_RADIUS))
    .force('center', d3.forceCenter(0, 0))
    .stop();

  for (let i = 0; i < SIM_TICKS; i++) simulation.tick();

  return new Map(simNodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}

/** Grundlage für "alles einpassen" beim ersten Laden/Fit-View. `undefined`
 *  bei leerer Eingabe statt eines sinnlosen (Infinity/-Infinity)-Rechtecks. */
export function computeBounds(
  positions: Map<string, GraphNodePosition>,
  padding = 80,
): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
  if (positions.size === 0) return undefined;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}

const POSITION_EPSILON = 0.01;
const samePosition = (a: GraphNodePosition, b: GraphNodePosition): boolean =>
  Math.abs(a.x - b.x) < POSITION_EPSILON && Math.abs(a.y - b.y) < POSITION_EPSILON;

/**
 * Gruppiert Nodes, die (nahezu) exakt an derselben Position sitzen — typisch
 * für mehrere frisch angelegte/importierte Nodes ohne individuelle
 * Platzierung. Gepinnte Nodes werden nie gruppiert (ihre Position ist per
 * Definition absichtlich gesetzt), eine Gruppengröße von 1 zählt nicht als
 * Überlappung und wird nicht zurückgegeben.
 */
export function findOverlapClusters(nodes: LayoutNodeInput[]): string[][] {
  const candidates = nodes.filter(n => !n.pinned);
  const used = new Set<string>();
  const clusters: string[][] = [];

  for (const node of candidates) {
    if (used.has(node.id)) continue;
    const cluster = candidates.filter(other => !used.has(other.id) && samePosition(other.position, node.position));
    if (cluster.length > 1) {
      cluster.forEach(c => used.add(c.id));
      clusters.push(cluster.map(c => c.id));
    }
  }
  return clusters;
}

/**
 * Entzerrt NUR exakt überlappende, nicht gepinnte Nodes — alle anderen
 * (bereits unterscheidbar positioniert, oder gepinnt) bleiben exakt an ihrer
 * Position und dienen der Simulation als Anker. Das ist bewusst KEIN
 * generelles Auto-Layout bei jedem Laden, s. Datei-Kommentar oben.
 */
export function resolveOverlaps(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): Map<string, GraphNodePosition> {
  const positions = new Map(nodes.map(n => [n.id, n.position]));
  const clusters = findOverlapClusters(nodes);
  if (clusters.length === 0) return positions;

  const clusteredIds = new Set(clusters.flat());
  const fixedIds = new Set(nodes.filter(n => !clusteredIds.has(n.id)).map(n => n.id));

  // Deterministischer Jitter für exakt überlappende Startpositionen — ohne
  // ihn wäre die Abstoßungsrichtung bei Distanz 0 numerisch unentschieden.
  let jitterIndex = 0;
  const jitteredNodes = nodes.map(n => {
    if (!clusteredIds.has(n.id)) return n;
    const angle = jitterIndex * 2.4; // goldener-Winkel-artige Streuung, keine Überlappung der Jitter-Richtungen
    const radius = 1 + jitterIndex * 0.5;
    jitterIndex += 1;
    return { ...n, position: { x: n.position.x + Math.cos(angle) * radius, y: n.position.y + Math.sin(angle) * radius } };
  });

  const laidOut = computeForceLayout(jitteredNodes, edges, fixedIds);
  for (const id of clusteredIds) {
    const pos = laidOut.get(id);
    if (pos) positions.set(id, pos);
  }
  return positions;
}

/** Platzbedarf eines Nodes auf der Fläche: Mittelpunkt plus Halbachsen der Kapsel. */
export interface NodeFootprint {
  position: GraphNodePosition;
  rx: number;
  ry: number;
}

/** Mindestabstand zwischen zwei Kapseln, damit Ränder und Verbindungspunkte frei bleiben. */
export const NODE_GAP = 16;
const SEARCH_STEP = 10;
const SEARCH_RINGS = 80;

function overlaps(pos: GraphNodePosition, rx: number, ry: number, other: NodeFootprint, gap: number): boolean {
  const dx = (pos.x - other.position.x) / (rx + other.rx + gap);
  const dy = (pos.y - other.position.y) / (ry + other.ry + gap);
  return dx * dx + dy * dy < 1;
}

/**
 * Nächster freier Platz für GENAU EINEN Node, den der Nutzer gerade selbst
 * platziert (anlegen, loslassen nach dem Ziehen, breiter durch Umbenennen).
 * Liegt die gewünschte Stelle frei, bleibt sie exakt so. Sonst wird spiralförmig
 * nach außen der nächstgelegene freie Punkt gesucht. Andere Nodes werden nie
 * bewegt, die Regel "manuelle Position ist die Wahrheit" (Datei-Kommentar oben)
 * bleibt damit gewahrt.
 *
 * Grund (Nutzungstest 26.09.2026): Ein neues Konzept landete halb auf einem
 * bestehenden und verdeckte es. Beziehungen, die zum verdeckten Konzept
 * gezogen wurden, landeten unbemerkt beim oberen.
 */
export function findFreePosition(
  desired: GraphNodePosition,
  size: { rx: number; ry: number },
  others: NodeFootprint[],
  gap: number = NODE_GAP,
): GraphNodePosition {
  const isFree = (pos: GraphNodePosition) => others.every(o => !overlaps(pos, size.rx, size.ry, o, gap));
  if (isFree(desired)) return desired;
  for (let ring = 1; ring <= SEARCH_RINGS; ring++) {
    const radius = ring * SEARCH_STEP;
    const steps = Math.max(8, Math.round((2 * Math.PI * radius) / SEARCH_STEP));
    let best: GraphNodePosition | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      // Waagerecht ausweichen bevorzugen: Kapseln sind breiter als hoch.
      const candidate = { x: desired.x + Math.cos(angle) * radius * 1.4, y: desired.y + Math.sin(angle) * radius };
      if (!isFree(candidate)) continue;
      const score = Math.hypot(candidate.x - desired.x, candidate.y - desired.y);
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    if (best) return best;
  }
  return desired;
}
