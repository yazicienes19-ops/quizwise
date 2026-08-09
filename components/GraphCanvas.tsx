import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { GraphState, GraphNodePosition, GraphEntityChange, HierarchyLevel } from '../services/graph/types';
import { buildGraphIndex, neighborIds, outgoingEdges, incomingEdges } from '../services/graph/graphIndex';
import { computeNodeInsights, groupInsightsByNode, type NodeInsightType } from '../services/graph/graphInsightsService';
import { resolveOverlaps } from '../services/graph/graphLayoutEngine';
import {
  type GraphSelectionState, selectNode, selectEdge, clearSelection, hoverNode, isSelected, isHovered, isEdgeSelected,
} from '../services/graph/graphSelectionService';
import {
  type GraphHistory, recordCreateNode, recordUpdateNode, recordArchiveNode,
  recordCreateEdge, recordUpdateEdge, recordArchiveEdge,
} from '../services/graph/graphHistoryService';
import { createRelationType } from '../services/graph/graphMutationService';

/**
 * Phase 3 — reine Graph Engine: SVG-Rendering, Pan/Zoom, Selection,
 * Drag-to-Move. Phase 5A: Node-Titel direkt bearbeitbar (Doppelklick), Node
 * löschbar, Beziehungstyp wird beim Kantenziehen bewusst per Texteingabe
 * gewählt statt automatisch defaultet (s. KNOWLEDGE_GRAPH_USABILITY_SESSION.md
 * — der stille Default widersprach der Kernregel "Nutzer ist bewusster Autor
 * jeder Bedeutung im Graphen"). Phase 5B (Relationship UX, s. Nachtest-Sektion
 * am Ende desselben Dokuments): ein abgelehnter Kanten-Versuch (Duplikat)
 * zeigt jetzt eine verständliche Meldung statt kommentarlos zu verschwinden;
 * Kanten sind jetzt genau wie Nodes auswählbar (breiter, unsichtbarer
 * Hit-Bereich neben der sichtbaren Linie) und darüber ansehbar, umbenennbar
 * (dieselbe Freitext-Logik wie beim Anlegen) und löschbar (Entf-Taste oder
 * Button im Editier-Overlay). Jede Kante zeigt ihre Bedeutung jetzt direkt
 * auf der Fläche (horizontales Label mit Hintergrund-Pille am
 * Kantenmittelpunkt, kein Menü/Inspector nötig); liegen mehrere Kanten
 * zwischen demselben Node-Paar (unterschiedliche Beziehungstypen sind
 * erlaubt, nur inhaltliche Duplikate nicht), werden nur ihre Labels
 * gestaffelt versetzt — reine Anzeigekorrektur, keine Linien-Geometrie.
 * Phase 1 der Umsetzungsphase: Node-Größe/Randstärke spiegeln die
 * Hierarchie-Ebene (radiusOf-Lookup statt fester Konstante). Phase 2: Notiz-
 * und Hierarchie-Bearbeitung sind aus dieser Datei AUSGEZOGEN in
 * `GraphNodeDetailPanel.tsx` (rechtes Seitenpanel) — bewusst, damit nicht
 * zwei Bearbeitungsorte für dasselbe Feld gleichzeitig sichtbar sind. Titel
 * bleibt bewusst als Doppelklick-Overlay HIER (kein Duplikat, das Panel
 * zeigt den Titel nur lesend an).
 *
 * UI-Schicht-Grenze bewusst eingehalten: diese Komponente importiert keine
 * Infrastructure (GraphRepository/GraphSyncService/GraphPersistenceService).
 * Sie ruft ausschließlich Domain-Funktionen auf (GraphHistoryService, damit
 * Undo/Redo automatisch funktioniert) und meldet jede erfolgreiche Änderung
 * über `onEntityChanged` nach außen — Persistenz ist Sache des Aufrufers
 * (heute: Test-Harness, später: ein useKnowledgeGraph-Hook der
 * Application-Schicht). Kontrollierte Komponente: state/history/selection
 * kommen als Props, Änderungen laufen über onChange-Callbacks.
 *
 * GraphEntityChange ist in services/graph/types.ts definiert (Domain-
 * Schicht), nicht hier — s. Kommentar dort.
 *
 * Ausnahme von "nur Domain-Funktionen über GraphHistoryService": das Anlegen
 * eines neuen Beziehungstyps (createRelationType, direkt aus
 * GraphMutationService) läuft NICHT über die History — das war schon in
 * Phase 3 eine bewusste Scope-Entscheidung (RelationType-Mutationen sind
 * seltene, "Einstellungs"-artige Aktionen, kein typischer Undo-Fall). Nur die
 * daraus entstehende Kante selbst ist undo-fähig.
 */

export interface GraphCanvasProps {
  state: GraphState;
  history: GraphHistory;
  selection: GraphSelectionState;
  onChange: (next: { state: GraphState; history: GraphHistory }) => void;
  onSelectionChange: (next: GraphSelectionState) => void;
  onEntityChanged?: (change: GraphEntityChange) => void;
  /** Globaler App-Theme-Zustand (User-Vorgabe 2026-08-04: KEIN eigener
   *  Wissensnetz-Modus mehr) — kommt von useAuth() über GraphSystem.tsx
   *  durchgereicht, exakt derselbe Zustand wie der Rest der App. */
  isDark: boolean;
  /** Wissensnetz-Coach, erster Baustein (s. services/graph/graphInsightsService.ts) —
   *  rein struktureller, informativer Hinweis-Punkt am Node. Default false:
   *  nur an, wenn der Nutzer den Schalter in GraphSystem.tsx bewusst aktiviert. */
  showInsights?: boolean;
  /** Wissensnetz-Coach, Baustein 2 (s. GraphEdgeExplainOverlay.tsx) — Button
   *  in der Kanten-Bearbeitungsleiste. Optional statt Pflicht, damit
   *  GraphDevHarness.tsx (zweiter Aufrufer) unverändert bleiben kann. */
  onExplainEdge?: (edgeId: string) => void;
}

interface ZoomTransform { x: number; y: number; k: number; }

// Basisgröße — gilt auch für hierarchyLevel === undefined ("noch nicht
// festgelegt"), damit bestehende Graphen ohne gesetzte Hierarchie optisch
// unverändert bleiben (keine Regression).
// Etwas größer als die ursprünglichen 28/34/22 (User-Feedback 2026-08-04:
// mehr Platz für Titel) — weiterhin dasselbe ~1.5er-Verhältnis zwischen
// größter/kleinster Stufe, nur insgesamt großzügiger bemessen.
const NODE_RADIUS = 32;
// Phase 1 (Wissensnetz-Umsetzungsphase, 2026-08-02 final entschieden):
// Größe ist das primäre, Randstärke das sekundäre Hierarchie-Signal (s.
// KNOWLEDGE_GRAPH_KONZEPT.md Abschnitt 5 — Begründung/verworfene
// Alternativen: Schrift verkleinert ausgerechnet die wichtigsten, oft
// längeren Titel; Farbe kollidiert mit dem bereits freien `node.color`-Feld).
// Bewusst nur ein Faktor ~1.5 zwischen größter/kleinster Stufe, nicht mehr —
// sonst passt bei "Detail" kein Buchstabe des Titels mehr in den Kreis.
const HIERARCHY_RADIUS: Record<HierarchyLevel, number> = {
  hauptthema: 40,
  unterthema: NODE_RADIUS,
  detail: 26,
};
// Randstärke pro Ebene, UNABHÄNGIG von der Selektions-Randstärke (die kommt
// weiterhin oben drauf) — sonst wäre ein selektierter "Detail"-Node optisch
// nicht mehr von einem selektierten "Hauptthema"-Node zu unterscheiden.
const HIERARCHY_STROKE_WIDTH: Record<HierarchyLevel, number> = {
  hauptthema: 2.5,
  unterthema: 1.5,
  detail: 1,
};
const SELECTED_STROKE_BONUS = 1.5;
const HANDLE_RADIUS = 6;
const HANDLE_OFFSET = 14;

// Wissensnetz-Coach, erster Baustein — Anzeigetexte für services/graph/graphInsightsService.ts.
const INSIGHT_LABELS: Record<NodeInsightType, string> = {
  'no-description': 'Noch keine Beschreibung',
  'no-notes': 'Noch keine eigenen Notizen',
  'many-relationships': 'Ungewöhnlich viele Beziehungen für diesen Bereich',
};
const DRAG_THRESHOLD_PX = 4;
const NODE_DATA_ATTR = 'data-graph-node';
// Kein hartes Zeichen-Limit mehr für Kantenlabels (User-Vorgabe 2026-08-04,
// verschärft 2026-08-05: "Beziehung soll immer lesbar sein, auch wenn sie
// länger ist") — stattdessen eine großzügige Breite, ab der umgebrochen
// wird (wrapTitleAllLines, wie bei Node-Titeln, bis zu EDGE_LABEL_MAX_LINES
// Zeilen, bevor überhaupt eine Kürzung in Betracht käme).
const EDGE_LABEL_MAX_WIDTH = 130;
const EDGE_LABEL_MAX_LINES = 4;

// ── Visuelle Sprache "Wissensnetz/Synapsen-Netz" (Design-Abnahme 2026-08-04,
// Handoff design_handoff_studearc_wissnetz/StudeArc Wissnetz.dc.html) ───────
// Drei Nähe-Stufen zum AUSGEWÄHLTEN Node steuern Farbe/Glut/Unschärfe (nicht
// die Größe — die bleibt weiterhin hierarchyLevel-gesteuert, s. oben):
// 'focus' = der ausgewählte Node selbst, 'neighbor' = direkt verbunden,
// 'far' = alles andere. Ohne Auswahl gilt 'neutral' (== neighbor-Optik,
// nichts wird gedimmt). Bewusst NICHT die im Handoff vorgeschlagenen 6
// Kantenstile (gepunktet/durchgezogen/dick/gestrichelt/doppelt/dünn) pro
// Beziehungstyp umgesetzt — dafür bräuchte GraphRelationType ein neues
// Kategorie-Feld, das es im Datenmodell nicht gibt (keine Architekturänderung
// ohne Rückfrage). `symmetric` (existiert bereits) steuert stattdessen eine
// Doppellinie, sonst einheitlich durchgezogen.
type GraphTier = 'focus' | 'neighbor' | 'far' | 'neutral';

