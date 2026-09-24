/**
 * Doppeltippen für Touch und Stift (Audit 24.09.2026). iOS Safari schickt für
 * einen Doppeltipp kein dblclick, dadurch ließ sich im Wissensnetz ohne Maus
 * weder ein Konzept anlegen noch umbenennen. Die Maus behält das native
 * dblclick; dieser Detektor wird nur für pointerType touch/pen gefüttert.
 */

export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_SLOP_PX = 30;

export interface Tap { x: number; y: number; time: number; key: string }

/**
 * Liefert true, wenn dieser Tipp zusammen mit dem vorigen einen Doppeltipp
 * ergibt (gleiches Ziel, kurz hintereinander, nah beieinander). Nach einem
 * erkannten Doppeltipp beginnt die Zählung neu, ein dritter Tipp zählt nicht mit.
 */
export const createDoubleTapDetector = () => {
  let last: Tap | null = null;
  return (tap: Tap): boolean => {
    const isDouble = !!last
      && last.key === tap.key
      && tap.time - last.time <= DOUBLE_TAP_MS
      && Math.hypot(tap.x - last.x, tap.y - last.y) <= DOUBLE_TAP_SLOP_PX;
    last = isDouble ? null : tap;
    return isDouble;
  };
};

/** Tipp statt Wischen: Finger hat sich zwischen Aufsetzen und Loslassen kaum bewegt. */
export const isTapGesture = (down: { x: number; y: number } | null, up: { x: number; y: number }, slop = 10): boolean =>
  !!down && Math.hypot(up.x - down.x, up.y - down.y) <= slop;
