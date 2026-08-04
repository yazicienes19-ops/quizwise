import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProcessedDocument } from '../types';
import type { GraphEdge, GraphState, GraphEntityChange } from '../services/graph/types';
import { HIERARCHY_LEVEL_LABELS, nextHierarchyLevel } from '../services/graph/types';
import { type GraphHistory, recordUpdateNode } from '../services/graph/graphHistoryService';
import { createNodeDocumentRef } from '../services/graph/graphMutationService';
import { buildGraphIndex, outgoingEdges, incomingEdges } from '../services/graph/graphIndex';
import { documentDisplayName } from '../services/libraryService';
import { useTranslation } from '../i18n/I18nProvider';

/**
 * Rechte Seitenleiste des Wissensnetzes (s. KNOWLEDGE_GRAPH_KONZEPT.md
 * Abschnitt 2 für die vollständige, verbindliche 7-Abschnitt-Struktur).
 * Phase 2: Kopfbereich, Beschreibung, Eigene Notizen. Phase 3: Eigene
 * Unterlagen (Dokumente verknüpfen/anzeigen/öffnen). Phase 4: Verwandte
 * Konzepte (direkt verbundene Nodes, lesbar statt Graph-technisch, Klick
 * springt zum Node). Architektonisch ein Geschwister von GraphCanvas, keine
 * Eltern-Kind-Beziehung: beide bekommen
 * dieselben state/history/onChange/onEntityChanged-Props vom Aufrufer
 * (GraphSystem/GraphDevHarness) und rufen unabhängig voneinander Domain-
 * Funktionen auf — exakt dasselbe Muster wie GraphCanvas selbst, keine neue
 * Architekturschicht.
 *
 * Notiz- und Hierarchie-Bearbeitung sind bewusst aus GraphCanvas HIERHER
 * umgezogen (nicht dupliziert) — zwei Bearbeitungsorte für dasselbe Feld
 * gleichzeitig sichtbar hätte "kein Dashboard, ein Informationszentrum"
 * direkt widersprochen. Titel bleibt bewusst NUR auf dem Canvas editierbar
 * (Doppelklick, seit Phase 5A) — hier nur lesend angezeigt, um diese Phase
 * klein zu halten; Node-Typ ist in der gesamten App noch nirgends editierbar
 * (auch hier nur ein Anzeige-Badge).
 *
 * Bewusst ein absolut positioniertes Overlay über dem Canvas, kein Resize der
 * Kanvasfläche: Öffnen/Schließen verändert dadurch nie Zoom/Pan/Viewport-
 * Größe des Graphen — die räumliche Orientierung bleibt garantiert erhalten,
 * und es gibt nichts an Layout neu zu berechnen (Performance).
 *
 * "Eigene Unterlagen" öffnet den bestehenden Reader NICHT selbst — dieses
 * Panel meldet nur `onOpenDocument(documentId)` nach oben, GraphSystem.tsx
 * entscheidet, WIE der Reader erscheint (Variante A: Portal-Overlay, s.
 * dortiger Datei-Kommentar). Kein Löschen einer Verknüpfung in dieser Phase
 * (bewusst, s. Umsetzungsbericht) — nur Anlegen und Ansehen.
 *
 * "Verwandte Konzepte" beantwortet bewusst "Wie hängt das mit anderem Wissen
 * zusammen?", nicht "welche Kanten existieren?" — jede Zeile ist ein ganzer,
 * lesbarer Satzfetzen ("→ gehört zu Behaviorismus"), keine rohe Kantenliste.
 * Klick auf einen Eintrag meldet nur `onSelectNode(nodeId)` nach oben (exakt
 * dasselbe Muster wie `onOpenDocument`) — auch das ist bewusst KEIN neuer
 * Navigationsmechanismus, sondern derselbe Selektionswechsel, den ein Klick
 * auf den Node im Canvas ohnehin auslöst. Weil dabei nichts unmountet und
 * kein Code die Kamera bewegt, bleiben Zoom/Pan garantiert unverändert.
 * Keine Beziehung lässt sich hier anlegen/löschen (nur auf dem Canvas per
 * Kante ziehen) — dieser Abschnitt ist bewusst rein lesend/navigierend.
 *
 * Phase 5 ("Aktiv lernen"): schmale Aktionszeile, keine Dashboard-Kacheln —
 * vier Buttons (Karteikarten/Quiz/Feynman/KI-Erklärung), die nur
 * `onStartActivity(kind)` nach oben melden. Dieses Panel weiß nichts davon,
 * WIE eine Aktivität aussieht (GraphSystem.tsx entscheidet das, s. dortiger
 * Kommentar zu GraphLearningOverlay) — exakt dasselbe Melde-Muster wie
 * `onOpenDocument`/`onSelectNode`.
 */