// Farb-Hierarchie (User-Vorgabe 2026-08-06): Hauptthema=Gold, Unterthema=
// Blau, Detail=Grau, als dauerhafte Identität der Ebene statt nur als
// Auswahlzustand. Hauptthema/Unterthema wiederverwenden exakt die bereits
// bestehenden Nähe-Stufen-Farbtöne (focus=Gold, neighbor=Blau). Detail
// NICHT den gedimmten "far"-Ton (User-Feedback: sieht "noch nicht ganz"
// richtig aus) — stattdessen exakt dasselbe neutrale Grau wie im
// Farbauswahl-Swatch (NODE_COLOR_SWATCHES in GraphNodeDetailPanel.tsx,
// letzter Swatch), s. DETAIL_IDENTITY_COLOR unten.
const HIERARCHY_IDENTITY_TIER: Record<HierarchyLevel, Exclude<GraphTier, 'neutral'>> = {
  hauptthema: 'focus', unterthema: 'neighbor', detail: 'far',
};
// Muss exakt dem letzten Wert in NODE_COLOR_SWATCHES (GraphNodeDetailPanel.tsx)
// entsprechen — dieselbe Farbe, die der Nutzer auch manuell auswählen könnte.
const DETAIL_IDENTITY_COLOR = '#64748B';

interface WnTierColors {
  bg: string; border: string; text: string; glow: string; glowOpacity: number; opacity: number; blurPx: number;
}
interface WnTheme {
  canvasBg: string;
  focusEyebrow: string; focusLabel: string;
  chipBg: string; chipBorder: string; chipText: string;
  tier: Record<Exclude<GraphTier, 'neutral'>, WnTierColors>;
  edge: { focus: string; neighbor: string; far: string };
  label: { focus: string; far: string };
  gradientId: Record<Exclude<GraphTier, 'neutral'>, string>;
}

const WN_THEME: Record<'night' | 'day', WnTheme> = {
  night: {
    canvasBg: 'radial-gradient(ellipse at 50% 35%,#101E38 0%,#08111E 68%)',
    focusEyebrow: '#5E75A8', focusLabel: '#F3D48B',
    chipBg: 'rgba(255,255,255,.06)', chipBorder: 'rgba(255,255,255,.12)', chipText: '#D9A94E',
    tier: {
      focus: { bg: '#D9A94E', border: 'rgba(255,236,180,.75)', text: '#1B2A4A', glow: '#D9A94E', glowOpacity: .4, opacity: 1, blurPx: 0 },
      neighbor: { bg: '#4E6CA8', border: 'rgba(140,170,230,.42)', text: '#DCE6FA', glow: '#4E6CA8', glowOpacity: .3, opacity: .97, blurPx: 0 },
      far: { bg: '#26355C', border: 'rgba(90,110,160,.16)', text: '#7186B4', glow: '#1B2740', glowOpacity: .1, opacity: .5, blurPx: .8 },
    },
    edge: { focus: '#7B93C8', neighbor: '#4E6CA8', far: '#26355C' },
    label: { focus: '#F3D48B', far: '#8CA0D0' },
    gradientId: { focus: 'wnGradFocusNight', neighbor: 'wnGradNeighborNight', far: 'wnGradFarNight' },
  },
  day: {
    canvasBg: 'radial-gradient(ellipse at 50% 35%,#F5F1E7 0%,#E4DFD2 70%)',
    focusEyebrow: '#9A8F73', focusLabel: '#8A5A1E',
    chipBg: 'rgba(27,42,74,.05)', chipBorder: 'rgba(27,42,74,.12)', chipText: '#A9772C',
    tier: {
      focus: { bg: '#C08B33', border: 'rgba(191,140,50,.7)', text: '#FBF9F4', glow: '#C08B33', glowOpacity: .3, opacity: 1, blurPx: 0 },
      neighbor: { bg: '#405482', border: 'rgba(70,90,140,.3)', text: '#FBF9F4', glow: '#7C90BE', glowOpacity: .2, opacity: .97, blurPx: 0 },
      far: { bg: '#9BA3C0', border: 'rgba(120,130,165,.18)', text: '#4B5568', glow: '#9BA3C0', glowOpacity: .08, opacity: .6, blurPx: .8 },
    },
    edge: { focus: '#B99A5C', neighbor: '#8A96BE', far: '#B7BDD4' },
    label: { focus: '#8A5A1E', far: '#6B7BA8' },
    gradientId: { focus: 'wnGradFocusDay', neighbor: 'wnGradNeighborDay', far: 'wnGradFarDay' },
  },
};

/** Stabiler Hash statt Math.random() — jeder Node behält so bei jedem
 *  Re-Render (Theme-Wechsel, Selektion, Drag) exakt dieselbe Blob-Form statt
 *  optisch zu "springen". */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Leicht unregelmäßige "Blob"-Kontur statt eines perfekten Kreises (User-
 *  Feedback zur Design-Abnahme: "nicht alle Nodes so perfekt rund") — acht
 *  Punkte um eine Ellipse mit Halbachsen `rx`/`ry` herum, Radius pro Punkt
 *  um ±12% aus der Node-ID gejittert, durch quadratische Kurven über die
 *  Punkt-Mittelpunkte zu einer glatten geschlossenen Fläche verbunden.
 *  Deterministisch pro Node-ID, unabhängig von Zoom/Position/Theme.
 *  `rx`≠`ry` (s. nodeExtentsOf) macht aus dem Kreis eine Kapsel-artige
 *  Form für Nodes mit langem Titel, statt bei jedem Wort gleich stark zu
 *  kürzen/umzubrechen (User-Wunsch 2026-08-04: "Form soll sich je nach
 *  Länge des Wortes anpassen"). */
function blobPathD(rx: number, ry: number, seed: string): string {
  const h = hashId(seed);
  const n = 8;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const bit = (h >> (i * 3)) & 0x7;
    const jitter = 0.88 + (bit / 7) * 0.24; // 0.88..1.12
    const angle = (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(angle) * rx * jitter, y: Math.sin(angle) * ry * jitter });
  }
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const first = mid(pts[n - 1], pts[0]);
  let d = `M${first.x},${first.y} `;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += `Q${p.x},${p.y} ${m.x},${m.y} `;
  }
  return d + 'Z';
}

/** Abstand vom Zentrum bis zum Ellipsenrand in Richtung `angle` — für
 *  Kanten-Endpunkte, die jetzt am tatsächlichen (ggf. gestreckten) Rand
 *  enden sollen, nicht an einem festen Kreisradius, sonst klaffte bei
 *  breiten Nodes eine sichtbare Lücke oder die Linie liefe hinein. */
function ellipseRadiusAtAngle(rx: number, ry: number, angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return 1 / Math.sqrt((cos * cos) / (rx * rx) + (sin * sin) / (ry * ry));
}

// Echte Textbreiten-Messung statt geschätzter Zeichenbreite (die erste
// Schätz-Version reichte laut Live-Check immer noch nicht, s. Kommentar bei
// truncateTitleToFit) — ein einziges wiederverwendetes <canvas> reicht,
// Messungen selbst kosten kein sichtbares DOM.
let measureCanvasCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCanvasCtx !== undefined) return measureCanvasCtx;
  measureCanvasCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  return measureCanvasCtx;
}
function measureTextWidthPx(text: string, fontSizePx: number, fontWeight: number): number {
  const ctx = getMeasureCtx();
  if (!ctx) return text.length * fontSizePx * 0.58; // SSR/Testumgebung ohne canvas-Support
  ctx.font = `${fontWeight} ${fontSizePx}px Inter, -apple-system, sans-serif`;
  return ctx.measureText(text).width;
}

/** Kürzt `text` so, dass er inklusive „…" innerhalb `maxWidthPx` passt —
 *  ersetzt eine erste, rein geschätzte Zeichen-pro-Radius-Formel, die beim
 *  Live-Check (User-Fund 2026-08-04, z.B. "Wahrnehmung" bei r=28) immer noch
 *  über den Kreisrand hinauslief: eine feste Durchschnitts-Zeichenbreite
 *  passt nicht zu den je nach Buchstaben (schmales „i" vs. breites „W")
 *  stark unterschiedlichen Glyphenbreiten von Inter. Echte Messung ist die
 *  einzig robuste Lösung. */
function truncateTitleToFit(text: string, maxWidthPx: number, fontSizePx: number, fontWeight: number): string {
  if (measureTextWidthPx(text, fontSizePx, fontWeight) <= maxWidthPx) return text;
  let end = text.length;
  while (end > 1 && measureTextWidthPx(text.slice(0, end) + '…', fontSizePx, fontWeight) > maxWidthPx) end--;
  return text.slice(0, end) + '…';
}

const HYPHEN_VOWELS = new Set('aeiouäöüyAEIOUÄÖÜY'.split(''));
// Zweibuchstaben-Verbindungen, die beim Trennen nicht auseinandergerissen
// werden sollen (Digraphen/Diphthonge) — keine vollständige Liste der
// deutschen Rechtschreibregeln, nur die häufigsten Fälle.
const HYPHEN_INSEPARABLE = new Set([
  'ch', 'sch', 'ph', 'th', 'sh', 'ck', 'ng', 'nk', 'qu', 'ie', 'ei', 'au', 'eu', 'äu', 'ai',
  // Deutsches Dehnungs-h (stummes, längendes h nach Vokal, z.B. "ge-hen",
  // nicht "geh-en") — fehlte zuerst und riss z.B. bei "Wahrnehmung" das "eh"
  // auseinander ("Wahrne-hmung" statt "Wahr-nehmung").
  'ah', 'eh', 'ih', 'oh', 'uh', 'äh', 'öh', 'üh',
]);

/** true, wenn eine Trennung VOR Index `i` (word[i] beginnt Zeile 2) an einer
 *  silbenähnlichen Stelle läge: nach einem Vokal vor einem Konsonanten (der
 *  häufigste deutsche Trennfall, "Wahr-neh-mung") oder zwischen zwei
 *  gleichen Konsonanten ("kom-men"). Keine echte Silbentrennung (dafür
 *  bräuchte es ein Wörterbuch/einen Algorithmus wie TeX' Knuth-Liang-
 *  Verfahren, unverhältnismäßig für Node-Labels) — eine bewusst einfache,
 *  aber deutlich bessere Heuristik als blindes Zeichen-Abschneiden. */
