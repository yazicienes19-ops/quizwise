/**
 * Reine Geometrie-/Metrik-Helfer für GraphCanvas.tsx — bewusst OHNE React-
 * oder DOM-Bezug, damit jede Funktion direkt unit-testbar ist (dasselbe
 * Muster wie graphLayoutEngine.ts: Darstellungs-Mathematik gehört nicht in
 * die Komponente, aber auch nicht in die Domain-Schicht der Mutations-/
 * History-Services).
 */

export interface GraphRect { x: number; y: number; w: number; h: number }

/**
 * Liang-Barsky-Clip: true, wenn das Segment (x1,y1)-(x2,y2) das Rechteck
 * schneidet ODER darin liegt. Fürs Viewport-Culling von Kanten — eine Kante
 * bleibt sichtbar, sobald nur ihr Verlauf durch den sichtbaren Bereich läuft,
 * auch wenn BEIDE Endpunkte außerhalb liegen (z.B. lange Kante über die
 * Ecke). Bewusst exakte Mathe statt grober Bounding-Box-Schätzung, damit
 * Culling nie sichtbare Kanten verschwinden lässt.
 */
export function segmentIntersectsRect(
  x1: number, y1: number, x2: number, y2: number, rect: GraphRect,
): boolean {
  const minX = rect.x, maxX = rect.x + rect.w;
  const minY = rect.y, maxY = rect.y + rect.h;
  if (Math.max(x1, x2) < minX || Math.min(x1, x2) > maxX) return false;
  if (Math.max(y1, y2) < minY || Math.min(y1, y2) > maxY) return false;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      // Segment parallel zu dieser Begrenzung — außerhalb heißt nie drinnen.
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

/**
 * Stärke der Kanten-Bündelung (0..1) für einen Zoom-Faktor: 0 solange das
 * Netz klein ist ODER der Nutzer nah genug herangezoomt hat (dort sollen die
 * Kanten exakt so aussehen wie immer — gerade, mit lesbaren Labels), dann
 * weicher Fade bis 1 beim weitesten Rauszoomen. Gerade zwischen fadeEndK und
 * fadeStartK interpoliert, außerhalb geklemmt.
 */
export function bundleStrength(
  zoomK: number, nodeCount: number, minNodes: number, fadeStartK: number, fadeEndK: number,
): number {
  if (nodeCount < minNodes || zoomK >= fadeStartK) return 0;
  return Math.min(1, (fadeStartK - zoomK) / Math.max(1e-6, fadeStartK - fadeEndK));
}

/**
 * Kontrollpunkt einer quadratischen Bézier für eine gebündelte Kante: Der
 * Mittelpunkt der geraden Sehne wird um `bend` (0..1) Richtung Attraktor
 * (`ax`,`ay` — heute: Schwerpunkt des Netzes) verschoben, auf maximal
 * `maxOffset` Luchter begrenzt, damit keine Kante absurde Schlaufen um das
 * Netz-Zentrum zieht, nur weil sie zufällig weit draußen liegt.
 */
export function quadControlPoint(
  x1: number, y1: number, x2: number, y2: number,
  ax: number, ay: number, bend: number, maxOffset: number,
): { cx: number; cy: number } {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  let cx = midX + (ax - midX) * bend;
  let cy = midY + (ay - midY) * bend;
  const dx = cx - midX;
  const dy = cy - midY;
  const dist = Math.hypot(dx, dy);
  if (dist > maxOffset && dist > 0) {
    cx = midX + (dx / dist) * maxOffset;
    cy = midY + (dy / dist) * maxOffset;
  }
  return { cx, cy };
}

/** Punkt einer quadratischen Bézier bei Parameter t (0=Start, 1=Ende). */
export function quadPointAt(
  x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * x1 + 2 * u * t * cx + t * t * x2,
    y: u * u * y1 + 2 * u * t * cy + t * t * y2,
  };
}

/** Kurven-Mittelpunkt (t=0.5) — dort sitzen Label und Bearbeiten-Overlay. */
export function quadMidpoint(
  x1: number, y1: number, cx: number, cy: number, x2: number, y2: number,
): { x: number; y: number } {
  return quadPointAt(x1, y1, cx, cy, x2, y2, 0.5);
}