export interface GraphNodeDetailPanelProps {
  state: GraphState;
  history: GraphHistory;
  nodeId: string;
  documents: ProcessedDocument[];
  onChange: (next: { state: GraphState; history: GraphHistory }) => void;
  onEntityChanged?: (change: GraphEntityChange) => void;
  onClose: () => void;
  /** Öffnet den bestehenden Reader als Overlay — s. GraphSystem.tsx
   *  ("Variante A"). Dieses Panel weiß nichts vom Reader selbst, nur die ID. */
  onOpenDocument: (documentId: string) => void;
  /** Phase 4 ("Verwandte Konzepte"): Klick auf einen verwandten Begriff
   *  wechselt nur die Auswahl (derselbe Mechanismus wie ein Klick auf den
   *  Node im Canvas selbst) — der Aufrufer (GraphSystem/GraphDevHarness)
   *  ruft dafür `selectNode(selection, nodeId)` auf. Das Panel kennt
   *  `GraphSelectionState` bewusst nicht, nur die Ziel-ID. Weil GraphCanvas
   *  dabei nicht unmountet und die Auswahl nie den Viewport verschiebt,
   *  bleiben Zoom/Pan automatisch unverändert — keine eigene Logik dafür nötig. */
  onSelectNode: (nodeId: string) => void;
  /** Phase 5 ("Aktiv lernen"): meldet nur, WELCHE Aktivität gestartet werden
   *  soll — GraphSystem.tsx entscheidet, wie sie als Overlay erscheint
   *  (GraphLearningOverlay). */
  onStartActivity: (activity: 'flashcards' | 'quiz' | 'feynman' | 'explain') => void;
}

const typeLabel = (type: string): string => type.length > 0 ? type.charAt(0).toUpperCase() + type.slice(1) : type;

/** Kuratierte Auswahl statt freiem Color-Picker — passend zur "direkte
 *  Bearbeitung statt Formular"-Linie dieses Panels (Hierarchie ist z.B. ein
 *  Klick-Zyklus-Chip, kein Dropdown). Gold zuerst, weil es exakt der
 *  Standard-Farbe von Hauptthema-Nodes in GraphCanvas.tsx entspricht —
 *  Nutzer können sie so bewusst UND explizit wählen, nicht nur implizit
 *  über die Ebene bekommen. */
const NODE_COLOR_SWATCHES = ['#D9A94E', '#6366F1', '#38BDF8', '#10B981', '#F43F5E', '#F97316', '#64748B'];

/** Baut aus einer Kante + Blickrichtung (aktueller Node ist Quelle oder Ziel)
 *  eine für Menschen lesbare Zeile — Kernidee dieses Abschnitts: "Wie hängt
 *  dieses Konzept mit anderem Wissen zusammen?", nicht "welche Kanten
 *  existieren?" (s. Datei-Kommentar unten). Gibt `null` zurück, wenn der
 *  andere Node oder der Beziehungstyp nicht (mehr) geladen ist — kann durch
 *  den Lese-Zeit-Filter in graphIndex.ts eigentlich nicht vorkommen (dort
 *  werden Kanten zu archivierten/gelöschten Nodes bereits ausgeblendet),
 *  hier trotzdem defensiv statt eine Zeile mit "undefined" zu zeigen. */