function looksLikeSyllableBreak(word: string, i: number): boolean {
  if (i < 2 || i >= word.length - 1) return false; // mind. 2 Zeichen je Seite
  const before = word[i - 1].toLowerCase();
  const at = word[i].toLowerCase();
  if (HYPHEN_INSEPARABLE.has(before + at)) return false;
  // Nie direkt VOR einem Vokal trennen — der stünde sonst ohne seinen
  // eigentlichen Anfangskonsonanten da. Deckt beide häufigen deutschen
  // Trennfälle ab: Vokal|Konsonant ("Wah-rung") UND Konsonant|Konsonant,
  // auch mit UNTERSCHIEDLICHEN Konsonanten ("Wahr-nehmung": r|n, nicht nur
  // identische Doppelkonsonanten wie "kom-men" — das war die erste, zu enge
  // Fassung dieser Heuristik).
  return !HYPHEN_VOWELS.has(at);
}

/** Zeichenweiser Split eines einzelnen (oft zusammengesetzten) Worts, das
 *  für sich schon zu breit für eine Zeile ist — sucht rückwärts von der
 *  breiten-basierten Grenze aus in einem kleinen Fenster nach einer
 *  silbenähnlichen Trennstelle (s. looksLikeSyllableBreak) und markiert sie
 *  mit Bindestrich, statt mitten im Wort willkürlich abzuschneiden. */
function splitWordWithHyphen(word: string, maxWidthPx: number, fontSizePx: number, fontWeight: number): [string, string] {
  const hyphenWidth = measureTextWidthPx('-', fontSizePx, fontWeight);
  const budget = maxWidthPx - hyphenWidth;
  let splitAt = word.length;
  while (splitAt > 1 && measureTextWidthPx(word.slice(0, splitAt), fontSizePx, fontWeight) > budget) splitAt--;
  splitAt = Math.max(1, splitAt);
  for (let i = splitAt; i >= Math.max(2, splitAt - 4); i--) {
    if (looksLikeSyllableBreak(word, i)) { splitAt = i; break; }
  }
  return [`${word.slice(0, splitAt)}-`, word.slice(splitAt)];
}

const TITLE_FONT_SIZE_STEPS = [10, 9, 8];
// Harte Obergrenze an Zeilen für Node-Titel — verhindert, dass ein
// pathologisch langer Titel die Kapsel unbegrenzt hoch wachsen lässt.
// Alles bis hierhin ist "mehrzeilige Darstellung" (User-Vorgabe
// 2026-08-04), erst danach greift truncateTitleToFit als letzter Ausweg.
const TITLE_MAX_LINES = 4;

/** Voller, ungekürzter Zeilenumbruch (beliebig viele Zeilen bis maxLines) —
 *  Wörter, die selbst auf einer leeren Zeile nicht passen, werden per
 *  splitWordWithHyphen fortlaufend
 *  aufgeteilt, bis der Rest passt. Nur die letzte erlaubte Zeile
 *  (maxLines erreicht) wird bei Bedarf über truncateTitleToFit gekürzt. */
function wrapTitleAllLines(
  text: string, maxWidthPx: number, fontSizePx: number, fontWeight: number, maxLines: number,
): { lines: string[]; truncated: boolean } {
  const lines: string[] = [];
  const words = text.split(' ');
  let i = 0;
  while (i < words.length) {
    if (lines.length === maxLines - 1) {
      const restText = words.slice(i).join(' ');
      const fits = measureTextWidthPx(restText, fontSizePx, fontWeight) <= maxWidthPx;
      lines.push(fits ? restText : truncateTitleToFit(restText, maxWidthPx, fontSizePx, fontWeight));
      return { lines, truncated: !fits };
    }
    if (measureTextWidthPx(words[i], fontSizePx, fontWeight) > maxWidthPx) {
      const [head, tail] = splitWordWithHyphen(words[i], maxWidthPx, fontSizePx, fontWeight);
      lines.push(head);
      words[i] = tail;
      continue;
    }
    let line = words[i];
    let j = i + 1;
    while (j < words.length) {
      const candidate = `${line} ${words[j]}`;
      if (measureTextWidthPx(candidate, fontSizePx, fontWeight) > maxWidthPx) break;
      line = candidate;
      j++;
    }
    lines.push(line);
    i = j;
  }
  return { lines, truncated: false };
}

/** Letzter Fallback vor "…" (User-Vorgabe 2026-08-04: "Keine '...' wenn es
 *  sich vermeiden lässt... falls nötig kleinere Schrift, größere Container,
 *  mehrzeilige Darstellung"): probiert wrapTitleAllLines bei absteigender
 *  Schriftgröße (bis zu TITLE_MAX_LINES Zeilen je Stufe), bis der Titel ohne
 *  Kürzung passt. Bleibt es bei jeder Stufe gekürzt (extrem langer Text),
 *  wird die kleinste Stufe verwendet — seltener Rest-Fall, kein
 *  unbegrenztes Schrumpfen/Wachsen. */
