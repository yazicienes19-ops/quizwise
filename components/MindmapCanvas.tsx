import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import { MindmapNode } from '../services/mindmapTree';
import { computeMindmapLayout, NODE_HEIGHT } from '../services/mindmapLayout';
import { useTranslation } from '../i18n/I18nProvider';

interface MindmapCanvasProps {
  tree: MindmapNode;
  onToggleCollapse: (nodeId: string) => void;
  onColorChange: (nodeId: string, color: string | undefined) => void;
}

interface ZoomTransform { x: number; y: number; k: number; }

const NODE_TRANSITION = { duration: 0.25, ease: 'easeOut' } as const;

/**
 * Reine Vorschau (nicht editierbar) — Editieren passiert im
 * MindmapOutlineEditor daneben.
 *
 * WICHTIG: Die Knoten selbst (Rechteck + Text) sind reines SVG, die
 * interaktiven Steuerelemente (Farbwähler, Reset-×, Ein-/Ausklapp-Pfeil)
 * liegen als normales HTML-Overlay ÜBER dem SVG, nicht mehr als
 * foreignObject INNERHALB der von d3-zoom transformierten <g>. Grund: Safari
 * hat bekannte Hit-Testing-Bugs bei HTML-Inhalten in foreignObject, wenn ein
 * Vorfahre ein SVG-transform-Attribut trägt (genau das, was Zoomen/Verschieben
 * hier laufend tut) — Klicks landen dann inkonsistent daneben. Ein früherer
 * Versuch, direkt im Canvas zu editieren, wurde deshalb schon verworfen; die
 * verbliebenen kleinen Buttons hatten dasselbe Problem. Das HTML-Overlay
 * (absolut positioniert, Position aus dem Zoom-Transform berechnet) umgeht
 * das Problem komplett, weil dort kein SVG-transform mehr im Spiel ist.
 *
 * Knoten sind motion.g-Gruppen (Position als x/y-Motion-Value statt fixer
 * Attribute) — dadurch gleiten bestehende Knoten bei Layout-Änderungen sanft
 * zur neuen Position, statt zu springen, und neue/eingeklappte Knoten faden
 * ein/aus statt abrupt zu erscheinen/verschwinden.
 */
export const MindmapCanvas: React.FC<MindmapCanvasProps> = ({ tree, onToggleCollapse, onColorChange }) => {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>({ x: 0, y: 0, k: 1 });

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
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
        setZoomTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k });
      });
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

  // Nur neu einpassen, wenn sich die Zahl der SICHTBAREN Knoten ändert (neue/
  // gelöschte Punkte, Ein-/Ausklappen) — nicht bei reinen Farbwechseln.
  useEffect(() => {
    if (!didInitialFit.current) return;
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positioned.length]);

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <button onClick={() => zoomBy(1.3)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-lg shadow-sm text-sm font-black hover:text-indigo-600 transition-colors">+</button>
        <button onClick={() => zoomBy(1 / 1.3)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-lg shadow-sm text-sm font-black hover:text-indigo-600 transition-colors">−</button>
        <button onClick={fitView} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-lg shadow-sm hover:text-indigo-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
      </div>
      <svg ref={svgRef} className="w-full h-full">
        <g ref={gRef}>
          <AnimatePresence initial={false}>
            {links.map(l => (
              <motion.path
                key={l.id}
                d={l.d}
                fill="none"
                stroke={l.color || 'var(--border-color, #cbd5e1)'}
                strokeWidth={2}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={NODE_TRANSITION}
              />
            ))}
            {positioned.map(p => {
              const isRoot = p.node.id === tree.id;
              const effectiveColor = colorMap.get(p.node.id);
              const fill = effectiveColor || (isRoot ? 'var(--primary)' : undefined);
              return (
                <motion.g
                  key={p.node.id}
                  initial={{ x: p.x, y: p.y, opacity: 0, scale: 0.6 }}
                  animate={{ x: p.x, y: p.y, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={NODE_TRANSITION}
                >
                  <rect
                    x={-p.width / 2} y={-NODE_HEIGHT / 2}
                    width={p.width} height={NODE_HEIGHT} rx={14}
                    fill={fill || 'var(--bg-sidebar, #fff)'}
                    stroke={fill ? 'none' : 'var(--border-color, #e2e8f0)'}
                  />
                  <text
                    x={0} y={4.5} textAnchor="middle"
                    className={`text-xs font-bold select-none ${fill ? 'fill-white' : 'fill-slate-700 dark:fill-white'}`}
                    style={{ pointerEvents: 'none' }}
                  >
                    {p.node.text || t('mm.untitledNode')}
                  </text>
                </motion.g>
              );
            })}
          </AnimatePresence>
        </g>
      </svg>
      {/* HTML-Overlay für die interaktiven Steuerelemente — Position wird aus
          dem Zoom-Transform berechnet, damit sie mit dem SVG mitwandern. */}
      <div className="absolute inset-0 pointer-events-none">
        <AnimatePresence initial={false}>
          {positioned.map(p => {
            const effectiveColor = colorMap.get(p.node.id);
            const ownColor = p.node.color;
            const canToggle = hasChildrenMap.get(p.node.id);
            const screenX = zoomTransform.x + zoomTransform.k * (p.x + p.width / 2);
            const screenY = zoomTransform.y + zoomTransform.k * p.y;
            return (
              <motion.div
                key={p.node.id}
                className="absolute flex items-center gap-1 pointer-events-none"
                style={{ transform: 'translate(6px, -50%)' }}
                initial={{ opacity: 0, left: screenX, top: screenY }}
                animate={{ opacity: 1, left: screenX, top: screenY }}
                exit={{ opacity: 0 }}
                transition={NODE_TRANSITION}
              >
                <input
                  type="color"
                  value={effectiveColor || '#94a3b8'}
                  onChange={e => onColorChange(p.node.id, e.target.value)}
                  title={t('mm.color')}
                  className="pointer-events-auto shrink-0 w-5 h-5 rounded border-0 cursor-pointer bg-transparent p-0"
                />
                {ownColor && (
                  <button
                    onClick={() => onColorChange(p.node.id, undefined)}
                    title={t('mm.colorReset')}
                    className="pointer-events-auto shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[8px]"
                  >×</button>
                )}
                {canToggle && (
                  <button
                    onClick={() => onToggleCollapse(p.node.id)}
                    title={p.node.collapsed ? t('mm.expand') : t('mm.collapse')}
                    className="pointer-events-auto shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[9px]"
                  >
                    {p.node.collapsed ? '▸' : '▾'}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