function describeRelatedEntry(
  state: GraphState, edge: GraphEdge, isSource: boolean,
): { key: string; otherNodeId: string; otherTitle: string; text: string } | null {
  const otherNodeId = isSource ? edge.targetNodeId : edge.sourceNodeId;
  const otherNode = state.nodesById.get(otherNodeId);
  const relationType = state.relationTypesById.get(edge.relationTypeId);
  if (!otherNode || !relationType) return null;

  let text: string;
  if (relationType.symmetric) {
    // Symmetrisch: dieselbe Aussage in beide Richtungen, kein Pfeil-Konflikt.
    text = `↔ ${relationType.label} ${otherNode.title}`;
  } else if (isSource) {
    text = `→ ${relationType.label} ${otherNode.title}`;
  } else if (relationType.inverseLabel) {
    // "…" ist die Lückentext-Konvention der eingebauten Typen für Fälle, in
    // denen der Bezug grammatikalisch in die Mitte gehört (z.B. "baut auf …
    // auf" statt "baut auf" + Anhängsel) — s. builtInRelationTypes.ts.
    const filled = relationType.inverseLabel.includes('…')
      ? relationType.inverseLabel.replace('…', otherNode.title)
      : `${relationType.inverseLabel} ${otherNode.title}`;
    text = `→ ${filled}`;
  } else {
    // Kein inverseLabel vorhanden (z.B. spontan per Freitext angelegte
    // Beziehungstypen beim Kantenziehen haben nie eins) — bewusste, im
    // Konzeptdokument als MVP-Kompromiss vorgesehene Vereinfachung: derselbe
    // Text wie in Vorwärtsrichtung, nur der Pfeil zeigt die Gegenrichtung an,
    // statt eine möglicherweise falsche Grammatik zu erfinden.
    text = `← ${relationType.label} ${otherNode.title}`;
  }
  return { key: edge.id, otherNodeId, otherTitle: otherNode.title, text };
}

