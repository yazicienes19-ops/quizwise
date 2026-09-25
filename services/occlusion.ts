import type { Flashcard } from '../types';

/**
 * Bilder verdecken (Anki: Image Occlusion). Ein Bild, mehrere Rechtecke;
 * jedes Rechteck wird eine eigene Karte. Koordinaten als Anteil des Bildes
 * (0 bis 1), damit sie in jeder Anzeigegröße stimmen.
 */
export interface OcclusionMask { x: number; y: number; w: number; h: number }
export type OcclusionMode = 'hideAll' | 'hideOne';

export interface OcclusionData {
  /** Storage-Pfad im Bucket card-images; alle Karten eines Bildes teilen ihn. */
  image: string;
  masks: OcclusionMask[];
  /** Welches Rechteck diese Karte abfragt. */
  index: number;
  /** hideAll: alle Rechtecke verdeckt, eines gefragt; hideOne: nur das gefragte verdeckt. */
  mode: OcclusionMode;
}

/** Kleinste Rechteckseite (Anteil); kleiner ist meist ein versehentlicher Klick. */
export const MIN_MASK_SIDE = 0.015;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Rechteck aus zwei Zeigerpunkten (beliebige Richtung), auf das Bild begrenzt. */
export const rectFromPoints = (a: { x: number; y: number }, b: { x: number; y: number }): OcclusionMask | null => {
  const x1 = clamp01(Math.min(a.x, b.x)); const x2 = clamp01(Math.max(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y)); const y2 = clamp01(Math.max(a.y, b.y));
  if (x2 - x1 < MIN_MASK_SIDE || y2 - y1 < MIN_MASK_SIDE) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
};

/** Maskenzustand für die Anzeige einer Karte. */
export const maskStates = (occ: OcclusionData, revealed: boolean): { mask: OcclusionMask; state: 'target' | 'hidden' | 'revealed' | 'none' }[] =>
  occ.masks.map((mask, i) => {
    if (i === occ.index) return { mask, state: revealed ? 'revealed' : 'target' };
    return { mask, state: occ.mode === 'hideAll' ? 'hidden' : 'none' };
  });

/** Karten zu einem Bild: eine je Rechteck, gemeinsamer Bildpfad. */
export const buildOcclusionCards = (
  image: string, masks: OcclusionMask[], mode: OcclusionMode, header: string, back: string,
  makeId: () => string, now = Date.now(),
): Omit<Flashcard, 'srs'>[] =>
  masks.map((_, index) => ({
    id: makeId(),
    front: header,
    back,
    occlusion: { image, masks, index, mode },
    level: 0,
    nextReview: now,
    lastInterval: 0,
  }));

/** Alle Bildpfade einer Karte (Bildkarten und verdeckte Bilder). */
export const cardImagePaths = (c: Pick<Flashcard, 'frontImage' | 'backImage' | 'occlusion'>): string[] =>
  [c.frontImage, c.backImage, c.occlusion?.image].filter((p): p is string => !!p);
