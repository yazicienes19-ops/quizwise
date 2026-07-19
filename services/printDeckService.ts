// Karteikarten als ausschneidbare Druckbögen: A4, 2×4 Karten pro Bogen.
// Bogen 1 = Vorderseiten, Bogen 2 = Rückseiten mit je Zeile GESPIEGELTEN
// Spalten — beim beidseitigen Druck (Wenden an der langen Kante) liegt so
// jede Rückseite exakt hinter ihrer Vorderseite.
import type { Flashcard } from '../types';

export const PRINT_COLS = 2;
export const PRINT_ROWS = 4;
export const CARDS_PER_SHEET = PRINT_COLS * PRINT_ROWS;

export interface PrintSlot {
  card: Flashcard;
  /** 1-basierte Nummer im Deck — steht auf Vorder- UND Rückseite zum Zuordnen. */
  number: number;
}

export interface PrintSheet {
  fronts: (PrintSlot | null)[];
  backs: (PrintSlot | null)[];
}

/** Spalten innerhalb jeder Zeile spiegeln (für die Rückseiten-Bögen). */
export function mirrorSlots<T>(slots: (T | null)[]): (T | null)[] {
  const out: (T | null)[] = [];
  for (let r = 0; r < PRINT_ROWS; r++) {
    const row = slots.slice(r * PRINT_COLS, (r + 1) * PRINT_COLS);
    out.push(...row.reverse());
  }
  return out;
}

export function buildSheets(cards: Flashcard[]): PrintSheet[] {
  const sheets: PrintSheet[] = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_SHEET) {
    const chunk = cards.slice(i, i + CARDS_PER_SHEET);
    const fronts: (PrintSlot | null)[] = Array.from({ length: CARDS_PER_SHEET }, (_, j) =>
      chunk[j] ? { card: chunk[j], number: i + j + 1 } : null
    );
    sheets.push({ fronts, backs: mirrorSlots(fronts) });
  }
  return sheets;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sizeClass = (text: string) => (text.length > 220 ? 'xs' : text.length > 110 ? 'sm' : '');

const cellHtml = (slot: PrintSlot | null, side: 'front' | 'back'): string => {
  if (!slot) return '<div class="cell empty"></div>';
  const text = side === 'front' ? slot.card.front : slot.card.back;
  return `<div class="cell"><span class="num">${slot.number}</span><p class="${sizeClass(text)}">${escapeHtml(text).replace(/\n/g, '<br>')}</p></div>`;
};

export interface PrintLabels {
  hint: string;
  print: string;
}

/** Komplettes HTML-Dokument fürs Druck-Fenster (öffnet den Druckdialog selbst). */
export function buildPrintHtml(deckTitle: string, cards: Flashcard[], labels: PrintLabels): string {
  const sheets = buildSheets(cards);
  const sheetHtml = sheets
    .map(s =>
      `<div class="sheet">${s.fronts.map(x => cellHtml(x, 'front')).join('')}</div>` +
      `<div class="sheet">${s.backs.map(x => cellHtml(x, 'back')).join('')}</div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${escapeHtml(deckTitle)}</title>
<style>
  @page { size: A4 portrait; margin: 9mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; }
  .hint { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; background: #f1f5f9; font-size: 13px; }
  .hint button { padding: 8px 18px; border: 0; border-radius: 10px; background: #0f172a; color: #fff; font-weight: 700; cursor: pointer; }
  .sheet { display: grid; grid-template-columns: repeat(${PRINT_COLS}, 1fr); grid-template-rows: repeat(${PRINT_ROWS}, 1fr); height: 277mm; page-break-after: always; }
  .cell { position: relative; border: 1px dashed #94a3b8; display: flex; align-items: center; justify-content: center; text-align: center; padding: 7mm; overflow: hidden; }
  .cell p { margin: 0; font-size: 14px; line-height: 1.35; word-break: break-word; }
  .cell p.sm { font-size: 12px; }
  .cell p.xs { font-size: 10px; }
  .num { position: absolute; top: 2mm; left: 3mm; font-size: 8px; color: #94a3b8; }
  .empty { border-style: none; }
  @media print { .hint { display: none; } }
  @media screen { .sheet { height: auto; min-height: 270mm; border-bottom: 2px solid #e2e8f0; } }
</style>
</head>
<body>
<div class="hint"><span>${escapeHtml(labels.hint)}</span><button onclick="window.print()">${escapeHtml(labels.print)}</button></div>
${sheetHtml}
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });</script>
</body>
</html>`;
}
