import React, { useEffect, useRef, useState } from 'react';
import type { ProcessedDocument } from '../types';
import type { GraphState, GraphEntityChange } from '../services/graph/types';
import { HIERARCHY_LEVEL_LABELS, nextHierarchyLevel } from '../services/graph/types';
import { type GraphHistory, recordUpdateNode } from '../services/graph/graphHistoryService';
import { createNodeDocumentRef } from '../services/graph/graphMutationService';
import { documentDisplayName } from '../services/libraryService';
import { useTranslation } from '../i18n/I18nProvider';

/**
 * Rechte Seitenleiste des Wissensnetzes (s. KNOWLEDGE_GRAPH_KONZEPT.md
 * Abschnitt 2 für die vollständige, verbindliche 7-Abschnitt-Struktur).
 * Phase 2: Kopfbereich, Beschreibung, Eigene Notizen. Phase 3: Eigene
 * Unterlagen (Dokumente verknüpfen/anzeigen/öffnen). Architektonisch ein
 * Geschwister von GraphCanvas, keine Eltern-Kind-Beziehung: beide bekommen
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
}

const typeLabel = (type: string): string => type.length > 0 ? type.charAt(0).toUpperCase() + type.slice(1) : type;

export const GraphNodeDetailPanel: React.FC<GraphNodeDetailPanelProps> = ({
  state, history, nodeId, documents, onChange, onEntityChanged, onClose, onOpenDocument,
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
      </div>
    </div>
  );
};
