import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Maximize2 } from 'lucide-react';
import type { CitationRef } from '../services/citations';
import type { Diagram, DiagramNode, TreeNode, FigureDiagram, CurveSeries } from '../services/studioDiagrams';
import { parseInline } from './markdownRenderer';
import { getCardImageUrl } from '../services/cardImages';
import { useTranslation } from '../i18n/I18nProvider';

interface Props {
  diagram: Diagram;
  /** Fußnoten-Kästchen wie im Text (SubjectStudio.renderCitation). */
  renderCite: (refs: CitationRef[], key: string) => React.ReactNode;
  /** Abbildung aus dem Ergebnis entfernen (falsch ausgeschnitten oder unpassend). */
  onRemove?: () => void;
}

const box = 'rounded-2xl px-4 py-3 text-center';
const boxStyle: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border-color)', boxShadow: '0 2px 8px rgba(22,41,77,.06)' };
const rootStyle: React.CSSProperties = { background: 'var(--primary-soft)', border: '1px solid color-mix(in srgb, var(--primary) 45%, transparent)' };

/** Silbentrennung statt harter Umbrüche mitten im Wort (schmale Zellen auf dem Handy); greift über lang am Element. */
const hyphenate: React.CSSProperties = { hyphens: 'auto', WebkitHyphens: 'auto', overflowWrap: 'break-word' };

const NodeBody: React.FC<{ node: DiagramNode; id: string; renderCite: Props['renderCite']; strong?: boolean; small?: boolean }> = ({ node, id, renderCite, strong, small }) => (
  <>
    <p className={`${strong ? 'text-[15px]' : small ? 'text-[12.5px] sm:text-[14px]' : 'text-[14px]'} font-semibold leading-snug`} style={{ color: 'var(--text-main)', ...hyphenate }}>
      {parseInline(node.label, `${id}-l`)}
      {node.cite && <> {renderCite(node.cite, `${id}-c`)}</>}
    </p>
    {node.detail && <p className="text-[12.5px] leading-snug mt-1" style={{ color: 'var(--text-secondary)', ...hyphenate }}>{parseInline(node.detail, `${id}-d`)}</p>}
  </>
);

const Arrow: React.FC = () => (
  <div className="flex flex-col items-center py-1" aria-hidden="true">
    <span className="w-px h-4" style={{ background: 'var(--primary)' }} />
    <svg width="12" height="8" viewBox="0 0 12 8"><path d="M1 1l5 6 5-6" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </div>
);

/** Ablauf von oben nach unten. */
const Flow: React.FC<{ d: Extract<Diagram, { type: 'flow' }>; renderCite: Props['renderCite'] }> = ({ d, renderCite }) => (
  <ol className="flex flex-col items-stretch max-w-md mx-auto" aria-label={d.title}>
    {d.steps.map((s, i) => (
      <li key={i} className="flex flex-col items-stretch">
        {i > 0 && <Arrow />}
        <div className={`${box} relative`} style={i === 0 ? rootStyle : boxStyle}>
          <span className="absolute left-3 top-3 text-[11px] font-semibold" style={{ color: 'var(--primary-ink)' }}>{i + 1}</span>
          <NodeBody node={s} id={`f${i}`} renderCite={renderCite} />
        </div>
      </li>
    ))}
  </ol>
);

const TREE_COLS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' };

