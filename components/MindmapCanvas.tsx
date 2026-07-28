import React, { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { MindmapNode } from '../services/mindmapTree';
import { computeMindmapLayout, NODE_HEIGHT } from '../services/mindmapLayout';
import { useTranslation } from '../i18n/I18nProvider';

interface MindmapCanvasProps {
  tree: MindmapNode;
  onToggleCollapse: (nodeId: string) => void;
  onColorChange: (nodeId: string, color: string | undefined) => void;
}

/**
 * Reine Vorschau (nicht editierbar) — Editieren passiert im
 * MindmapOutlineEditor daneben. Ein direkter Klick-Editor auf dieser Karte
 * wurde live getestet und hat sich als zu fragil erwiesen (SVG/foreignObject
 * + Zoom/Pan + Drag kollidieren browserseitig), deshalb bewusst nur noch
 * Layout/Rendering/Zoom/Pan/Einklappen hier.
 */
export const MindmapCanvas: React.FC<MindmapCanvasProps> = ({ tree, onToggleCollapse, onColorChange }) => {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const { positioned, links, colorMap, hasChildrenMap } = useMemo(
    () => computeMindmapLayout(tree, t('mm.untitledNode')),
    [tree, t],
  );

  const fitView = () => {
    if (!svgRef.current || !zoomBehaviorRef.current || positioned.length === 0) return;
    const xs = positioned.flatMap(p => [p.x - p.width / 2, p.x + p.width / 2]);
    const ys = positioned.flatMap(p => [p.y - NODE_HEIGHT / 2, p.y + NODE_HEIGHT / 2]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const contentWidth = maxX - minX || 1;
    const contentHeight = maxY - minY || 1;
    const svgW = svgRef.current.clientWidth || 800;
    const svgH = svgRef.current.clientHeight || 500;
    const scale = Math.min(1.2, 0.9 * Math.min(svgW / contentWidth, svgH / contentHeight));
    const tx = svgW / 2 - scale * (minX + contentWidth / 2);
    const ty = svgH / 2 - scale * (minY + contentHeight / 2);
    d3.select(svgRef.current).transition().duration(300)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  };

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svgSel = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2.5])
      .filter((event: Event) => !(event.target as Element).closest('[data-interactive]'))
      .on('zoom', (event) => g.attr('transform', event.transform.toString()));
    svgSel.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;
    return () => { svgSel.on('.zoom', null); };
  }, []);

  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current || positioned.length === 0 || !zoomBehaviorRef.current) return;
    didInitialFit.current = true;
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positioned]);

  // Bei jeder Baumänderung sanft neu einpassen, damit neue/gelöschte Punkte
  // aus dem Gliederungs-Editor sichtbar bleiben, ohne die Zoomstufe komplett
  // zurückzusetzen wenn der Nutzer gerade selbst gezoomt/verschoben hat.
  useEffect(() => {
    if (!didInitialFit.current) return;
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <button onClick={() => zoomBy(1.3)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-lg shadow-sm text-sm font-black hover:text-indigo-600 transition-colors">+</button>
        <button onClick={() => zoomBy(1 / 1.3)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-lg shadow-sm text-sm font-black hover:text-indigo-600 transition-colors">−</button>
        <button onClick={fitView} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-lg shadow-sm hover:text-indigo-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
      </div>
      <svg ref={svgRef} className="w-full h-full">
        <g ref={gRef}>
          {links.map(l => (
            <path key={l.id} d={l.d} fill="none" stroke={l.color || 'var(--border-color, #cbd5e1)'} strokeWidth={2} />
          ))}
          {positioned.map(p => {
            const isRoot = p.node.id === tree.id;
            const effectiveColor = colorMap.get(p.node.id);
            const ownColor = p.node.color;
            const canToggle = hasChildrenMap.get(p.node.id);
            const extraWidth = 24 + (ownColor ? 18 : 0) + (canToggle ? 18 : 0);
            return (
              <g key={p.node.id} transform={`translate(${p.x - p.width / 2}, ${p.y - NODE_HEIGHT / 2})`}>
                <foreignObject width={p.width + extraWidth} height={NODE_HEIGHT} style={{ overflow: 'visible' }}>
                  <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-center h-full" style={{ width: p.width + extraWidth }}>
                    <div
                      className={`flex items-center h-full px-3 rounded-2xl text-xs font-bold truncate select-none ${
                        effectiveColor ? 'text-white' : isRoot ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-white shadow-sm'
                      }`}
                      style={{ width: p.width, height: NODE_HEIGHT, ...(effectiveColor ? { background: effectiveColor } : {}) }}
                    >
                      {p.node.text || t('mm.untitledNode')}
                    </div>
                    <input
                      data-interactive="true"
                      type="color"
                      value={effectiveColor || '#94a3b8'}
                      onChange={e => onColorChange(p.node.id, e.target.value)}
                      title={t('mm.color')}
                      className="shrink-0 ml-1 w-5 h-5 rounded border-0 cursor-pointer bg-transparent p-0"
                    />
                    {ownColor && (
                      <button
                        data-interactive="true"
                        onClick={() => onColorChange(p.node.id, undefined)}
                        title={t('mm.colorReset')}
                        className="shrink-0 ml-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[8px]"
                      >×</button>
                    )}
                    {canToggle && (
                      <button
                        data-interactive="true"
                        onClick={() => onToggleCollapse(p.node.id)}
                        title={p.node.collapsed ? t('mm.expand') : t('mm.collapse')}
                        className="shrink-0 ml-1 w-4 h-4 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[9px]"
                      >
                        {p.node.collapsed ? '▸' : '▾'}
                      </button>
                    )}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
