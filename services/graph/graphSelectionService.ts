/**
 * Rein ephemerer UI-Auswahlzustand — wird NICHT synchronisiert, NICHT in
 * GraphState/localStorage gehalten (s. KNOWLEDGE_GRAPH_PHASE1_PLAN.md
 * Abschnitt 3/4: Auswahl ändert sich bei jeder Mausbewegung, gehört deshalb
 * nie in den normalisierten, potenziell großen GraphState).
 *
 * Bewusst framework-agnostisch (kein React-Hook) — pure Zustandsfunktionen,
 * testbar wie graphHistoryService.ts. Die spätere Canvas-Komponente hält das
 * Ergebnis in einem einfachen useState und ruft diese Funktionen auf.
 *
 * Wichtig für die Produktvision (Node als Einstiegspunkt zu Dokument/
 * Karteikarten/Quiz/Feynman/KI-Erklärung, nicht nur "Kreis mit Text"): Diese
 * Datei kennt nur "welcher Node ist ausgewählt", nichts von Dokumenten/
 * Karteikarten/Quiz. Ein künftiges Seitenpanel hängt sich an genau dieselbe
 * Selection — die Rendering-Engine muss dafür nicht angefasst werden.
 */

export interface GraphSelectionState {
  selectedNodeId?: string;
  hoveredNodeId?: string;
  /** Grundlage für den künftigen Fokus-Modus (Produkt-Roadmap Phase 2) —
   *  heute nur der Datenhaltungs-Platz dafür, noch kein Konsument. */
  focus?: { nodeId: string; hops: number };
}

export const createEmptySelection = (): GraphSelectionState => ({});

export const selectNode = (selection: GraphSelectionState, nodeId: string): GraphSelectionState => ({
  ...selection,
  selectedNodeId: nodeId,
});

export const clearSelection = (selection: GraphSelectionState): GraphSelectionState => ({
  ...selection,
  selectedNodeId: undefined,
});

export const hoverNode = (selection: GraphSelectionState, nodeId: string | undefined): GraphSelectionState => ({
  ...selection,
  hoveredNodeId: nodeId,
});

export const setFocus = (selection: GraphSelectionState, nodeId: string, hops: number): GraphSelectionState => ({
  ...selection,
  focus: { nodeId, hops },
});

export const clearFocus = (selection: GraphSelectionState): GraphSelectionState => ({
  ...selection,
  focus: undefined,
});

export const isSelected = (selection: GraphSelectionState, nodeId: string): boolean =>
  selection.selectedNodeId === nodeId;

export const isHovered = (selection: GraphSelectionState, nodeId: string): boolean =>
  selection.hoveredNodeId === nodeId;
