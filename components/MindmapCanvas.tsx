import React, { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { MindmapNode, pruneCollapsed } from '../services/mindmapTree';
import { useTranslation } from '../i18n/I18nProvider';

const NODE_HEIGHT = 40;
const SIBLING_SPACING = 56;
const DEPTH_SPACING = 200;

const estimateWidth = (text: string): number => Math.min(260, Math.max(80, text.length * 7.5 + 32));

interface PositionedNode {
  node: MindmapNode;
  x: number;
  y: number;
  width: number;
  parentId: string | null;
}

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
export const MindmapCanvas = React.forwardRef<SVGSVGElement, MindmapCanvasProps>(({ tree, onToggleCollapse, onColorChange }, forwardedSvgRef) => {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const setSvgRef = (el: SVGSVGElement | null) => {
    svgRef.current = el;
    if (typeof forwardedSvgRef === 'function') forwardedSvgRef(el);
    else if (forwardedSvgRef) (forwardedSvgRef as React.MutableRefObject<SVGSVGElement | null>).current = el;
  };

  // Eingeklappte Äste beeinflussen nur diese Vorschau, nie die eigentlichen
  // Daten (siehe pruneCollapsed) — hasChildrenMap kommt bewusst aus dem
  // UNGEKÜRZTEN Baum, damit ein eingeklappter Knoten trotzdem noch sein
  // Auf-/Zuklapp-Symbol zeigt.
  const visibleTree = useMemo(() => pruneCollapsed(tree), [tree]);
  const hasChildrenMap = useMemo(() => {
    const map = new Map<string, boolean>();
    const walk = (n: MindmapNode) => { map.set(n.id, n.children.length > 0); n.children.forEach(walk); };
    walk(tree);
    return map;
  }, [tree]);

  // Jeder Knoten ist frei einzeln färbbar (MindmapOutlineEditor); eine
  // gesetzte Farbe vererbt sich hier standardmäßig an alle Unterpunkte, bis
  // ein Nachfahre selbst eine eigene Farbe bekommt — die überschreibt dann
  // lokal für sich und ihre eigenen Unterpunkte weiter.
  const colorMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    const walk = (n: MindmapNode, inherited: string | undefined) => {
      const effective = n.color ?? inherited;
      map.set(n.id, effective);
      n.children.forEach(c => walk(c, effective));
    };
    walk(visibleTree, undefined);
    return map;
  }, [visibleTree]);

  const positioned = useMemo((): PositionedNode[] => {
    const hierarchyRoot = d3.hierarchy(visibleTree, d => d.children);
    d3.tree<MindmapNode>().nodeSize([SIBLING_SPACING, DEPTH_SPACING])(hierarchyRoot);
    const result: PositionedNode[] = [];
    hierarchyRoot.each(d => {
      result.push({
        node: d.data,
        x: d.y,
        y: d.x,
        width: estimateWidth(d.data.text || t('mm.untitledNode')),
        parentId: d.parent ? d.parent.data.id : null,
      });
    });
    return result;
  }, [visibleTree, t]);

  const byId = useMemo(() => new Map(positioned.map(p => [p.node.id, p])), [positioned]);

  const links = useMemo(() => {
    const linkGen = d3.linkHorizontal<unknown, { x: number; y: number }>().x(d => d.x).y(d => d.y);
    return positioned
      .filter(p => p.parentId)
      .map(p => {
        const parent = byId.get(p.parentId!);
        if (!parent) return null;
        const d = linkGen({
          source: { x: parent.x + parent.width / 2, y: parent.y },
          target: { x: p.x - p.width / 2, y: p.y },
        } as never);
        return d ? { id: p.node.id, d, color: colorMap.get(p.node.id) } : null;
      })
      .filter((l): l is { id: string; d: string; color?: string } => l !== null);
  }, [positioned, byId, colorMap]);

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
      <svg ref={setSvgRef} className="w-full h-full">
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
});

MindmapCanvas.displayName = 'MindmapCanvas';