function wrapTitleAdaptive(text: string, maxWidthPx: number, fontWeight: number): { lines: string[]; fontSize: number } {
  let result = { lines: [text] as string[], fontSize: TITLE_FONT_SIZE_STEPS[TITLE_FONT_SIZE_STEPS.length - 1] };
  for (const fontSize of TITLE_FONT_SIZE_STEPS) {
    const { lines, truncated } = wrapTitleAllLines(text, maxWidthPx, fontSize, fontWeight, TITLE_MAX_LINES);
    result = { lines, fontSize };
    if (!truncated) return result;
  }
  return result;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  state, history, selection, onChange, onSelectionChange, onEntityChanged, isDark, showInsights, onExplainEdge,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>({ x: 0, y: 0, k: 1 });
  const shouldReduceMotion = useReducedMotion();

  // Kein eigener Wissensnetz-Modus mehr (User-Vorgabe 2026-08-04) — folgt
  // dem globalen App-Theme, das über `isDark` hereinkommt.
  const wnTheme = isDark ? WN_THEME.night : WN_THEME.day;

  // ── Sichtbare Nodes/Kanten ──────────────────────────────────────────────
  const activeNodes = useMemo(
    () => [...state.nodesById.values()].filter(n => n.archivedAt === undefined),
    [state.nodesById],
  );
  const index = useMemo(() => buildGraphIndex(state), [state]);
  const visibleEdges = useMemo(() => [...index.edgesBySource.values()].flat(), [index]);
  // Wissensnetz-Coach, erster Baustein — nur berechnet, wenn der Nutzer den
  // Schalter aktiviert hat, damit ein reiner Beobachtungs-Zustand nicht bei
  // jedem Render mitläuft, wenn niemand ihn sehen will.
  const nodeInsightsByNode = useMemo(
    () => (showInsights ? groupInsightsByNode(computeNodeInsights(state)) : undefined),
    [state, showInsights],
  );

  // Nähe-Stufe zum ausgewählten Node (s. GraphTier-Kommentar oben) — ohne
  // Auswahl ist jeder Node 'neutral' (== neighbor-Optik, nichts gedimmt).
  const focusedNeighborIds = useMemo(
    () => (selection.selectedNodeId ? neighborIds(index, selection.selectedNodeId) : undefined),
    [index, selection.selectedNodeId],
  );
  const tierOf = useCallback((nodeId: string): GraphTier => {
    if (!selection.selectedNodeId) return 'neutral';
    if (nodeId === selection.selectedNodeId) return 'focus';
    if (focusedNeighborIds?.has(nodeId)) return 'neighbor';
    return 'far';
  }, [selection.selectedNodeId, focusedNeighborIds]);
  const tierColorsOf = (tier: GraphTier) => wnTheme.tier[tier === 'neutral' ? 'neighbor' : tier];

  // Hauptthema-Nodes sind standardmäßig Gold — ihre dauerhafte Identität,
  // nicht nur der Auswahlzustand (s. identityTierOf unten für die auf
  // Unterthema/Detail erweiterte Farb-Hierarchie). Auch für Kanten gebraucht: eine Kante an einem
  // Gold-Node soll genauso pulsen wie eine Kante am tatsächlich
  // ausgewählten Node — sonst wirkt der Gold-Node optisch wie der Fokus,
  // ohne dass die Kanten das mittragen (genau der vom User gemeldete Bruch).
  const isGoldIdentityNode = useCallback((nodeId: string): boolean => {
    const n = state.nodesById.get(nodeId);
    return !!n && !n.color && n.hierarchyLevel === 'hauptthema';
  }, [state.nodesById]);

  // Eine eigene, nutzerdefinierte Farbe (node.color) hat immer Vorrang und
  // wird hier deshalb zuerst ausgeschlossen — die Hierarchie selbst bleibt
  // davon komplett unberührt, es ändert sich nur die Darstellung. Nodes
  // ganz ohne hierarchyLevel behalten ihr bisheriges Verhalten (Farbe folgt
  // weiterhin der Nähe-Stufe zur Auswahl).
  const identityTierOf = useCallback((nodeId: string): Exclude<GraphTier, 'neutral'> | undefined => {
    const n = state.nodesById.get(nodeId);
    if (!n || n.color || !n.hierarchyLevel) return undefined;
    return HIERARCHY_IDENTITY_TIER[n.hierarchyLevel];
  }, [state.nodesById]);

  // Impuls-Ausbreitung durchs GANZE zusammenhängende Netz (User-Vorgabe
  // 2026-08-04): vorher pulste nur die Kante, die DIREKT den ausgewählten/
  // Gold-Hauptthema-Node berührte — wirkte "künstlich unterbrochen", sobald
  // ein Konzept über einen Zwischenknoten hing (z.B. DNA→Nukleotide, wenn
  // Biologie ausgewählt war). Multi-Source-BFS (ungerichtet, wie bei
  // `neighborIds`) ab genau denselben zwei Quellen wie bisher (ausgewählter
  // Node + alle Gold-Hauptthema-Nodes) über ALLE Kanten hinweg — jeder
  // erreichbare Node bekommt seine Hop-Distanz zur nächsten Quelle, jede
  // Kante zwischen zwei erreichbaren Nodes bekommt die kleinere der beiden
  // Distanzen als "Aktivierungs-Tiefe". Isolierte Teilgraphen bleiben
  // schlicht draußen (kein Eintrag in der Map) — keine Animation dort.
  // Bewusst NUR die Wander-Puls-Gating/-Verzögerung, NICHT die statische
  // Kantenfarbe/-Deckkraft (edgeTier bleibt 1-Hop, unverändert) — sonst
  // würde das ganze Netz dauerhaft golden aufleuchten statt nur der
  // wandernde Punkt (Design-Handoff: "Gold NUR als wandernder Puls, nie als
  // Ambient-Deko").
  const pulseDepthByEdge = useMemo(() => {
    const sourceIds = new Set<string>();
    if (selection.selectedNodeId) sourceIds.add(selection.selectedNodeId);
    for (const n of activeNodes) {
      if (isGoldIdentityNode(n.id)) sourceIds.add(n.id);
    }
    const nodeDist = new Map<string, number>();
    let frontier: string[] = [];
    for (const id of sourceIds) {
      if (!nodeDist.has(id)) { nodeDist.set(id, 0); frontier.push(id); }
    }
    let depth = 0;
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const edge of [...outgoingEdges(index, id), ...incomingEdges(index, id)]) {
          const otherId = edge.sourceNodeId === id ? edge.targetNodeId : edge.sourceNodeId;
          if (!nodeDist.has(otherId)) {
            nodeDist.set(otherId, depth + 1);
            next.push(otherId);
          }
        }
      }
      frontier = next;
      depth++;
    }
    const edgeDepth = new Map<string, number>();
    for (const edge of visibleEdges) {
      const ds = nodeDist.get(edge.sourceNodeId);
      const dt = nodeDist.get(edge.targetNodeId);
      if (ds === undefined || dt === undefined) continue;
      edgeDepth.set(edge.id, Math.min(ds, dt));
    }
    return edgeDepth;
  }, [selection.selectedNodeId, activeNodes, isGoldIdentityNode, index, visibleEdges]);
  // Verzögerung je Ausbreitungs-Tiefe — erzeugt den "Signal wandert Schritt
  // für Schritt weiter"-Effekt. Da alle Pulse dieselbe `dur` (3.6s) haben,
  // bleibt der Versatz bei jeder Wiederholung stabil (kein Auseinanderlaufen
  // über die Zeit), wirkt also wie eine fortlaufend durchs Netz laufende
  // Welle, nicht wie ein einmaliger Effekt. Deutlich größer als der
  // Pro-Kante-Jitter unten (PULSE_JITTER_MAX_S) — sonst verschluckt der
  // Zufallsversatz die eigentlich sichtbare Tiefen-Staffelung.
  const PULSE_DEPTH_STAGGER_S = 0.55;
  // Kleiner organischer Zufallsversatz pro Kante (statt starrem Metronom-
  // Takt) — bewusst klein gehalten, bleibt der Tiefen-Staffelung klar
  // untergeordnet.
  const PULSE_JITTER_MAX_S = 0.4;

  // Phase 5B Punkt 2: zwei unterschiedliche Beziehungstypen zwischen
  // demselben Node-Paar sind erlaubt (nur inhaltliche Duplikate werden
  // blockiert, s. validateNoDuplicateEdge) — beide Kanten wären ohne diesen
  // Index optisch identische, deckungsgleiche Linien mit exakt
  // übereinanderliegenden Labels. Reine Anzeige-Korrektur (nur die
  // Label-Position wird pro Kante innerhalb ihrer Gruppe leicht versetzt),
  // KEINE Änderung an Linien-Geometrie/Layout-Engine.
  const edgeParallelIndex = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const edge of visibleEdges) {
      const key = [edge.sourceNodeId, edge.targetNodeId].sort().join('|');
      const ids = groups.get(key) ?? [];
      ids.push(edge.id);
      groups.set(key, ids);
    }
    const indexById = new Map<string, number>();
    for (const ids of groups.values()) {
      ids.forEach((id, i) => indexById.set(id, i));
    }
    return indexById;
  }, [visibleEdges]);

  // Nur rein visuelle Entzerrung exakt überlappender Nodes — wird NICHT in
  // state/history committet. Ein automatischer Hintergrund-Commit hier würde
  // sonst als überraschender Eintrag im Undo-Stack auftauchen, obwohl der
  // Nutzer nichts getan hat (s. graphLayoutEngine.ts für die Begründung,
  // warum Entzerren überhaupt sicher ist).
  const displayPositions = useMemo(
    () => resolveOverlaps(
      activeNodes.map(n => ({ id: n.id, position: n.position, pinned: n.pinned })),
      visibleEdges.map(e => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId })),
    ),
    [activeNodes, visibleEdges],
  );

  const positionOf = useCallback(
    (nodeId: string): GraphNodePosition => displayPositions.get(nodeId) ?? { x: 0, y: 0 },
    [displayPositions],
  );

  // hierarchyLevel === undefined ("noch nicht festgelegt") fällt bewusst auf
  // dieselbe Basisgröße wie "unterthema" zurück — neutral, weder betont noch
  // verkleinert, bis der Nutzer sich bewusst für eine Ebene entscheidet.
  const radiusOf = useCallback((nodeId: string): number => {
    const level = state.nodesById.get(nodeId)?.hierarchyLevel;
    return level ? HIERARCHY_RADIUS[level] : NODE_RADIUS;
  }, [state.nodesById]);

  // Kapsel-Halbachsen statt eines einzelnen Radius (User-Wunsch 2026-08-04:
  // "je nach Länge des Wortes soll sich die Form anpassen") — `rx` wächst
  // nur so weit wie nötig, um den Titel einzeilig zu zeigen, gedeckelt bei
  // `radiusOf*2.1` (sonst würde ein einzelnes sehr langes Wort einen
  // unverhältnismäßig breiten Node erzeugen statt in den Zeilenumbruch zu
  // gehen). `ry` wächst stattdessen mit der tatsächlich benötigten
  // Zeilenzahl (wrapTitleAdaptive, bis zu TITLE_MAX_LINES) — Titel, die
  // auch bei maximaler Breite mehrzeilig bleiben, bekommen eine höhere statt
  // eine abgeschnittene Kapsel (User-Vorgabe 2026-08-04, Punkt 2: "kein Text
  // darf abgeschnitten werden").
  const nodeExtentsOf = useCallback((nodeId: string): { rx: number; ry: number } => {
    const node = state.nodesById.get(nodeId);
    const baseR = radiusOf(nodeId);
    if (!node) return { rx: baseR, ry: baseR };
    const fontWeight = node.hierarchyLevel === 'hauptthema' ? 800 : node.hierarchyLevel === 'detail' ? 600 : 700;
    const singleLineWidth = measureTextWidthPx(node.title, 10, fontWeight);
    const desiredRx = Math.max(baseR, singleLineWidth / (2 * 0.86) + 6);
    const rx = Math.min(desiredRx, baseR * 2.1);
    const maxWidth = rx * 2 * 0.86;
    const { lines } = wrapTitleAdaptive(node.title, maxWidth, fontWeight);
    const ry = lines.length <= 1 ? baseR : baseR * (1 + 0.22 * (lines.length - 1));
    return { rx, ry };
  }, [state.nodesById, radiusOf]);

  // Am jeweiligen Node-Rand (Ellipse, s. nodeExtentsOf) gekürzte Endpunkte
  // einer Kante plus Mittelpunkt — einmal berechnet, sowohl fürs
  // Linien-Rendering als auch für die Positionierung des Bearbeiten-Overlays
  // (Phase 5B) genutzt, damit beide immer exakt übereinstimmen. Quelle und
  // Ziel können unterschiedlich große/breite Nodes sein.
  const computeEdgeGeometry = useCallback((edge: { sourceNodeId: string; targetNodeId: string }) => {
    const from = positionOf(edge.sourceNodeId);
    const to = positionOf(edge.targetNodeId);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const srcExt = nodeExtentsOf(edge.sourceNodeId);
    const tgtExt = nodeExtentsOf(edge.targetNodeId);
    const srcDist = ellipseRadiusAtAngle(srcExt.rx, srcExt.ry, angle);
    const tgtDist = ellipseRadiusAtAngle(tgtExt.rx, tgtExt.ry, angle + Math.PI);
    const x1 = from.x + Math.cos(angle) * srcDist;
    const y1 = from.y + Math.sin(angle) * srcDist;
    const x2 = to.x - Math.cos(angle) * tgtDist;
    const y2 = to.y - Math.sin(angle) * tgtDist;
    return { x1, y1, x2, y2, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 };
  }, [positionOf, nodeExtentsOf]);

  // ── Pan/Zoom (Muster aus MindmapCanvas.tsx, angepasst) ──────────────────
  const fitView = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || activeNodes.length === 0) return;
    const xs = activeNodes.map(n => positionOf(n.id).x - nodeExtentsOf(n.id).rx);
    const xsMax = activeNodes.map(n => positionOf(n.id).x + nodeExtentsOf(n.id).rx);
    const ys = activeNodes.map(n => positionOf(n.id).y - nodeExtentsOf(n.id).ry);
    const ysMax = activeNodes.map(n => positionOf(n.id).y + nodeExtentsOf(n.id).ry);
    const minX = Math.min(...xs), maxX = Math.max(...xsMax);
    const minY = Math.min(...ys), maxY = Math.max(...ysMax);
    const contentWidth = maxX - minX || 1;
    const contentHeight = maxY - minY || 1;
    const svgW = svgRef.current.clientWidth || 800;
    const svgH = svgRef.current.clientHeight || 500;
    const scale = Math.min(1.2, 0.9 * Math.min(svgW / contentWidth, svgH / contentHeight));
    const tx = svgW / 2 - scale * (minX + contentWidth / 2);
    const ty = svgH / 2 - scale * (minY + contentHeight / 2);
    d3.select(svgRef.current).transition().duration(300)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }, [activeNodes, positionOf, nodeExtentsOf]);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svgSel = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 2.5])
      // Klicks/Drags, die auf einem Node beginnen, sollen den Node bewegen,
      // nicht die Canvas verschieben.
      .filter(event => !event.ctrlKey && !event.button && !(event.target as Element).closest(`[${NODE_DATA_ATTR}]`))
      .on('zoom', event => {
        g.attr('transform', event.transform.toString());
        setZoomTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k });
      });
    svgSel.call(zoomBehavior);
    // Eigener Doppelklick-Handler (Node anlegen) statt d3s eingebautem
    // Doppelklick-Zoom.
    svgSel.on('dblclick.zoom', null);
    zoomBehaviorRef.current = zoomBehavior;
    return () => { svgSel.on('.zoom', null); };
  }, []);

  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current || activeNodes.length === 0 || !zoomBehaviorRef.current) return;
    didInitialFit.current = true;
    fitView();
  }, [activeNodes.length, fitView]);

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const clientToGraphPoint = useCallback((clientX: number, clientY: number): GraphNodePosition => {
    const rect = svgRef.current?.getBoundingClientRect();
    const screenX = clientX - (rect?.left ?? 0);
    const screenY = clientY - (rect?.top ?? 0);
    return { x: (screenX - zoomTransform.x) / zoomTransform.k, y: (screenY - zoomTransform.y) / zoomTransform.k };
  }, [zoomTransform]);

  // ── Titel direkt bearbeiten (Phase 5A Punkt 2) ──────────────────────────
  // Kein Dialog/Modal — ein HTML-Overlay-<input>, absolut positioniert über
  // dem Node (Muster aus dem alten MindmapCanvas.tsx: interaktive Controls
  // liegen als HTML außerhalb des SVG, nicht als <foreignObject> darin, weil
  // Safari beim Klicken durch ein transformiertes SVG-<g> hindurch bekannte
  // Hit-Testing-Bugs hat — das transformierte <g ref={gRef}> für Pan/Zoom
  // existiert hier genauso).
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);
  // Escape muss verwerfen, nicht speichern — aber das Entfernen des
  // fokussierten <input> aus dem DOM löst danach trotzdem ein natives
  // blur-Event aus, das sonst versehentlich erneut committen würde, bevor
  // der State-Update aus setEditingNodeId(null) im Closure sichtbar ist
  // (State-Updates sind asynchron, ein Ref ist es nicht).
  const skipNextBlurCommitRef = useRef(false);

  useEffect(() => {
    if (editingNodeId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingNodeId]);

  const beginEditingTitle = (nodeId: string, currentTitle: string) => {
    setEditingNodeId(nodeId);
    setEditingValue(currentTitle);
  };

  const commitTitleEdit = () => {
    if (skipNextBlurCommitRef.current) { skipNextBlurCommitRef.current = false; return; }
    if (!editingNodeId) return;
    const trimmed = editingValue.trim();
    // Leerer Titel wird nicht committet (DB/Domain verlangen einen nicht-
    // leeren Titel) — die Bearbeitung schließt einfach, ohne den
    // bestehenden Titel zu verwerfen. Kein Fehler-UI nötig dafür.
    if (trimmed.length > 0) {
      const result = recordUpdateNode(history, state, editingNodeId, { title: trimmed });
      if (!result.error && result.entity) {
        onChange({ state: result.state, history: result.history });
        onEntityChanged?.({ kind: 'node', entity: result.entity });
      }
    }
    setEditingNodeId(null);
  };

  const cancelTitleEdit = () => {
    skipNextBlurCommitRef.current = true;
    setEditingNodeId(null);
  };

  // ── Node-Drag (Verschieben) ──────────────────────────────────────────────
  interface NodeDragState { nodeId: string; startClientX: number; startClientY: number; startPos: GraphNodePosition; currentPos: GraphNodePosition; moved: boolean; }
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null);

  const handleNodePointerDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setNodeDrag({ nodeId, startClientX: e.clientX, startClientY: e.clientY, startPos: positionOf(nodeId), currentPos: positionOf(nodeId), moved: false });
  };

  useEffect(() => {
    if (!nodeDrag) return;
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - nodeDrag.startClientX) / zoomTransform.k;
      const dy = (e.clientY - nodeDrag.startClientY) / zoomTransform.k;
      const moved = nodeDrag.moved || Math.hypot(e.clientX - nodeDrag.startClientX, e.clientY - nodeDrag.startClientY) > DRAG_THRESHOLD_PX;
      setNodeDrag(prev => prev && { ...prev, currentPos: { x: nodeDrag.startPos.x + dx, y: nodeDrag.startPos.y + dy }, moved });
    };
    const handleUp = () => {
      if (nodeDrag.moved) {
        const result = recordUpdateNode(history, state, nodeDrag.nodeId, { position: nodeDrag.currentPos });
        if (!result.error && result.entity) {
          onChange({ state: result.state, history: result.history });
          onEntityChanged?.({ kind: 'node', entity: result.entity });
        }
      } else {
        onSelectionChange(selectNode(selection, nodeDrag.nodeId));
      }
      setNodeDrag(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeDrag, zoomTransform.k]);

  // ── Kanten-Erstellung per Ziehen vom Connector-Handle ───────────────────
  interface EdgeDraftState { sourceNodeId: string; pointer: GraphNodePosition; }
  const [edgeDraft, setEdgeDraft] = useState<EdgeDraftState | null>(null);

  const handleHandlePointerDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setEdgeDraft({ sourceNodeId: nodeId, pointer: clientToGraphPoint(e.clientX, e.clientY) });
  };

  useEffect(() => {
    if (!edgeDraft) return;
    const handleMove = (e: MouseEvent) => {
      setEdgeDraft(prev => prev && { ...prev, pointer: clientToGraphPoint(e.clientX, e.clientY) });
    };
    const handleUp = () => setEdgeDraft(null); // Fallback: Loslassen außerhalb eines Nodes bricht ab
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [edgeDraft, clientToGraphPoint]);

  // ── Beziehung bewusst wählen (Phase 5A Punkt 5) ─────────────────────────
  // Kein stiller Standard-Beziehungstyp mehr. Loslassen über einem Zielnode
  // öffnet eine einfache Texteingabe ("Beziehung eingeben...") statt sofort
  // eine Kante anzulegen — die Software interpretiert nichts. Abbruch ohne
  // Eingabe (leer lassen, Escape) erzeugt bewusst KEINE Kante.
  interface EdgePromptState { sourceNodeId: string; targetNodeId: string; position: GraphNodePosition; value: string; }
  const [edgePrompt, setEdgePrompt] = useState<EdgePromptState | null>(null);
  // Phase 5B Punkt 1: Nachtest zeigte, dass ein Duplikat-Versuch das Prompt
  // kommentarlos schließt — keine technische Fehlermeldung, aber auch keine
  // Rückmeldung ist keine Lösung. Der Ablehnungsgrund aus GraphValidationService
  // ist bereits eine verständliche, undokumentierte Alltagssprache-Meldung
  // (z.B. "Eine Kante mit dem Beziehungstyp ... existiert bereits.") — die wird
  // hier einfach sichtbar gemacht, statt sie zu verwerfen.
  const [edgePromptError, setEdgePromptError] = useState<string | null>(null);
  const edgePromptInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (edgePrompt) edgePromptInputRef.current?.focus();
  }, [edgePrompt]);

  const handleNodePointerUp = (e: React.MouseEvent, targetNodeId: string) => {
    if (!edgeDraft) return;
    e.stopPropagation();
    const { sourceNodeId } = edgeDraft;
    setEdgeDraft(null);
    if (sourceNodeId === targetNodeId) return;
    setEdgePromptError(null);
    setEdgePrompt({ sourceNodeId, targetNodeId, position: clientToGraphPoint(e.clientX, e.clientY), value: '' });
  };

  const cancelEdgePrompt = () => { setEdgePrompt(null); setEdgePromptError(null); };

  const commitEdgePrompt = () => {
    if (!edgePrompt) return;
    const label = edgePrompt.value.trim();
    // Beziehungstyp ist optional (User-Vorgabe 2026-08-04): leere Eingabe
    // legt die Verbindung trotzdem an, nur ohne Typ — kein Fehler, kein
    // Platzhalter, kein Label. Der Typ kann jederzeit später über dieselbe
    // Bearbeiten-Logik ergänzt werden (Klick auf die Kante).
    //
    // resolveRelationTypeId (nur bei nicht-leerer Eingabe): exakte
    // (case-insensitive) Übereinstimmung mit einem bereits vorhandenen Typ
    // wiederverwenden, sonst spontan einen neuen eigenen anlegen. Läuft
    // bewusst NICHT über die History (s. Datei-Kommentar oben), nur die
    // Kante selbst ist undo-fähig.
    const resolved: { workingState: GraphState; relationTypeId?: string; error?: string } = label.length === 0
      ? { workingState: state, relationTypeId: undefined }
      : resolveRelationTypeId(label);
    if (resolved.error) { setEdgePromptError(resolved.error); return; }

    const edgeResult = recordCreateEdge(history, resolved.workingState, {
      sourceNodeId: edgePrompt.sourceNodeId, targetNodeId: edgePrompt.targetNodeId, relationTypeId: resolved.relationTypeId,
    });
    if (edgeResult.error || !edgeResult.entity) {
      // Prompt bleibt bewusst offen (statt setEdgePrompt(null)) — der Nutzer
      // sieht den Grund direkt unter der Eingabe und kann korrigieren oder
      // bewusst mit Escape abbrechen, statt zu rätseln, ob der Klick verpufft ist.
      setEdgePromptError(edgeResult.error ?? 'Diese Beziehung konnte nicht angelegt werden.');
      return;
    }
    setEdgePromptError(null);
    setEdgePrompt(null);
    onChange({ state: edgeResult.state, history: edgeResult.history });
    onEntityChanged?.({ kind: 'edge', entity: edgeResult.entity });
  };

  /** Exakte (case-insensitive) Übereinstimmung mit einem bestehenden
   *  Beziehungstyp wiederverwenden, sonst einen neuen anlegen — dieselbe
   *  Logik wie beim Kantenziehen (commitEdgePrompt), jetzt auch fürs
   *  nachträgliche Umbenennen einer bestehenden Kante gebraucht (Phase 5B). */
  const resolveRelationTypeId = (label: string): { workingState: GraphState; relationTypeId?: string; error?: string } => {
    const existing = [...state.relationTypesById.values()].find(
      rt => rt.label.trim().toLowerCase() === label.toLowerCase(),
    );
    if (existing) return { workingState: state, relationTypeId: existing.id };
    const createResult = createRelationType(state, { label });
    if (createResult.error || !createResult.entity) return { workingState: state, error: createResult.error };
    onEntityChanged?.({ kind: 'relationType', entity: createResult.entity });
    return { workingState: createResult.state, relationTypeId: createResult.entity.id };
  };

  // ── Beziehung ansehen/ändern/löschen (Phase 5B) ──────────────────────────
  // Klick auf die Kante wählt sie aus (s. Hit-Line im Rendering) — dieselbe
  // Selektion steuert Highlight (Ansehen), das Editier-Overlay (Ändern) und
  // die Entf-Taste (Löschen). Kein Kontextmenü, kein Formular — Muster aus
  // Phase 5A 1:1 auf Kanten übertragen: HTML-Overlay am Kantenmittelpunkt,
  // Text kommt aus dem bestehenden Beziehungstyp/Label, "Ändern" läuft über
  // dieselbe Frei-Text-Logik wie das Anlegen (resolveRelationTypeId oben),
  // inklusive derselben Duplikat-Rückmeldung wie in Punkt 1.
  interface EdgeEditDraft { edgeId: string; value: string; originalValue: string; }
  const [edgeEditDraft, setEdgeEditDraft] = useState<EdgeEditDraft | null>(null);
  const [edgeEditError, setEdgeEditError] = useState<string | null>(null);
  const [isEditingEdgeLabel, setIsEditingEdgeLabel] = useState(false);

  // Initialisiert den Entwurf nur bei Auswahl-Wechsel, nicht bei jeder
  // state-Änderung — dieselbe Überlegung wie beim editingValue-Entwurf der
  // Titel-Bearbeitung oben (sonst würde gerade getippter Text durch
  // unabhängige Änderungen anderswo überschrieben).
  useEffect(() => {
    if (!selection.selectedEdgeId) { setEdgeEditDraft(null); setEdgeEditError(null); return; }
    const edge = state.edgesById.get(selection.selectedEdgeId);
    if (!edge) { setEdgeEditDraft(null); return; }
    const relationType = state.relationTypesById.get(edge.relationTypeId);
    const currentLabel = edge.label || relationType?.label || '';
    setEdgeEditDraft({ edgeId: edge.id, value: currentLabel, originalValue: currentLabel });
    setEdgeEditError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.selectedEdgeId]);

  const cancelEdgeEdit = () => {
    setEdgeEditDraft(prev => prev && { ...prev, value: prev.originalValue });
    setEdgeEditError(null);
  };

  const commitEdgeEdit = () => {
    if (!edgeEditDraft) return;
    const label = edgeEditDraft.value.trim();
    if (label.length === 0) { cancelEdgeEdit(); return; } // leer = keine Änderung, bestehender Typ bleibt

    const edge = state.edgesById.get(edgeEditDraft.edgeId);
    if (!edge) return;

    const resolved = resolveRelationTypeId(label);
    if (resolved.error || !resolved.relationTypeId) { setEdgeEditError(resolved.error ?? null); return; }
    if (resolved.relationTypeId === edge.relationTypeId) { setEdgeEditError(null); return; } // unverändert (auch nach Groß-/Kleinschreibung), kein Commit nötig

    const result = recordUpdateEdge(history, resolved.workingState, edgeEditDraft.edgeId, { relationTypeId: resolved.relationTypeId });
    if (result.error || !result.entity) {
      // Genau dieselbe Rückmeldung wie beim Neu-Anlegen (Punkt 1) — ein
      // Duplikat-Versuch beim Umbenennen darf ebenso wenig kommentarlos
      // verpuffen.
      setEdgeEditError(result.error ?? 'Diese Änderung konnte nicht gespeichert werden.');
      return;
    }
    setEdgeEditError(null);
    onChange({ state: result.state, history: result.history });
    onEntityChanged?.({ kind: 'edge', entity: result.entity });
    setEdgeEditDraft(prev => prev && { ...prev, originalValue: label });
  };

  const deleteSelectedEdge = () => {
    if (!selection.selectedEdgeId) return;
    const result = recordArchiveEdge(history, state, selection.selectedEdgeId);
    if (!result.error && result.entity) {
      onChange({ state: result.state, history: result.history });
      onSelectionChange(clearSelection(selection));
      onEntityChanged?.({ kind: 'edge', entity: result.entity });
    }
  };

  // ── Node/Kante löschen über die Entf-Taste (Phase 5A Punkt 3, Phase 5B) ──
  // Bewusst archiveNode/archiveEdge (undo-fähig, Soft Delete), nicht
  // purgeNode — das endgültige Löschen bleibt eine bewusste Zweitaktion, s.
  // Datenmodell. "Noch keine perfekte UX" (User-Vorgabe) — kein
  // Kontextmenü, keine Bestätigung, nur die Taste. Reagiert nicht, während
  // Titel ODER Kanten-Label gerade bearbeitet werden (eigene Overlays dieser
  // Komponente) oder während gezogen wird. selectedNodeId/selectedEdgeId
  // schließen sich gegenseitig aus (s. graphSelectionService), deshalb reicht
  // ein einzelner Handler für beide.
  //
  // Zusätzlich: ein generischer document.activeElement-Check statt eines
  // weiteren komponenteneigenen "isEditingX"-State-Flags — Titel/Notiz lagen
  // beide früher als Overlay direkt in dieser Datei, seit Phase 2 leben
  // Beschreibung/Notiz im GraphNodeDetailPanel (eigene Komponente, kein
  // direkter Zugriff auf den State hier). Der generische Check funktioniert
  // unabhängig davon, WO ein Eingabefeld sitzt, und schützt automatisch auch
  // jedes künftige Textfeld einer späteren Phase (Quellen, Verwandte
  // Konzepte), ohne dass diese Datei davon wissen muss.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      const isTypingElsewhere = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
      if (editingNodeId || isEditingEdgeLabel || nodeDrag || edgeDraft || isTypingElsewhere) return;
      if (e.key !== 'Delete') return;
      if (selection.selectedNodeId) {
        e.preventDefault();
        const result = recordArchiveNode(history, state, selection.selectedNodeId);
        if (!result.error && result.entity) {
          onChange({ state: result.state, history: result.history });
          onSelectionChange(clearSelection(selection));
          onEntityChanged?.({ kind: 'node', entity: result.entity });
        }
      } else if (selection.selectedEdgeId) {
        e.preventDefault();
        deleteSelectedEdge();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNodeId, isEditingEdgeLabel, nodeDrag, edgeDraft, selection, history, state, onChange, onSelectionChange, onEntityChanged]);

  // ── Hintergrund: Klick = Auswahl aufheben, Doppelklick = neuer Node ─────
  const handleBackgroundClick = () => onSelectionChange(clearSelection(selection));

  const handleBackgroundDoubleClick = (e: React.MouseEvent) => {
    const position = clientToGraphPoint(e.clientX, e.clientY);
    // Echter Bug (User-Fund 2026-08-04, "nur EIN Wissensnetz"): collectionId
    // fehlte hier komplett — neue Nodes landeten unabhängig vom gerade
    // aktiven Fach immer ohne Fach-Zuordnung, dadurch verschwanden sie beim
    // nächsten Laden aus dem fachspezifischen Wissensnetz. state.scope
    // trägt bereits, welches Fach aktuell aktiv ist (s. GraphSystem.tsx).
    const collectionId = state.scope.kind === 'collection' ? state.scope.collectionId : undefined;
    // User-Vorgabe 2026-08-04: der erste Node eines Fachs ist in der Praxis
    // immer das Hauptthema (z.B. "Bio", benannt wie das Modul) — soll direkt
    // golden starten statt erst über den Hierarchie-Klick-Zyklus manuell
    // dorthin geschaltet werden zu müssen. Nur beim allerersten Node
    // (activeNodes leer), jeder weitere bleibt ohne Vorbelegung wie bisher.
    const hierarchyLevel = activeNodes.length === 0 ? 'hauptthema' : undefined;
    const result = recordCreateNode(history, state, { title: 'Neuer Node', position, collectionId, hierarchyLevel });
    if (!result.error && result.entity) {
      onChange({ state: result.state, history: result.history });
      onSelectionChange(selectNode(selection, result.entity.id));
      onEntityChanged?.({ kind: 'node', entity: result.entity });
      // Sofort umbenennbar (Phase 5A Punkt 2) — der Platzhaltertitel ist nur
      // die Voraussetzung für den nicht-leeren-Titel-Constraint, nicht das,
      // was der Nutzer eigentlich benennen wollte. Text ist vorausgewählt
      // (s. beginEditingTitle-Effekt), der erste Tastendruck ersetzt ihn.
      beginEditingTitle(result.entity.id, result.entity.title);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: wnTheme.canvasBg, transition: 'background .4s ease' }}>
      <style>{`
        @keyframes wnFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes wnBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.025); } }
        @media (prefers-reduced-motion: reduce) {
          .wn-float, .wn-breathe { animation: none !important; }
          .wn-pulse { display: none; }
        }
      `}</style>
      {selection.selectedNodeId && state.nodesById.get(selection.selectedNodeId) && (
        <div className="absolute top-3 left-4 z-10 pointer-events-none">
          <p className="m-0 text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: wnTheme.focusEyebrow }}>Fokus</p>
          <p className="m-0 mt-0.5 text-sm font-bold" style={{ color: wnTheme.focusLabel }}>
            {state.nodesById.get(selection.selectedNodeId)!.title}
          </p>
        </div>
      )}
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <button onClick={() => zoomBy(1.3)} aria-label="Vergrößern" className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-black" style={{ background: wnTheme.chipBg, border: `1px solid ${wnTheme.chipBorder}`, color: wnTheme.chipText, backdropFilter: 'blur(6px)' }}>+</button>
        <button onClick={() => zoomBy(1 / 1.3)} aria-label="Verkleinern" className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-black" style={{ background: wnTheme.chipBg, border: `1px solid ${wnTheme.chipBorder}`, color: wnTheme.chipText, backdropFilter: 'blur(6px)' }}>−</button>
        <button onClick={fitView} aria-label="Ansicht einpassen" className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ background: wnTheme.chipBg, border: `1px solid ${wnTheme.chipBorder}`, color: wnTheme.chipText, backdropFilter: 'blur(6px)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
      </div>
      <svg
        ref={svgRef}
        className="w-full h-full"
        onClick={handleBackgroundClick}
        onDoubleClick={handleBackgroundDoubleClick}
      >
        <defs>
          <radialGradient id="wnPulseGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFF3D2" stopOpacity="1" />
            <stop offset="40%" stopColor="#D9A94E" stopOpacity=".9" />
            <stop offset="100%" stopColor="#D9A94E" stopOpacity="0" />
          </radialGradient>
          {(['night', 'day'] as const).map(mode => (
            (['focus', 'neighbor', 'far'] as const).map(tier => {
              const c = WN_THEME[mode].tier[tier];
              return (
                <radialGradient key={`${mode}-${tier}`} id={WN_THEME[mode].gradientId[tier]} cx="35%" cy="30%" r="70%">
                  <stop offset="0%" stopColor={c.bg} stopOpacity="1" />
                  <stop offset="100%" stopColor={c.bg} stopOpacity=".72" />
                </radialGradient>
              );
            })
          ))}
        </defs>
        <g ref={gRef}>
          <AnimatePresence initial={false}>
            {visibleEdges.map(edge => {
              const { x1, y1, x2, y2, midX, midY } = computeEdgeGeometry(edge);
              const edgeSelected = isEdgeSelected(selection, edge.id);
              // Bedeutung direkt auf der Fläche sichtbar (Phase 5B Punkt 2) —
              // ohne Menü/Inspector. `label` ist der Freitext-Override am
              // Edge-Datensatz (heute von keiner UI gesetzt, aber
              // vorrangig falls vorhanden), sonst der Name des Beziehungstyps.
              const relationType = edge.relationTypeId ? state.relationTypesById.get(edge.relationTypeId) : undefined;
              const rawLabel = edge.label || relationType?.label || '';
              // Kein Abschneiden mehr (User-Vorgabe 2026-08-04, verschärft
              // 2026-08-05) — bei Bedarf mehrzeilig statt mit "…" gekürzt,
              // wie bei den Node-Titeln (bis zu EDGE_LABEL_MAX_LINES Zeilen).
              const labelLines = rawLabel ? wrapTitleAllLines(rawLabel, EDGE_LABEL_MAX_WIDTH, 9, 500, EDGE_LABEL_MAX_LINES).lines : [];
              const labelOffsetY = (edgeParallelIndex.get(edge.id) ?? 0) * (14 + Math.max(0, labelLines.length - 1) * 11);
              // Kanten-Nähe-Stufe wie bei Nodes: berührt sie den Fokus-Node
              // ODER einen Gold-Hauptthema-Node (User-Feedback: der Gold-Node
              // sieht sonst wie der Fokus aus, ohne dass seine Kanten
              // mitpulsen), ist sie 'focus' (bekommt den wandernden
              // Lichtpuls, s. Design-Handoff — Gold NUR als Puls, nie als
              // Ambient-Deko), berührt sie nur einen Nachbarn, 'neighbor',
              // sonst 'far'.
              const touchesFocus =
                (selection.selectedNodeId != null && (edge.sourceNodeId === selection.selectedNodeId || edge.targetNodeId === selection.selectedNodeId)) ||
                isGoldIdentityNode(edge.sourceNodeId) || isGoldIdentityNode(edge.targetNodeId);
              const edgeTier: 'focus' | 'neighbor' | 'far' = touchesFocus ? 'focus' : (!selection.selectedNodeId ? 'neighbor' : 'far');
              const edgeColor = wnTheme.edge[edgeTier];
              const edgeOpacity = edgeTier === 'focus' ? 0.75 : edgeTier === 'neighbor' ? 0.5 : 0.22;
              const pulseId = `wnpulse-${edge.id}`;
              return (
                <motion.g
                  key={edge.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Unsichtbarer breiter Hit-Bereich (Phase 5B) — die
                      sichtbare Linie selbst ist mit 2px zu schmal, um
                      zuverlässig klickbar zu sein. */}
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="transparent" strokeWidth={14}
                    onClick={e => { e.stopPropagation(); onSelectionChange(selectEdge(selection, edge.id)); }}
                    style={{ cursor: 'pointer' }}
                  />
                  {relationType?.symmetric && (
                    <line
                      x1={x1} y1={y1 + 3} x2={x2} y2={y2 + 3}
                      stroke={edgeSelected ? wnTheme.focusLabel : edgeColor}
                      strokeWidth={edgeSelected ? 2 : 1.2}
                      strokeLinecap="round"
                      opacity={edgeSelected ? 1 : edgeOpacity}
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={edgeSelected ? wnTheme.focusLabel : edgeColor}
                    strokeWidth={edgeSelected ? 3 : 1.4}
                    strokeLinecap="round"
                    opacity={edgeSelected ? 1 : edgeOpacity}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Wandernder Lichtpuls (Design-Handoff: "Golden dots exist
                      ONLY as these traveling pulses") — auf jeder Kante, die
                      über einen durchgehenden Pfad mit dem ausgewählten/
                      Gold-Hauptthema-Node zusammenhängt (pulseDepthByEdge),
                      nicht mehr nur 1 Hop weit. Tiefen-abhängige Verzögerung
                      zusätzlich zum bisherigen Pro-Kante-Jitter (organischer
                      Startversatz) lässt das Signal sichtbar nach außen
                      wandern statt überall gleichzeitig aufzuleuchten. */}
                  {pulseDepthByEdge.has(edge.id) && (
                    <circle r={3.2} fill="url(#wnPulseGrad)" className="wn-pulse" style={{ pointerEvents: 'none' }}>
                      <animateMotion
                        dur="3.6s"
                        begin={`${(pulseDepthByEdge.get(edge.id) ?? 0) * PULSE_DEPTH_STAGGER_S + (hashId(pulseId) % 10) / 10 * PULSE_JITTER_MAX_S}s`}
                        repeatCount="indefinite"
                        path={`M${x1},${y1} L${x2},${y2}`}
                        calcMode="linear"
                      />
                    </circle>
                  )}
                  {/* Während der Bearbeitung übernimmt das HTML-Overlay
                      (Editier-Input) exakt dieselbe Stelle — Label hier
                      ausblenden statt doppelt zu rendern. Bewusst horizontal
                      (nicht mit der Kante rotiert): bleibt bei jedem
                      Kantenwinkel aufrecht lesbar, wie die Node-Titel auch.
                      Design-Handoff v3: keine Pillen-Kapsel mehr — schlichter
                      kursiver Text mit weichem Leucht-Schatten, wirkt als Teil
                      der Synapse statt als schwebendes UI-Badge. */}
                  {!edgeSelected && labelLines.length > 0 && (
                    <text
                      textAnchor="middle"
                      fontStyle="italic"
                      className="text-[9px] font-medium select-none"
                      fill={edgeTier === 'focus' ? wnTheme.label.focus : wnTheme.label.far}
                      style={{ pointerEvents: 'none', filter: `drop-shadow(0 0 3px ${isDark ? '#08111E' : '#F5F1E7'})` }}
                    >
                      {labelLines.map((line, i) => (
                        <tspan key={i} x={midX} y={midY + labelOffsetY + 3 + i * 11}>{line}</tspan>
                      ))}
                    </text>
                  )}
                </motion.g>
              );
            })}
            {edgeDraft && (
              <line
                x1={positionOf(edgeDraft.sourceNodeId).x} y1={positionOf(edgeDraft.sourceNodeId).y}
                x2={edgeDraft.pointer.x} y2={edgeDraft.pointer.y}
                stroke={wnTheme.focusLabel} strokeWidth={2} strokeDasharray="4 4"
              />
            )}
            {activeNodes.map(node => {
              const pos = nodeDrag?.nodeId === node.id ? nodeDrag.currentPos : positionOf(node.id);
              const selected = isSelected(selection, node.id);
              const hovered = isHovered(selection, node.id);
              const tier = tierOf(node.id);
              const tc = tierColorsOf(tier);
              const { rx, ry } = nodeExtentsOf(node.id);
              const blobD = blobPathD(rx, ry, node.id);
              // Hauptthema-Nodes sind standardmäßig Gold — ihre "Identität",
              // nicht nur der Fokus-Zustand (User-Wunsch 2026-08-04, "wie im
              // Bsp"). Bleibt bewusst golden auch als Nachbar/Fern-Node (nur
              // Deckkraft/Unschärfe folgen weiterhin der Nähe-Stufe wie bei
              // jedem anderen Node) — eine eigene, nutzerdefinierte Farbe
              // (node.color) hat immer Vorrang.
              const identityTier = identityTierOf(node.id);
              // identityTier === 'far' kommt ausschließlich von
              // hierarchyLevel === 'detail' (s. HIERARCHY_IDENTITY_TIER) —
              // eindeutig genug, kein zusätzlicher hierarchyLevel-Check nötig.
              const isDetailIdentity = identityTier === 'far';
              const fill = node.color
                || (isDetailIdentity ? DETAIL_IDENTITY_COLOR : undefined)
                || `url(#${wnTheme.gradientId[identityTier ?? (tier === 'neutral' ? 'neighbor' : tier)]})`;
              const glowColor = isDetailIdentity ? DETAIL_IDENTITY_COLOR : identityTier ? wnTheme.tier[identityTier].glow : tc.glow;
              const isFocusTier = tier === 'focus';
              return (
                <motion.g
                  key={node.id}
                  {...{ [NODE_DATA_ATTR]: true }}
                  initial={shouldReduceMotion
                    ? { x: pos.x, y: pos.y, opacity: 1, scale: 1 }
                    : { x: pos.x, y: pos.y, opacity: 0, scale: 0.6 }}
                  animate={{ x: pos.x, y: pos.y, opacity: 1, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
                  onMouseDown={e => handleNodePointerDown(e, node.id)}
                  onMouseUp={e => handleNodePointerUp(e, node.id)}
                  // Verhindert, dass das native, nach mousedown+mouseup
                  // automatisch ausgelöste click-Event zum Hintergrund
                  // hochbubbelt und dort die gerade erst gesetzte Auswahl
                  // sofort wieder löscht (handleBackgroundClick).
                  onClick={e => e.stopPropagation()}
                  // stopPropagation verhindert weiterhin, dass der Doppelklick
                  // bis zum Hintergrund durchbubbelt und dort einen zweiten
                  // Node anlegt (Phase 5A Punkt 1) — zusätzlich öffnet er jetzt
                  // die Titel-Bearbeitung (Punkt 2), statt nur ins Leere zu laufen.
                  onDoubleClick={e => { e.stopPropagation(); beginEditingTitle(node.id, node.title); }}
                  onMouseEnter={() => onSelectionChange(hoverNode(selection, node.id))}
                  onMouseLeave={() => onSelectionChange(hoverNode(selection, undefined))}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Leichtes, pro Node festes Schweben/Atmen (Design-Handoff)
                      — CSS-Animation statt framer-motion, damit sie parallel
                      zu Drag/Zoom-Transforms unabhängig läuft. */}
                  <g
                    className={isFocusTier ? 'wn-breathe' : 'wn-float'}
                    style={{
                      // Verzögerung bewusst IN der Shorthand statt als
                      // separates animationDelay — React warnt sonst vor
                      // widersprüchlichen Kurz-/Langform-Eigenschaften im
                      // selben Style-Objekt (Reihenfolge-abhängiger Bug).
                      animation: `${isFocusTier ? 'wnBreathe 6s' : `wnFloat ${(5 + (hashId(node.id) % 30) / 10).toFixed(1)}s`} ease-in-out ${(hashId(node.id) % 30) / 10}s infinite`,
                      // Ohne transformBox bezieht sich transform-origin bei
                      // SVG-Elementen auf den Viewport der gesamten Kanvas,
                      // nicht auf den Node selbst — die Animation lief zwar,
                      // war aber je nach Node-Position unsichtbar oder verzerrt.
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                      filter: tc.blurPx ? `blur(${tc.blurPx}px)` : undefined,
                    }}
                  >
                    {/* Glut hinter dem Node — reine Deko, nimmt keine Klicks entgegen. */}
                    <path d={blobD} fill={glowColor} opacity={tc.glowOpacity} style={{ filter: `blur(${Math.max(8, ry * 0.35)}px)`, pointerEvents: 'none' }} transform="scale(1.15)" />
                    <path
                      d={blobD}
                      fill={fill}
                      opacity={tc.opacity}
                      stroke={tc.border}
                      strokeWidth={(node.hierarchyLevel ? HIERARCHY_STROKE_WIDTH[node.hierarchyLevel] : HIERARCHY_STROKE_WIDTH.unterthema) + (selected ? SELECTED_STROKE_BONUS : 0)}
                    />
                    {editingNodeId !== node.id && (() => {
                      const titleFontWeight = node.hierarchyLevel === 'hauptthema' ? 800 : node.hierarchyLevel === 'detail' ? 600 : 700;
                      // 0.86 statt voller Durchmesser als Sicherheitsabstand
                      // zum Rand — die Messung selbst ist jetzt exakt, der
                      // Puffer ist reiner Gestaltungsspielraum, kein Ausgleich
                      // für eine ungenaue Schätzung mehr.
                      const maxWidth = rx * 2 * 0.86;
                      const { lines: titleLines, fontSize: titleFontSize } = wrapTitleAdaptive(node.title, maxWidth, titleFontWeight);
                      const titleColor = node.color ? '#fff' : tc.text;
                      // Zeilenabstand skaliert mit der (ggf. verkleinerten)
                      // Schrift, statt bei kleinerer Schrift unnötig viel
                      // Luft zwischen den Zeilen zu lassen.
                      const lineStep = titleFontSize * 1.1;
                      return (
                        <text
                          textAnchor="middle"
                          fontSize={titleFontSize}
                          className="select-none"
                          fontWeight={titleFontWeight}
                          fill={titleColor}
                          style={{ pointerEvents: 'none' }}
                        >
                          {titleLines.length === 1 ? (
                            <tspan x={0} y={4}>{titleLines[0]}</tspan>
                          ) : (
                            titleLines.map((line, li) => (
                              <tspan key={li} x={0} y={(li - (titleLines.length - 1) / 2) * lineStep + 4}>
                                {line}
                              </tspan>
                            ))
                          )}
                        </text>
                      );
                    })()}
                  </g>
                  {(hovered || selected) && (
                    <g onMouseDown={e => handleHandlePointerDown(e, node.id)} style={{ cursor: 'crosshair' }}>
                      {/* Unsichtbarer, deutlich größerer Trefferbereich um den
                          sichtbaren Punkt (User-Fund 2026-08-04: der 6px-Punkt
                          allein war kaum zu treffen — verpasste Klicks landeten
                          auf dem Node darunter, wiederholte Versuche lösten
                          dabei unbeabsichtigt den Doppelklick-Titel-Editor
                          aus). Rein fürs Hit-Testing, keine visuelle Änderung
                          über den sichtbaren Punkt hinaus. */}
                      <circle cx={rx + HANDLE_OFFSET} cy={0} r={HANDLE_RADIUS + 8} fill="transparent" />
                      <circle cx={rx + HANDLE_OFFSET} cy={0} r={HANDLE_RADIUS} fill={wnTheme.focusLabel} style={{ pointerEvents: 'none' }} />
                    </g>
                  )}
                  {/* Wissensnetz-Coach, erster Baustein: dezenter, immer
                      sichtbarer Hinweis-Punkt (nicht nur bei Hover/Auswahl wie
                      der Handle) — bewusst KEINE Warnfarbe (rot/rose ist app-weit
                      für "kritisch/schwach" reserviert), reiner Beobachtungston.
                      Native <title> statt eigenem Tooltip-Bau — genügt für v1. */}
                  {nodeInsightsByNode?.has(node.id) && (
                    <g style={{ pointerEvents: 'none' }}>
                      <circle cx={-rx * 0.72} cy={-ry * 0.72} r={5} fill={wnTheme.chipText} opacity={0.85} stroke={wnTheme.chipBg} strokeWidth={1.5}>
                        <title>{INSIGHT_LABELS[nodeInsightsByNode.get(node.id)![0].type]}{nodeInsightsByNode.get(node.id)!.length > 1 ? ` (+${nodeInsightsByNode.get(node.id)!.length - 1} weitere)` : ''}</title>
                      </circle>
                    </g>
                  )}
                </motion.g>
              );
            })}
          </AnimatePresence>
        </g>
      </svg>
      {editingNodeId && (() => {
        const pos = positionOf(editingNodeId);
        const screenX = zoomTransform.x + zoomTransform.k * pos.x;
        const screenY = zoomTransform.y + zoomTransform.k * pos.y;
        return (
          <input
            ref={editInputRef}
            value={editingValue}
            onChange={e => setEditingValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitleEdit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancelTitleEdit(); }
            }}
            onBlur={commitTitleEdit}
            className="absolute text-[10px] font-bold text-center rounded-md px-1 py-1 outline-none border-2 bg-white dark:bg-slate-800 dark:text-white"
            style={{
              left: screenX, top: screenY, transform: 'translate(-50%, -50%)',
              width: Math.max(nodeExtentsOf(editingNodeId).rx * 2 + 16, radiusOf(editingNodeId) * 2 + 16), borderColor: 'var(--primary)', zIndex: 20,
            }}
          />
        );
      })()}
      {edgePrompt && (() => {
        const screenX = zoomTransform.x + zoomTransform.k * edgePrompt.position.x;
        const screenY = zoomTransform.y + zoomTransform.k * edgePrompt.position.y;
        return (
          <div className="absolute" style={{ left: screenX, top: screenY, transform: 'translate(-50%, -50%)', zIndex: 25 }}>
            <input
              ref={edgePromptInputRef}
              value={edgePrompt.value}
              placeholder="Beziehung eingeben (optional)…"
              onChange={e => {
                setEdgePrompt(prev => prev && { ...prev, value: e.target.value });
                setEdgePromptError(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdgePrompt(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelEdgePrompt(); }
              }}
              onBlur={cancelEdgePrompt}
              className="text-[10px] font-bold rounded-md px-2 py-1.5 outline-none border-2 bg-white dark:bg-slate-800 dark:text-white"
              style={{ width: 160, borderColor: edgePromptError ? '#ef4444' : 'var(--primary)' }}
            />
            {edgePromptError && (
              <div
                className="text-[9px] font-bold text-rose-500 bg-white dark:bg-slate-800 rounded px-1.5 py-1 shadow-sm mt-1"
                style={{ maxWidth: 220 }}
              >
                {edgePromptError}
              </div>
            )}
          </div>
        );
      })()}
      {selection.selectedEdgeId && edgeEditDraft && (() => {
        const edge = state.edgesById.get(selection.selectedEdgeId!);
        if (!edge) return null;
        const { midX, midY } = computeEdgeGeometry(edge);
        // Derselbe Versatz wie beim Label-Rendering oben (inkl. der
        // größeren Schrittweite bei zweizeiligen Labels) — sonst würde das
        // Overlay beim Auswählen einer von mehreren parallelen Kanten an
        // eine andere Stelle springen als das gerade sichtbare Label.
        const ownRelationType = edge.relationTypeId ? state.relationTypesById.get(edge.relationTypeId) : undefined;
        const ownRawLabel = edge.label || ownRelationType?.label || '';
        const ownLineCount = ownRawLabel ? wrapTitleAllLines(ownRawLabel, EDGE_LABEL_MAX_WIDTH, 9, 500, EDGE_LABEL_MAX_LINES).lines.length : 1;
        const labelOffsetY = (edgeParallelIndex.get(edge.id) ?? 0) * (14 + Math.max(0, ownLineCount - 1) * 11);
        const screenX = zoomTransform.x + zoomTransform.k * midX;
        const screenY = zoomTransform.y + zoomTransform.k * (midY + labelOffsetY);
        return (
          <div className="absolute flex items-center gap-1" style={{ left: screenX, top: screenY, transform: 'translate(-50%, -50%)', zIndex: 25 }}>
            <input
              value={edgeEditDraft.value}
              onChange={e => {
                setEdgeEditDraft(prev => prev && { ...prev, value: e.target.value });
                setEdgeEditError(null);
              }}
              onFocus={() => setIsEditingEdgeLabel(true)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdgeEdit(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelEdgeEdit(); }
              }}
              onBlur={() => { setIsEditingEdgeLabel(false); commitEdgeEdit(); }}
              className="text-[10px] font-bold rounded-md px-2 py-1.5 outline-none border-2 bg-white dark:bg-slate-800 dark:text-white"
              style={{ width: 140, borderColor: edgeEditError ? '#ef4444' : 'var(--primary)' }}
            />
            {onExplainEdge && (
              <button
                onClick={() => onExplainEdge(edge.id)}
                title="Beziehung erklären"
                className="h-6 px-2 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 text-[9px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-300 border shrink-0"
                style={{ borderColor: 'var(--border-color, #e2e8f0)' }}
              >
                Erklären
              </button>
            )}
            <button
              onClick={deleteSelectedEdge}
              title="Beziehung löschen"
              className="w-6 h-6 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 text-rose-500 border shrink-0 font-bold"
              style={{ borderColor: 'var(--border-color, #e2e8f0)' }}
            >
              ×
            </button>
            {edgeEditError && (
              <div
                className="absolute text-[9px] font-bold text-rose-500 bg-white dark:bg-slate-800 rounded px-1.5 py-1 shadow-sm"
                style={{ maxWidth: 220, top: '100%', left: 0, marginTop: 4 }}
              >
                {edgeEditError}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
