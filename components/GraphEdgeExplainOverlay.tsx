import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GraphState } from '../services/graph/types';
import { buildEdgeExplanationSource } from '../services/graph/graphEdgeExplanationSource';
import { explainRelationship } from '../services/geminiService';
import { resolveErrorMessage } from '../services/errorMessages';
import { renderMarkdown } from './markdownRenderer';

/**
 * Wissensnetz-Coach, Baustein 2 ("Beziehungen erklären", s. Memory
 * project_quizwise_wissensnetz_coach.md Punkt 5). Bewusst KEIN Dialog wie
 * GraphLearningOverlays "Erklären"-Aktivität für Nodes — einmalige Erklärung
 * auf Klick einer Kante, deshalb ein kleineres, zentriertes Karten-Modal statt
 * der Vollbild-Hülle. Die KI erhält ausschließlich Graph-internen Text (s.
 * buildEdgeExplanationSource) und schreibt nie etwas zurück in den Graphen —
 * rein anzeigend, nichts wird gespeichert.
 */
export interface GraphEdgeExplainOverlayProps {
  state: GraphState;
  edgeId: string;
  onClose: () => void;
  onApiError: (e: unknown) => void;
}

export const GraphEdgeExplainOverlay: React.FC<GraphEdgeExplainOverlayProps> = ({ state, edgeId, onClose, onApiError }) => {
  const [subtitle, setSubtitle] = useState('');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { closeButtonRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const edge = state.edgesById.get(edgeId);
    const ctx = edge ? buildEdgeExplanationSource(state, edge) : null;
    if (!ctx) { onClose(); return; }
    setSubtitle(`${ctx.nodeATitle} → ${ctx.nodeBTitle}`);
    (async () => {
      try {
        const result = await explainRelationship(ctx.source, ctx.nodeATitle, ctx.nodeBTitle);
        setExplanation(result);
      } catch (e) {
        onApiError(e);
        setError(resolveErrorMessage(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{ background: 'rgba(15, 23, 42, 0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[20px] p-6 space-y-4 border"
        style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Beziehung erklären</p>
            {subtitle && <p className="text-xs font-bold text-slate-600 dark:text-slate-300 break-words mt-1">{subtitle}</p>}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            ×
          </button>
        </div>

        {error && <p className="text-sm font-bold text-rose-500">{error}</p>}

        {!error && !explanation && (
          <div className="flex items-center justify-center py-8">
            <div className="relative w-10 h-10">
              <div className="w-10 h-10 border-4 rounded-full" style={{ borderColor: 'var(--border-color)' }} />
              <div
                className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin absolute top-0 left-0"
                style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}
              />
            </div>
          </div>
        )}

        {explanation && <div className="text-sm dark:text-white">{renderMarkdown(explanation)}</div>}
      </div>
    </div>,
    document.body,
  );
};
