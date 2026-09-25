/**
 * Abbildungs-Karten aus PDFs (reine Logik, ohne Browser-APIs).
 *
 * Die KI nennt je Abbildung die Seite und einen Bildbereich im Gemini-
 * Standardformat [ymin, xmin, ymax, xmax], skaliert auf 0 bis 1000 relativ
 * zur Seite. Hier wird das geprüft, mit etwas Rand versehen und in einen
 * Pixel-Ausschnitt der gerenderten Seite umgerechnet.
 */

export interface FigureCardRaw {
  front?: unknown;
  back?: unknown;
  page?: unknown;
  box?: unknown;
  side?: unknown;
}

export interface FigureCard {
  front: string;
  back: string;
  /** 1-basiert */
  page: number;
  /** Wo das Bild steht: vorne, wenn es zum Beantworten nötig ist; hinten, wenn es die Antwort enthält. */
  side: 'front' | 'back';
  /** Anteile der Seite (0 bis 1), inklusive Rand. */
  box: { x: number; y: number; w: number; h: number };
}

/** Kleinster sinnvoller Ausschnitt (Anteil der Seite); darunter ist es meist ein Symbol oder Logo. */
const MIN_SIDE = 0.06;
/** Rand um die Abbildung, damit Beschriftungen am Rand nicht abgeschnitten werden. */
const PAD = 0.02;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const validateFigure = (raw: FigureCardRaw, numPages: number): FigureCard | null => {
  const front = typeof raw.front === 'string' ? raw.front.trim() : '';
  const back = typeof raw.back === 'string' ? raw.back.trim() : '';
  const page = typeof raw.page === 'number' ? Math.round(raw.page) : NaN;
  const box = Array.isArray(raw.box) && raw.box.length === 4 && raw.box.every(n => typeof n === 'number' && Number.isFinite(n))
    ? (raw.box as number[])
    : null;
  if (!front || !back || !box || !(page >= 1 && page <= numPages)) return null;

  const [ymin, xmin, ymax, xmax] = box.map(n => clamp01(n / 1000));
  if (xmax - xmin < MIN_SIDE || ymax - ymin < MIN_SIDE) return null;
  // Ganze Seite ist kein Ausschnitt, sondern meist ein Missverständnis des Modells.
  if (xmax - xmin > 0.97 && ymax - ymin > 0.97) return null;

  const x = clamp01(xmin - PAD);
  const y = clamp01(ymin - PAD);
  // Im Zweifel hinten: ein Bild auf der Rückseite verrät nie die Antwort.
  const side = raw.side === 'front' ? 'front' : 'back';
  return {
    front, back, page, side,
    box: { x, y, w: clamp01(xmax + PAD) - x, h: clamp01(ymax + PAD) - y },
  };
};

/** Pixel-Ausschnitt für eine gerenderte Seite der Größe width × height. */
export const cropRect = (box: FigureCard['box'], width: number, height: number) => ({
  sx: Math.round(box.x * width),
  sy: Math.round(box.y * height),
  sw: Math.max(1, Math.round(box.w * width)),
  sh: Math.max(1, Math.round(box.h * height)),
});

/** Doppelte Abbildungen (gleiche Seite, stark überlappend) nur einmal behalten. */
export const dedupeFigures = (figs: FigureCard[]): FigureCard[] => {
  const out: FigureCard[] = [];
  const overlap = (a: FigureCard['box'], b: FigureCard['box']) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
  };
  for (const f of figs) {
    if (!out.some(o => o.page === f.page && overlap(o.box, f.box) > 0.7)) out.push(f);
  }
  return out;
};
