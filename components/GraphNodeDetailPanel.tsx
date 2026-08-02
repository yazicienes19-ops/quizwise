import React, { useEffect, useRef, useState } from 'react';
import type { GraphState, GraphEntityChange } from '../services/graph/types';
import { HIERARCHY_LEVEL_LABELS, nextHierarchyLevel } from '../services/graph/types';
import { type GraphHistory, recordUpdateNode } from '../services/graph/graphHistoryService';
import { useTranslation } from '../i18n/I18nProvider';

/**
 * Phase 2 der Umsetzungsphase — Grundgerüst der rechten Seitenleiste (s.
 * KNOWLEDGE_GRAPH_KONZEPT.md Abschnitt 2 für die vollständige, verbindliche
 * 7-Abschnitt-Struktur; hier nur die ersten drei: Kopfbereich, Beschreibung,
 * Eigene Notizen). Architektonisch ein Geschwister von GraphCanvas, keine
 * Eltern-Kind-Beziehung: beide bekommen dieselben state/history/onChange/
 * onEntityChanged-Props vom Aufrufer (GraphSystem/GraphDevHarness) und rufen
 * unabhängig voneinander Domain-Funktionen über GraphHistoryService auf —
 * exakt dasselbe Muster wie GraphCanvas selbst, keine neue Architekturschicht.
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
 */

export interface GraphNodeDetailPanelProps {
  state: GraphState;
  history: GraphHistory;
  nodeId: string;
  onChange: (next: { state: GraphState; history: GraphHistory }) => void;
  onEntityChanged?: (change: GraphEntityChange) => void;
  onClose: () => void;
}

const typeLabel = (type: string): string => type.length > 0 ? type.charAt(0).toUpperCase() + type.slice(1) : type;

export const GraphNodeDetailPanel: React.FC<GraphNodeDetailPanelProps> = ({
  state, history, nodeId, onChange, onEntityChanged, onClose,
}) => {
  const { t } = useTranslation();
  const node = state.nodesById.get(nodeId);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Eigene Entwürfe für Beschreibung/Notiz, NUR bei Node-Wechsel neu
  // initialisiert (nicht bei jeder state-Änderung) — sonst würde gerade
  // getippter Text durch eine unabhängige Änderung anderswo überschrieben.
  // Exakt dasselbe Muster, das vorher in GraphCanvas für die Notiz galt.
  const [descriptionDraft, setDescriptionDraft] = useState(node?.description ?? '');
  const [notesDraft, setNotesDraft] = useState(node?.notes ?? '');

  useEffect(() => {
    setDescriptionDraft(node?.description ?? '');
    setNotesDraft(node?.notes ?? '');
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

  // Escape in einem Textfeld committet nur (Blur), schließt aber nicht gleich
  // das ganze Panel — erst ein zweites Escape (jetzt außerhalb des Textfelds)
  // schließt. Kein Fokus-Trap, deshalb kein Konflikt mit Canvas-Tastenkürzeln.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (document.activeElement instanceof HTMLTextAreaElement) {
      document.activeElement.blur();
      return;
    }
    onClose();
  };

  return (
    <div
      className="absolute inset-y-0 right-0 w-full max-w-[340px] flex flex-col z-30 animate-in fade-in duration-200"
      style={{ background: 'var(--bg-sidebar)', borderLeft: '1px solid var(--border-color)' }}
      onKeyDown={handleKeyDown}
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
      </div>
    </div>
  );
};
