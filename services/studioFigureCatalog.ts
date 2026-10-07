import { parseFigureBox, type FigureBox } from './figureCards';

export interface RawStudioFigure { page?: unknown; box?: unknown; title?: unknown; description?: unknown }

/**
 * Reine Teile der Abbildungen im Lernstudio (ohne Browser und KI), damit
 * subjectStudio.ts sie ohne Import-Schleife nutzen kann. Ablauf und Browser-
 * Teil: services/studioFigures.ts.
 */

export interface DocFigure {
  id: string;
  /** 1-basiert */
  page: number;
  box: FigureBox;
  title: string;
  description: string;
  /** Ausgeschnittenes Bild (Bucket card-images), sobald einmal gebraucht. */
  image?: string;
}

export interface FigureIndex { v: 1; scannedAt: number; figures: DocFigure[] }

// ── Verzeichnis für den Prompt ───────────────────────────────────────────────

export interface CatalogEntry { ref: string; docId: string; n: number; figure: DocFigure }

/** Kurzes Verzeichnis "A1 · Quelle 1, Seite 34: Titel. Beschreibung" für den Prompt. */
export const buildFigureCatalog = (
  docs: { docId: string; n: number; figures: DocFigure[] }[],
  max = 60,
): { text: string; entries: CatalogEntry[] } => {
  const entries: CatalogEntry[] = [];
  for (const d of docs) {
    for (const figure of d.figures) {
      if (entries.length >= max) break;
      entries.push({ ref: `A${entries.length + 1}`, docId: d.docId, n: d.n, figure });
    }
  }
  const text = entries
    .map(e => `${e.ref} · Quelle ${e.n}, Seite ${e.figure.page}: ${e.figure.title}.${e.figure.description ? ` ${e.figure.description}` : ''}`)
    .join('\n');
  return { text, entries };
};

export const figurePromptBlock = (catalog: string): string => catalog ? `
ABBILDUNGEN AUS DEN QUELLEN: Diese Abbildungen gibt es in den Quellen:
${catalog}
Setze passende Abbildungen dort in den Text, wo der Abschnitt genau das behandelt, was sie zeigen (z. B. den Querschnitt des Auges beim Aufbau des Auges). Nur wenn sie wirklich zum Abschnitt passen, jede höchstens einmal. Eine Abbildung ist ein eigener Codeblock:
\`\`\`diagram
{"type":"figure","ref":"A1","caption":"Was man darauf sieht und worauf man achten soll, ein Satz"}
\`\`\`
Abbildungen gehen vor selbst gezeichneten Grafiken, wenn beide dasselbe zeigen würden.
` : '';


/** Prompt für die Suche nach Abbildungen (geminiService.findStudioFigures). */
export const buildFigureScanPrompt = (pageRule: string, max: number): string =>
  `Finde bis zu ${max} Abbildungen, die für das Lernen wichtig sind: anatomische und biologische Darstellungen, Schaubilder, Modelle, Diagramme, Graphen, Abläufe, beschriftete Skizzen, Tabellen mit grafischem Aufbau.
NICHT: Logos, Fotos von Personen ohne fachlichen Inhalt, Stockfotos, Hintergründe, Dekoration, reine Textblöcke, Kopf- und Fußzeilen, Symbole.
Für jede Abbildung:
- ${pageRule}
- box: Bildbereich als [ymin, xmin, ymax, xmax], Werte 0 bis 1000 relativ zur Seite. Er muss die ganze Abbildung samt ALLEN Beschriftungen, Pfeilen und Legenden enthalten, auch die am äußersten Rand. Lieber etwas zu groß als zu knapp, aber ohne den Fließtext daneben.
- title: was sie zeigt, höchstens 8 Wörter (z. B. "Querschnitt des menschlichen Auges").
- description: ein Satz, welche Teile, Begriffe oder Schritte darauf beschriftet oder zu sehen sind.
Erfinde keine Abbildungen. Gibt es keine, gib eine leere Liste zurück.`;

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Zusätzlicher Rand im Lernstudio: Beschriftungen stehen oft ganz außen (im Test schnitt Flash-Lite mal "Hornhaut" zu "Horn", mal "Netzhaut" oben an; 3.8 Flash traf genau). */
export const STUDIO_FIGURE_PAD = 0.05;

export const validateStudioFigure = (raw: RawStudioFigure, numPages: number, index: number): DocFigure | null => {
  const page = typeof raw.page === 'number' ? Math.round(raw.page) : NaN;
  const box = parseFigureBox(raw.box);
  const title = str(raw.title, 90);
  if (!box || !title || !(page >= 1 && page <= numPages)) return null;
  const x = Math.max(0, box.x - STUDIO_FIGURE_PAD);
  const y = Math.max(0, box.y - STUDIO_FIGURE_PAD);
  const padded = { x, y, w: Math.min(1, box.x + box.w + STUDIO_FIGURE_PAD) - x, h: Math.min(1, box.y + box.h + STUDIO_FIGURE_PAD) - y };
  return { id: `f${index + 1}`, page, box: padded, title, description: str(raw.description, 240) };
};

/** Gleiche Seite und stark überlappend: nur einmal behalten. */
export const dedupeStudioFigures = (figs: DocFigure[]): DocFigure[] => {
  const out: DocFigure[] = [];
  const overlap = (a: FigureBox, b: FigureBox) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
  };
  for (const f of figs) if (!out.some(o => o.page === f.page && overlap(o.box, f.box) > 0.7)) out.push(f);
  return out.map((f, i) => ({ ...f, id: `f${i + 1}` }));
};