export const GraphNodeDetailPanel: React.FC<GraphNodeDetailPanelProps> = ({
  state, history, nodeId, documents, onChange, onEntityChanged, onClose, onOpenDocument, onSelectNode, onStartActivity,
}) => {
  const { t } = useTranslation();
  const node = state.nodesById.get(nodeId);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const pickerSelectRef = useRef<HTMLSelectElement | null>(null);

  // Eigene Entwürfe für Beschreibung/Notiz, NUR bei Node-Wechsel neu
  // initialisiert (nicht bei jeder state-Änderung) — sonst würde gerade
  // getippter Text durch eine unabhängige Änderung anderswo überschrieben.
  // Exakt dasselbe Muster, das vorher in GraphCanvas für die Notiz galt.
  const [descriptionDraft, setDescriptionDraft] = useState(node?.description ?? '');
  const [notesDraft, setNotesDraft] = useState(node?.notes ?? '');
  // Eigene Unterlagen: Picker-Zustand hier oben deklariert (Rules of Hooks —
  // vor dem frühen `if (!node) return null;` unten), auch wenn die Werte erst
  // im JSX-Body gebraucht werden.
  const [isPickingDocument, setIsPickingDocument] = useState(false);
  const [pickedDocumentId, setPickedDocumentId] = useState('');
  // Verwandte Konzepte: derselbe Index wie in GraphCanvas.tsx (dieselbe
  // buildGraphIndex-Funktion, dasselbe useMemo-Muster), damit das Auflösen
  // von aus-/eingehenden Kanten bei jedem Render nicht neu über ALLE Kanten
  // iterieren muss — relevant bei vielen Beziehungen im Fach.
  const relationIndex = useMemo(() => buildGraphIndex(state), [state]);

  useEffect(() => {
    setDescriptionDraft(node?.description ?? '');
    setNotesDraft(node?.notes ?? '');
    setIsPickingDocument(false);
    setPickedDocumentId('');
    // Fokus geht beim Öffnen/Wechseln auf den Schließen-Button — sicher,
    // stiehlt keinem Textfeld den Fokus (kein ungewolltes Tastatur-Popup),
    // aber Tab landet danach natürlich im Panel-Inhalt (kein Fokus-Trap,
    // das Wissensnetz bleibt währenddessen normal interaktiv).
    closeButtonRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  // Node kann verschwinden (z.B. archiviert), während das Panel offen ist —
  // dann sauber schließen statt eine Karteileiche anzuzeigen.
  useEffect(() => {
    if (!node) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);

  // Fokus ins Dropdown, sobald der Picker erscheint — ein Tastatur-Nutzer
  // muss nach Klick auf "+" nicht erst manuell dorthin tabben.
  useEffect(() => {
    if (isPickingDocument) pickerSelectRef.current?.focus();
  }, [isPickingDocument]);

  // Escape in einer Notiz/Beschreibung committet nur (Blur), schließt aber
  // nicht gleich das ganze Panel — erst ein zweites Escape (jetzt außerhalb
  // des Textfelds) schließt. Dieselbe Regel gilt für den Dokument-Picker:
  // Escape bricht nur das Picken ab (gefunden bei der echten Verifikation
  // von Phase 3 — vorher schloss Escape im offenen Dropdown versehentlich
  // das ganze Panel, nicht nur den Picker).
  //
  // Bewusst ein globaler window-Listener statt onKeyDown auf dem Panel-Div
  // (exakt dasselbe Muster wie GraphCanvas' Delete-Handler, s. dortiger
  // Kommentar): Wenn der Picker per Escape schließt, unmounted das <select>
  // und der Fokus fällt auf document.body — AUSSERHALB der DOM-Teilbaums
  // dieses Panels. Ein Escape-Tastendruck von dort würde nie durch das
  // Panel-Div bubbeln, ein component-scoped onKeyDown hätte das zweite
  // Escape (das dann das Panel schließen soll) also nie gesehen. Ein
  // INPUT wird bewusst übersprungen (nicht wie TEXTAREA geblurrt) — das ist
  // ein fremdes Feld (z.B. die Node-Titel-Bearbeitung auf dem Canvas per
  // Doppelklick), dessen eigener Escape-Handler sich darum kümmert; sonst
  // würde dieser globale Listener parallel das Panel schließen, obwohl der
  // Nutzer nur die Titel-Bearbeitung abbrechen wollte.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement) {
        active.blur();
        return;
      }
      if (active instanceof HTMLInputElement) return;
      if (isPickingDocument) {
        setIsPickingDocument(false);
        setPickedDocumentId('');
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPickingDocument, onClose]);

  if (!node) return null;

  const commitDescription = () => {
    if (node.description === descriptionDraft) return;
    const result = recordUpdateNode(history, state, nodeId, { description: descriptionDraft });
    if (!result.error && result.entity) {
      onChange({ state: result.state, history: result.history });
      onEntityChanged?.({ kind: 'node', entity: result.entity });
    }
  };

  const commitNotes = () => {
    if (node.notes === notesDraft) return;
    const result = recordUpdateNode(history, state, nodeId, { notes: notesDraft });
    if (!result.error && result.entity) {
      onChange({ state: result.state, history: result.history });
      onEntityChanged?.({ kind: 'node', entity: result.entity });
    }
  };

  const cycleHierarchy = () => {
    const result = recordUpdateNode(history, state, nodeId, { hierarchyLevel: nextHierarchyLevel(node.hierarchyLevel) });
    if (!result.error && result.entity) {
      onChange({ state: result.state, history: result.history });
      onEntityChanged?.({ kind: 'node', entity: result.entity });
    }
  };

  // undefined = "Auto" (kein Override) — GraphCanvas.tsx leitet die Farbe
  // dann aus der Hierarchie-Ebene ab (Hauptthema=Gold, sonst neutral), exakt
  // dieselbe "kein stiller Default, aber ein bewusster Rückfall"-Idee wie bei
  // hierarchyLevel/Beziehungstyp an anderer Stelle im Wissensnetz.
  const commitColor = (color: string | undefined) => {
    const result = recordUpdateNode(history, state, nodeId, { color });
    if (!result.error && result.entity) {
      onChange({ state: result.state, history: result.history });
      onEntityChanged?.({ kind: 'node', entity: result.entity });
    }
  };

  // ── Verwandte Konzepte (Phase 4) ────────────────────────────────────────
  // outgoingEdges/incomingEdges filtern bereits auf Kanten AKTIVER Nodes
  // (s. graphIndex.ts) — ein Beziehungspartner, der zwischenzeitlich
  // archiviert/gelöscht wurde, taucht hier automatisch nicht mehr auf, ohne
  // dass diese Datei etwas davon wissen muss. Sortierung alphabetisch nach
  // dem Titel des JEWEILS ANDEREN Nodes (dieselbe Konvention wie der
  // Dokument-Picker in Phase 3) — lesbar/scannbar auch bei vielen Kanten.
  const relatedEntries = [
    ...outgoingEdges(relationIndex, nodeId).map(edge => describeRelatedEntry(state, edge, true)),
    ...incomingEdges(relationIndex, nodeId).map(edge => describeRelatedEntry(state, edge, false)),
  ]
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.otherTitle.localeCompare(b.otherTitle));

  // ── Eigene Unterlagen (Phase 3) ────────────────────────────────────────
  // Bewusst NICHT über GraphHistoryService — NodeDocumentRef-Mutationen sind
  // seit Phase 2 dieselbe Kategorie wie Beziehungstypen: seltene,
  // "Einstellungs"-artige Aktionen ohne den typischen Tipp-Fehler-Charakter,
  // für den Undo/Redo gedacht ist (s. graphHistoryService.ts Datei-Kommentar).
  // Reihenfolge: nach Verknüpfungs-Zeitpunkt (stabil, ändert sich nicht bei
  // einer Dokument-Umbenennung).
  const linkedDocumentRefs = [...state.nodeDocumentsById.values()]
    .filter(ref => ref.nodeId === nodeId)
    .sort((a, b) => a.createdAt - b.createdAt);
  const linkedDocumentIds = new Set(linkedDocumentRefs.map(ref => ref.documentId));
  // Bereits verknüpfte Dokumente werden im Picker gar nicht erst angeboten —
  // die Domain-Validierung (validateNoDuplicateNodeDocumentRef) bleibt trotzdem
  // die eigentliche Absicherung, das hier ist nur eine freundlichere UI.
  const linkableDocuments = documents
    .filter(doc => !linkedDocumentIds.has(doc.id))
    .sort((a, b) => documentDisplayName(a).localeCompare(documentDisplayName(b)));

  const confirmLinkDocument = () => {
    if (!pickedDocumentId) return;
    const result = createNodeDocumentRef(state, { nodeId, documentId: pickedDocumentId });
    if (!result.error && result.entity) {
      onChange({ state: result.state, history });
      onEntityChanged?.({ kind: 'nodeDocumentRef', action: 'create', entity: result.entity });
    }
    setIsPickingDocument(false);
    setPickedDocumentId('');
  };

  return (
    <div
      className="absolute inset-y-0 right-0 w-full max-w-[340px] flex flex-col z-30 animate-in fade-in duration-200"
      style={{ background: 'var(--bg-sidebar)', borderLeft: '1px solid var(--border-color)' }}
    >
      {/* Kopfbereich — Titel/Typ/Hierarchie sind in unter einer Sekunde erfassbar,
          bevor überhaupt etwas anderes im Panel gelesen werden muss. */}
      <div className="flex items-start gap-2 p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-slate-900 dark:text-white truncate">{node.title}</h2>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span
              className="text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-full"
              style={{ background: 'var(--bg-main)', color: 'var(--text-muted, #64748b)' }}
            >
              {typeLabel(node.type)}
            </span>
            <button
              onClick={cycleHierarchy}
              className="text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-full transition-colors hover:opacity-80"
              style={{ background: 'var(--bg-main)', color: 'var(--text-muted, #64748b)' }}
            >
              {node.hierarchyLevel ? HIERARCHY_LEVEL_LABELS[node.hierarchyLevel] : t('kg.panel.hierarchyPlaceholder')}
            </button>
          </div>
          {/* Direkte Farbwahl statt Formular/Dropdown — dieselbe Linie wie
              der Hierarchie-Chip oben. "Auto" (Kreis mit Diagonale) setzt
              node.color zurück auf undefined, GraphCanvas.tsx leitet die
              Farbe dann wieder aus der Hierarchie-Ebene ab. */}
          <div className="flex items-center gap-1.5 mt-2" role="group" aria-label={t('kg.panel.colorLabel')}>
            <button
              onClick={() => commitColor(undefined)}
              title={t('kg.panel.colorAuto')}
              aria-label={t('kg.panel.colorAuto')}
              aria-pressed={!node.color}
              className="w-5 h-5 rounded-full shrink-0 relative overflow-hidden transition-transform hover:scale-110"
              style={{
                background: 'var(--bg-main)',
                border: `1.5px solid ${!node.color ? 'var(--primary)' : 'var(--border-color)'}`,
              }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: 'linear-gradient(45deg, transparent 46%, var(--text-muted, #94a3b8) 48%, var(--text-muted, #94a3b8) 52%, transparent 54%)' }}
              />
            </button>
            {NODE_COLOR_SWATCHES.map(swatch => (
              <button
                key={swatch}
                onClick={() => commitColor(swatch)}
                title={swatch}
                aria-label={swatch}
                aria-pressed={node.color === swatch}
                className="w-5 h-5 rounded-full shrink-0 transition-transform hover:scale-110"
                style={{
                  background: swatch,
                  boxShadow: node.color === swatch ? '0 0 0 2px var(--bg-sidebar), 0 0 0 3.5px var(--primary)' : 'none',
                }}
              />
            ))}
          </div>
        </div>
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label={t('kg.panel.close')}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Scrollbarer Körper — EIN Scroll-Container für das ganze Panel statt
          verschachtelter Scrollbars in einzelnen Feldern (ruhiger, weniger
          Overhead bei langen Notizen). */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <section>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
            {t('kg.panel.description')}
          </p>
          <textarea
            value={descriptionDraft}
            placeholder={t('kg.panel.descriptionPlaceholder')}
            onChange={e => setDescriptionDraft(e.target.value)}
            onBlur={commitDescription}
            rows={3}
            className="w-full text-[11px] leading-relaxed rounded-lg px-3 py-2 outline-none border resize-none bg-transparent text-slate-700 dark:text-white placeholder:text-slate-400"
            style={{ borderColor: 'var(--border-color)' }}
          />
        </section>

        <section>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
            📝 {t('kg.panel.notes')}
          </p>
          <textarea
            value={notesDraft}
            placeholder={t('kg.panel.notesPlaceholder')}
            onChange={e => setNotesDraft(e.target.value)}
            onBlur={commitNotes}
            rows={7}
            className="w-full text-[11px] leading-relaxed rounded-lg px-3 py-2 outline-none border resize-none bg-transparent text-slate-700 dark:text-white placeholder:text-slate-400"
            style={{ borderColor: 'var(--border-color)' }}
          />
        </section>

        <section>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              📚 {t('kg.panel.sources')}
            </p>
            <button
              onClick={() => setIsPickingDocument(true)}
              aria-label={t('kg.panel.sourcesAdd')}
              title={t('kg.panel.sourcesAdd')}
              className="w-5 h-5 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors text-xs font-black"
            >
              +
            </button>
          </div>

          {linkedDocumentRefs.length === 0 && !isPickingDocument && (
            <p className="text-[10px] text-slate-400 italic">{t('kg.panel.sourcesEmpty')}</p>
          )}

          {linkedDocumentRefs.length > 0 && (
            <ul className="space-y-1">
              {linkedDocumentRefs.map(ref => {
                const doc = documents.find(d => d.id === ref.documentId);
                const label = doc ? documentDisplayName(doc) : ref.documentId;
                return (
                  <li key={ref.id}>
                    <button
                      onClick={() => onOpenDocument(ref.documentId)}
                      title={label}
                      className="w-full text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors truncate block"
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {isPickingDocument && (
            <div className="mt-2 space-y-2">
              <select
                ref={pickerSelectRef}
                value={pickedDocumentId}
                onChange={e => setPickedDocumentId(e.target.value)}
                className="w-full text-[11px] font-bold rounded-lg px-3 py-2 outline-none border bg-transparent text-slate-700 dark:text-white"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <option value="">{t('kg.panel.sourcesPickPlaceholder')}</option>
                {linkableDocuments.map(doc => (
                  <option key={doc.id} value={doc.id}>{documentDisplayName(doc)}</option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <button
                  onClick={confirmLinkDocument}
                  disabled={!pickedDocumentId}
                  className="flex-1 text-[9px] font-black uppercase tracking-widest rounded-lg py-2 disabled:opacity-40 transition-colors"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text, #fff)' }}
                >
                  {t('kg.panel.sourcesConfirm')}
                </button>
                <button
                  onClick={() => { setIsPickingDocument(false); setPickedDocumentId(''); }}
                  className="px-3 text-[9px] font-black uppercase tracking-widest rounded-lg py-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t('kg.panel.sourcesCancel')}
                </button>
              </div>
            </div>
          )}
        </section>

        <section>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
            🔗 {t('kg.panel.related')}
          </p>

          {relatedEntries.length === 0 && (
            <p className="text-[10px] text-slate-400 italic">{t('kg.panel.relatedEmpty')}</p>
          )}

          {relatedEntries.length > 0 && (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {relatedEntries.map(entry => (
                <li key={entry.key}>
                  <button
                    onClick={() => onSelectNode(entry.otherNodeId)}
                    title={entry.text}
                    className="w-full text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors truncate block"
                  >
                    {entry.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
            {t('kg.panel.activity')}
          </p>
          <div className="flex gap-1.5">
            {([
              ['flashcards', '🃏', 'kg.panel.activityFlashcards'],
              ['quiz', '❓', 'kg.panel.activityQuiz'],
              ['feynman', '🧠', 'kg.panel.activityFeynman'],
              ['explain', '🤖', 'kg.panel.activityExplain'],
            ] as const).map(([kind, emoji, labelKey]) => (
              <button
                key={kind}
                onClick={() => onStartActivity(kind)}
                className="flex-1 flex flex-col items-center gap-1 rounded-lg py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="text-base leading-none">{emoji}</span>
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