/** Oberbegriff oben, Unterarten darunter; dritte Ebene als Liste im Kasten. */
const Tree: React.FC<{ d: Extract<Diagram, { type: 'tree' }>; renderCite: Props['renderCite'] }> = ({ d, renderCite }) => {
  const children = d.root.children ?? [];
  return (
    <div className="flex flex-col items-center" aria-label={d.title}>
      <div className={`${box} max-w-sm w-full`} style={rootStyle}>
        <NodeBody node={d.root} id="r" renderCite={renderCite} strong />
      </div>
      <span className="w-px h-4" style={{ background: 'var(--primary)' }} aria-hidden="true" />
      {/* Auf dem Handy stehen die Unterarten untereinander, ab sm nebeneinander */}
      <ul className={`grid gap-3 w-full grid-cols-1 ${TREE_COLS[Math.min(children.length, 3)]}`}>
        {children.map((c: TreeNode, i) => (
          <li key={i} className={`${box} text-left sm:text-center`} style={boxStyle}>
            <NodeBody node={c} id={`t${i}`} renderCite={renderCite} />
            {c.children && (
              <ul className="mt-2 space-y-1 text-left">
                {c.children.map((g, j) => (
                  <li key={j} className="flex gap-2 text-[13px] leading-snug" style={{ color: 'var(--text-main)' }}>
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
                    <span className="break-words">
                      {parseInline(g.label, `t${i}-${j}`)}
                      {g.detail && <span style={{ color: 'var(--text-secondary)' }}>: {parseInline(g.detail, `t${i}-${j}-d`)}</span>}
                      {g.cite && <> {renderCite(g.cite, `t${i}-${j}-c`)}</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Zwei bis drei Konzepte nebeneinander. */
const Compare: React.FC<{ d: Extract<Diagram, { type: 'compare' }>; renderCite: Props['renderCite'] }> = ({ d, renderCite }) => (
  <div className={`grid gap-3 grid-cols-1 ${d.columns.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`} aria-label={d.title}>
    {d.columns.map((c, i) => (
      <div key={i} className="rounded-2xl overflow-hidden" style={boxStyle}>
        <div className="px-4 py-3 text-center" style={rootStyle}>
          <NodeBody node={c} id={`c${i}`} renderCite={renderCite} />
        </div>
        <ul className="px-4 py-3 space-y-1.5">
          {c.points.map((p, j) => (
            <li key={j} className="flex gap-2 text-[13.5px] leading-snug" style={{ color: 'var(--text-main)' }}>
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
              <span className="break-words">{parseInline(p, `c${i}-${j}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

// ── VS-Gegenüberstellung ───────────────────────────────────────────────────

const VS_RIGHT = '#0ea5e9';

const Versus: React.FC<{ d: Extract<Diagram, { type: 'versus' }>; renderCite: Props['renderCite'] }> = ({ d, renderCite }) => {
  const head = (n: DiagramNode, color: string, id: string) => (
    <div className="rounded-2xl px-3 py-3 sm:px-4 text-center" style={{ background: `color-mix(in srgb, ${color} 14%, var(--card))`, border: `2px solid ${color}` }}>
      <NodeBody node={n} id={id} renderCite={renderCite} strong />
    </div>
  );
  return (
    <div className="space-y-3" aria-label={d.title}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        {head(d.left, 'var(--primary)', 'vl')}
        <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-[14px] sm:text-[15px] font-black tracking-tight shadow-md"
          style={{ background: 'var(--text-main)', color: 'var(--bg-main)' }} aria-hidden="true">VS</span>
        {head(d.right, VS_RIGHT, 'vr')}
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-color)', background: 'var(--card)' }}>
        {d.rows.map((r, i) => (
          <div key={i} style={i ? { borderTop: '1px solid var(--border-color)' } : undefined}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-center pt-2.5" style={{ color: 'var(--text-secondary)' }}>{r.aspect}</p>
            <div className="grid grid-cols-2">
              <p className="px-3 sm:px-4 pb-3 pt-1 text-[13.5px] leading-snug text-center" style={{ color: 'var(--text-main)', ...hyphenate, boxShadow: 'inset -1px 0 0 var(--border-color)' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: 'var(--primary)' }} />{parseInline(r.left, `vrl${i}`)}
              </p>
              <p className="px-3 sm:px-4 pb-3 pt-1 text-[13.5px] leading-snug text-center" style={{ color: 'var(--text-main)', ...hyphenate }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: VS_RIGHT }} />{parseInline(r.right, `vrr${i}`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Kurve ──────────────────────────────────────────────────────────────────

const CURVE_COLORS = ['var(--primary)', '#0ea5e9', '#e11d48'];

/** Glatte Linie durch die Punkte (Catmull-Rom als kubische Bézierkurven). */
export const smoothPath = (pts: [number, number][]): string => {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
};

const Curve: React.FC<{ d: Extract<Diagram, { type: 'curve' }>; renderCite: Props['renderCite'] }> = ({ d, renderCite }) => {
  const { t } = useTranslation();
  const W = 420, H = 260, L = 44, R = 16, T = 14, B = 40;
  const all = d.series.flatMap(s => s.points);
  const xMin = Math.min(0, ...all.map(p => p[0])), xMax = Math.max(10, ...all.map(p => p[0]));
  const yMin = Math.min(0, ...all.map(p => p[1])), yMax = Math.max(10, ...all.map(p => p[1]));
  const sx = (x: number) => L + ((x - xMin) / (xMax - xMin || 1)) * (W - L - R);
  const sy = (y: number) => H - B - ((y - yMin) / (yMax - yMin || 1)) * (H - T - B);
  const toPts = (s: CurveSeries) => s.points.map(([x, y]) => [sx(x), sy(y)] as [number, number]);
  return (
    <div className="max-w-xl mx-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={d.title ?? `${d.yLabel} / ${d.xLabel}`}>
        <defs>
          <marker id="ax-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--text-secondary)" />
          </marker>
        </defs>
        <line x1={L} y1={H - B} x2={W - R + 6} y2={H - B} stroke="var(--text-secondary)" strokeWidth="1.5" markerEnd="url(#ax-arrow)" />
        <line x1={L} y1={H - B} x2={L} y2={T - 6} stroke="var(--text-secondary)" strokeWidth="1.5" markerEnd="url(#ax-arrow)" />
        <text x={(L + W - R) / 2} y={H - 10} textAnchor="middle" fontSize="16" fill="var(--text-main)" fontWeight="600">{d.xLabel}</text>
        <text x={16} y={(T + H - B) / 2} textAnchor="middle" fontSize="16" fill="var(--text-main)" fontWeight="600" transform={`rotate(-90 16 ${(T + H - B) / 2})`}>{d.yLabel}</text>
        {d.series.map((s, i) => (
          <path key={i} d={smoothPath(toPts(s))} fill="none" stroke={CURVE_COLORS[i % 3]} strokeWidth="3" strokeLinecap="round" strokeDasharray={i === 2 ? '6 5' : undefined} />
        ))}
      </svg>
      {(d.series.some(s => s.label) || d.cite) && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1">
          {d.series.map((s, i) => s.label && (
            <span key={i} className="flex items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--text-main)' }}>
              <span className="w-4 h-[3px] rounded-full" style={{ background: CURVE_COLORS[i % 3] }} />{s.label}
            </span>
          ))}
          {d.cite && renderCite(d.cite, 'curve-c')}
        </div>
      )}
      <p className="text-[12px] text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
        {t('stu.dg.schematic')}{d.note ? ` ${d.note}` : ''}
      </p>
    </div>
  );
};

// ── Vierfeldertafel ────────────────────────────────────────────────────────

const Matrix: React.FC<{ d: Extract<Diagram, { type: 'matrix' }>; renderCite: Props['renderCite'] }> = ({ d, renderCite }) => (
  <div className="overflow-x-auto">
    {d.colLabel && <p className="text-[12px] font-semibold text-center mb-1.5 pl-16 sm:pl-24" style={{ color: 'var(--text-secondary)' }}>{d.colLabel}</p>}
    <div className="grid gap-1.5 sm:gap-2 min-w-[300px]" style={{ gridTemplateColumns: `minmax(4rem, auto) repeat(${d.cols.length}, minmax(0, 1fr))` }}>
      <div className="flex items-end justify-start text-[12px] font-semibold pb-1" style={{ color: 'var(--text-secondary)' }}>{d.rowLabel}</div>
      {d.cols.map((c, j) => (
        <div key={j} className="rounded-xl px-2 py-2 text-center text-[13px] font-semibold" style={rootStyle}>{parseInline(c, `mc${j}`)}</div>
      ))}
      {d.rows.map((r, i) => (
        <React.Fragment key={i}>
          <div className="rounded-xl px-1.5 py-2 flex items-center justify-center text-center text-[12.5px] sm:text-[13px] font-semibold" style={{ ...rootStyle, ...hyphenate }}>{parseInline(r, `mr${i}`)}</div>
          {d.cells[i].map((cell, j) => (
            <div key={j} className="rounded-2xl px-2 py-2.5 sm:px-4 sm:py-3 text-center" style={boxStyle}><NodeBody node={cell} id={`m${i}-${j}`} renderCite={renderCite} small /></div>
          ))}
        </React.Fragment>
      ))}
    </div>
  </div>
);

// ── Kreislauf ──────────────────────────────────────────────────────────────

const Cycle: React.FC<{ d: Extract<Diagram, { type: 'cycle' }>; renderCite: Props['renderCite'] }> = ({ d, renderCite }) => {
  const { t } = useTranslation();
  const n = d.steps.length;
  const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  return (
    <>
      {/* Ab sm im Kreis */}
      <div className="hidden sm:block relative mx-auto aspect-square w-full max-w-[520px]" aria-label={d.title}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <circle cx="50" cy="50" r="34" fill="none" stroke="var(--primary)" strokeWidth="0.6" strokeDasharray="1.6 1.4" />
          {/* Pfeilspitze auf halbem Weg zwischen zwei Schritten, im Uhrzeigersinn */}
          {d.steps.map((_, i) => {
            const a = angle(i) + Math.PI / n;
            const x = 50 + 34 * Math.cos(a), y = 50 + 34 * Math.sin(a);
            return <path key={i} d="M -2 -1.6 L 2 0 L -2 1.6 z" fill="var(--primary)" transform={`translate(${x} ${y}) rotate(${(a * 180) / Math.PI + 90})`} />;
          })}
        </svg>
        {d.steps.map((s, i) => {
          const x = 50 + 34 * Math.cos(angle(i)), y = 50 + 34 * Math.sin(angle(i));
          return (
            <div key={i} className={`${box} absolute w-[36%] -translate-x-1/2 -translate-y-1/2`} style={{ left: `${x}%`, top: `${y}%`, ...(i === 0 ? rootStyle : boxStyle) }}>
              <NodeBody node={s} id={`y${i}`} renderCite={renderCite} />
            </div>
          );
        })}
      </div>
      {/* Handy: untereinander mit Rückpfeil */}
      <ol className="sm:hidden flex flex-col items-stretch" aria-label={d.title}>
        {d.steps.map((s, i) => (
          <li key={i} className="flex flex-col items-stretch">
            {i > 0 && <Arrow />}
            <div className={box} style={i === 0 ? rootStyle : boxStyle}><NodeBody node={s} id={`ym${i}`} renderCite={renderCite} /></div>
          </li>
        ))}
        <li className="text-center text-[12.5px] font-semibold pt-2" style={{ color: 'var(--primary-ink)' }}>↺ {t('stu.dg.backTo', { step: d.steps[0].label })}</li>
      </ol>
    </>
  );
};

// ── Abbildung aus dem Skript ───────────────────────────────────────────────

const Figure: React.FC<{ d: FigureDiagram; renderCite: Props['renderCite']; onRemove?: () => void }> = ({ d, renderCite, onRemove }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!d.image) { setFailed(true); return; }
    getCardImageUrl(d.image).then(u => { if (alive) { setUrl(u); setFailed(!u); } }).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [d.image]);
  return (
    <div className="space-y-2">
      <div className="relative group rounded-2xl overflow-hidden bg-white" style={{ border: '1px solid var(--border-color)' }}>
        {url ? (
          <button type="button" onClick={() => setZoom(true)} className="block w-full" aria-label={t('stu.dg.zoom')}>
            <img src={url} alt={d.title ?? ''} className="mx-auto max-h-[460px] w-auto object-contain" loading="lazy" />
          </button>
        ) : (
          <div className="h-40 flex items-center justify-center text-[13px]" style={{ color: '#64748b' }}>
            {failed ? t('stu.dg.imageMissing') : t('stu.dg.imageLoading')}
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {url && (
            <button type="button" onClick={() => setZoom(true)} className="p-1.5 rounded-lg bg-white/90 shadow text-slate-600" aria-label={t('stu.dg.zoom')}><Maximize2 className="w-3.5 h-3.5" /></button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} className="p-1.5 rounded-lg bg-white/90 shadow text-rose-600" aria-label={t('stu.dg.removeFigure')} title={t('stu.dg.removeFigure')}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </div>
      <p className="text-[13px] leading-snug text-center" style={{ color: 'var(--text-secondary)' }}>
        {d.title && <span className="font-semibold" style={{ color: 'var(--text-main)' }}>{d.title}. </span>}
        {d.caption}
        {d.cite && <> {renderCite(d.cite, 'fig-c')}</>}
      </p>
      {zoom && url && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-4" onClick={() => setZoom(false)} role="dialog" aria-label={d.title}>
          <button type="button" onClick={() => setZoom(false)} className="absolute top-4 right-4 p-2 rounded-full bg-white/15 text-white" aria-label={t('common.close')}><X className="w-5 h-5" /></button>
          <img src={url} alt={d.title ?? ''} className="max-w-full max-h-full object-contain bg-white rounded-xl" onClick={e => e.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  );
};

/** Grafik im Lernstudio (services/studioDiagrams.ts). */
export const StudioDiagram: React.FC<Props> = ({ diagram, renderCite, onRemove }) => {
  const { locale } = useTranslation();
  return (
  <figure lang={locale} className="my-2 rounded-[20px] p-3 sm:p-5" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
    {diagram.title && diagram.type !== 'figure' && (
      <figcaption className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-3 text-center" style={{ color: 'var(--primary-ink)' }}>
        {diagram.title}
      </figcaption>
    )}
    {diagram.type === 'flow' && <Flow d={diagram} renderCite={renderCite} />}
    {diagram.type === 'tree' && <Tree d={diagram} renderCite={renderCite} />}
    {diagram.type === 'compare' && <Compare d={diagram} renderCite={renderCite} />}
    {diagram.type === 'versus' && <Versus d={diagram} renderCite={renderCite} />}
    {diagram.type === 'curve' && <Curve d={diagram} renderCite={renderCite} />}
    {diagram.type === 'matrix' && <Matrix d={diagram} renderCite={renderCite} />}
    {diagram.type === 'cycle' && <Cycle d={diagram} renderCite={renderCite} />}
    {diagram.type === 'figure' && <Figure d={diagram} renderCite={renderCite} onRemove={onRemove} />}
  </figure>
  );
};
