import { parseCitationToken, type CitationRef } from './citations';

/**
 * Grafiken im Lernstudio (Zusammenfassung, Lernleitfaden). Das Modell schreibt
 * sie als Codeblock ```diagram { JSON } ``` in den Text; gezeichnet wird in
 * components/StudioDiagram.tsx. Hier: herauslösen, streng prüfen (kaputte
 * oder leere Grafiken fallen weg, nie ein halber Kasten), Fußnoten der
 * Kästen bereinigen, für Kopieren/Download in Text umwandeln.
 *
 * Typen:
 * - flow:    Ablauf von oben nach unten (Prozess, Phasen, Ursache und Folge)
 * - tree:    Oberbegriff mit Unterarten, höchstens drei Ebenen
 * - versus:  zwei Konzepte gegenübergestellt, Merkmal für Merkmal (Angst vs. Furcht)
 * - compare: zwei bis drei Konzepte nebeneinander mit ihren Merkmalen
 * - curve:   schematischer Verlauf (Yerkes-Dodson, Vergessenskurve), keine Messdaten
 * - matrix:  Vierfeldertafel bzw. bis 3 × 3 (Attribution nach Weiner)
 * - cycle:   Kreislauf, der zum Anfang zurückführt (Teufelskreis der Angst)
 * - figure:  Abbildung aus dem Skript (services/studioFigures.ts); erst mit
 *            "ref" aus dem Verzeichnis, nach dem Ausschneiden mit "image"
 */

export interface DiagramNode { label: string; detail?: string; cite?: CitationRef[] }
export interface TreeNode extends DiagramNode { children?: TreeNode[] }

export interface CurveSeries { label?: string; points: [number, number][] }

export interface FigureDiagram {
  type: 'figure';
  title?: string;
  /** Verweis ins Abbildungsverzeichnis (A1, A2 …), solange noch nicht ausgeschnitten. */
  ref?: string;
  /** Pfad im Bild-Speicher (card-images), sobald ausgeschnitten. */
  image?: string;
  docId?: string;
  page?: number;
  caption?: string;
  cite?: CitationRef[];
}

export type Diagram =
  | { type: 'flow'; title?: string; steps: DiagramNode[] }
  | { type: 'tree'; title?: string; root: TreeNode }
  | { type: 'compare'; title?: string; columns: (DiagramNode & { points: string[] })[] }
  | { type: 'versus'; title?: string; left: DiagramNode; right: DiagramNode; rows: { aspect: string; left: string; right: string }[] }
  | { type: 'curve'; title?: string; xLabel: string; yLabel: string; series: CurveSeries[]; note?: string; cite?: CitationRef[] }
  | { type: 'matrix'; title?: string; rowLabel?: string; colLabel?: string; rows: string[]; cols: string[]; cells: DiagramNode[][] }
  | { type: 'cycle'; title?: string; steps: DiagramNode[] }
  | FigureDiagram;

export type DiagramSegment = { type: 'md'; text: string } | { type: 'diagram'; diagram: Diagram };

const LABEL_MAX = 80;
const DETAIL_MAX = 160;
const POINT_MAX = 140;

/** Vollständiger Codeblock; unvollständige (beim Schreiben) zählen nicht. */
const BLOCK_RE = /```diagram\s*\n([\s\S]*?)\n?```/g;

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t) : undefined;
};

/** "1:261" oder "1" oder ["1:3", "2"] → Fußnoten; Prüfung der Quelle über validate. */
const parseCite = (v: unknown, validate: CiteValidator): CitationRef[] | undefined => {
  const raw = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  const refs = raw
    .map(x => String(x).replace(/[[\]\s]/g, ''))
    .filter(x => /^\d+(:\d+)?$/.test(x))
    .flatMap(x => parseCitationToken(`[${x}]`))
    .map(validate)
    .filter((r): r is CitationRef => !!r);
  return refs.length ? refs : undefined;
};

export type CiteValidator = (ref: CitationRef) => CitationRef | null;
const acceptAll: CiteValidator = ref => ref;

const node = (v: unknown, validate: CiteValidator): DiagramNode | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const label = str(o.label, LABEL_MAX);
  if (!label) return null;
  const detail = str(o.detail, DETAIL_MAX);
  const cite = parseCite(o.cite, validate);
  return { label, ...(detail ? { detail } : {}), ...(cite ? { cite } : {}) };
};

const treeNode = (v: unknown, validate: CiteValidator, depth: number): TreeNode | null => {
  const base = node(v, validate);
  if (!base) return null;
  const rawChildren = (v as { children?: unknown }).children;
  if (depth >= 2 || !Array.isArray(rawChildren)) return base;
  const children = rawChildren.slice(0, 6).map(c => treeNode(c, validate, depth + 1)).filter((c): c is TreeNode => !!c);
  return children.length ? { ...base, children } : base;
};

/** JSON eines Blocks in eine gültige Grafik verwandeln, sonst null. */
export const parseDiagram = (json: string, validate: CiteValidator = acceptAll): Diagram | null => {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = str(o.title, LABEL_MAX);
  const withTitle = <T extends Diagram>(d: T): T => (title ? { ...d, title } : d);

  if (o.type === 'versus' && Array.isArray(o.rows)) {
    const left = node(o.left, validate);
    const right = node(o.right, validate);
    const rows = o.rows.slice(0, 8).flatMap(r => {
      const row = r as Record<string, unknown>;
      const aspect = str(row.aspect, LABEL_MAX);
      const l = str(row.left, POINT_MAX);
      const rt = str(row.right, POINT_MAX);
      return aspect && l && rt ? [{ aspect, left: l, right: rt }] : [];
    });
    return left && right && rows.length >= 2 ? withTitle({ type: 'versus', left, right, rows }) : null;
  }
  if (o.type === 'cycle' && Array.isArray(o.steps)) {
    const steps = o.steps.slice(0, 6).map(s => node(s, validate)).filter((s): s is DiagramNode => !!s);
    return steps.length >= 3 ? withTitle({ type: 'cycle', steps }) : null;
  }
  if (o.type === 'curve' && Array.isArray(o.series)) {
    const series = o.series.slice(0, 3).flatMap((sr): CurveSeries[] => {
      const pts = Array.isArray((sr as { points?: unknown }).points) ? (sr as { points: unknown[] }).points : [];
      const points = pts
        .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && Number.isFinite(v)))
        .slice(0, 16)
        .sort((a, b) => a[0] - b[0]);
      const label = str((sr as { label?: unknown }).label, LABEL_MAX);
      return points.length >= 3 ? [{ ...(label ? { label } : {}), points }] : [];
    });
    const xLabel = str(o.xLabel, LABEL_MAX);
    const yLabel = str(o.yLabel, LABEL_MAX);
    if (!series.length || !xLabel || !yLabel) return null;
    const note = str(o.note, DETAIL_MAX);
    const cite = parseCite(o.cite, validate);
    return withTitle({ type: 'curve', xLabel, yLabel, series, ...(note ? { note } : {}), ...(cite ? { cite } : {}) });
  }
  if (o.type === 'matrix' && Array.isArray(o.rows) && Array.isArray(o.cols) && Array.isArray(o.cells)) {
    const rows = o.rows.map(r => str(r, LABEL_MAX)).filter((r): r is string => !!r).slice(0, 3);
    const cols = o.cols.map(c => str(c, LABEL_MAX)).filter((c): c is string => !!c).slice(0, 3);
    if (rows.length < 2 || cols.length < 2 || rows.length !== o.rows.length || cols.length !== o.cols.length) return null;
    const cells = rows.map((_, r) => cols.map((__, c) => node((o.cells as unknown[][])[r]?.[c], validate)));
    if (cells.some(row => row.some(cell => !cell))) return null;
    const rowLabel = str(o.rowLabel, LABEL_MAX);
    const colLabel = str(o.colLabel, LABEL_MAX);
    return withTitle({ type: 'matrix', rows, cols, cells: cells as DiagramNode[][], ...(rowLabel ? { rowLabel } : {}), ...(colLabel ? { colLabel } : {}) });
  }
  if (o.type === 'figure') {
    const ref = typeof o.ref === 'string' && /^A\d+$/.test(o.ref.trim()) ? o.ref.trim() : undefined;
    const image = typeof o.image === 'string' && o.image.trim() ? o.image.trim() : undefined;
    if (!ref && !image) return null;
    const caption = str(o.caption, DETAIL_MAX);
    const page = typeof o.page === 'number' && o.page >= 1 ? Math.round(o.page) : undefined;
    const docId = typeof o.docId === 'string' ? o.docId : undefined;
    const cite = parseCite(o.cite, validate);
    return withTitle({
      type: 'figure', ...(ref ? { ref } : {}), ...(image ? { image } : {}), ...(docId ? { docId } : {}),
      ...(page ? { page } : {}), ...(caption ? { caption } : {}), ...(cite ? { cite } : {}),
    });
  }
  if (o.type === 'flow' && Array.isArray(o.steps)) {
    const steps = o.steps.slice(0, 10).map(s => node(s, validate)).filter((s): s is DiagramNode => !!s);
    return steps.length >= 2 ? withTitle({ type: 'flow', steps }) : null;
  }
  if (o.type === 'tree') {
    const root = treeNode(o.root, validate, 0);
    return root?.children && root.children.length >= 2 ? withTitle({ type: 'tree', root }) : null;
  }
  if (o.type === 'compare' && Array.isArray(o.columns)) {
    const columns = o.columns.slice(0, 3).flatMap(c => {
      const base = node(c, validate);
      const points = Array.isArray((c as { points?: unknown }).points)
        ? ((c as { points: unknown[] }).points).map(p => str(p, POINT_MAX)).filter((p): p is string => !!p).slice(0, 8)
        : [];
      return base && points.length ? [{ ...base, points }] : [];
    });
    return columns.length >= 2 ? withTitle({ type: 'compare', columns }) : null;
  }
  return null;
};

/** Text in Markdown-Abschnitte und Grafiken zerlegen; ungültige Grafiken verschwinden. */
export const splitDiagrams = (markdown: string, validate: CiteValidator = acceptAll): DiagramSegment[] => {
  const segments: DiagramSegment[] = [];
  let last = 0;
  for (const m of markdown.matchAll(BLOCK_RE)) {
    const before = markdown.slice(last, m.index).trim();
    if (before) segments.push({ type: 'md', text: before });
    const diagram = parseDiagram(m[1], validate);
    if (diagram) segments.push({ type: 'diagram', diagram });
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = markdown.slice(last).trim();
  if (rest) segments.push({ type: 'md', text: rest });
  return segments;
};

// ── Zurück in Text ───────────────────────────────────────────────────────────

const citeText = (cite?: CitationRef[]) =>
  cite?.length ? `[${cite.map(r => (r.page ? `${r.n}:${r.page}` : String(r.n))).join(', ')}]` : '';

/** Bereinigte Grafik wieder als Codeblock (zum Speichern); Fußnoten als "n" bzw. "n:p". */
export const diagramToBlock = (d: Diagram): string => {
  const json = JSON.stringify(d, (key, value: unknown) =>
    key === 'cite' && Array.isArray(value)
      ? (value as CitationRef[]).map(r => (r.page ? `${r.n}:${r.page}` : String(r.n)))
      : value);
  return '```diagram\n' + json + '\n```';
};

/** Lesbare Textfassung für Kopieren und Download. */
export const diagramToText = (d: Diagram): string => {
  const head = d.title ? `**${d.title}**\n\n` : '';
  const line = (n: DiagramNode) => `${n.label}${n.detail ? `: ${n.detail}` : ''}${n.cite ? ` ${citeText(n.cite)}` : ''}`;
  if (d.type === 'flow') return head + d.steps.map(line).join('\n  ↓\n');
  if (d.type === 'versus') {
    return `${head}${line(d.left)} vs. ${line(d.right)}\n${d.rows.map(r => `- ${r.aspect}: ${r.left} | ${r.right}`).join('\n')}`;
  }
  if (d.type === 'cycle') return head + d.steps.map(line).join('\n  ↓\n') + `\n  ↺ ${d.steps[0].label}`;
  if (d.type === 'curve') {
    const series = d.series.map(s => `- ${s.label ? `${s.label}: ` : ''}${s.points.map(([x, y]) => `(${x}|${y})`).join(' → ')}`).join('\n');
    return `${head}${d.yLabel} über ${d.xLabel}${d.cite ? ` ${citeText(d.cite)}` : ''}\n${series}${d.note ? `\n${d.note}` : ''}`;
  }
  if (d.type === 'matrix') {
    return head + d.rows.map((r, i) => d.cols.map((c, j) => `- ${r} / ${c}: ${line(d.cells[i][j])}`).join('\n')).join('\n');
  }
  if (d.type === 'figure') {
    return `[Abbildung${d.title ? `: ${d.title}` : ''}${d.caption ? `. ${d.caption}` : ''}${d.cite ? ` ${citeText(d.cite)}` : ''}]`;
  }
  if (d.type === 'tree') {
    const walk = (n: TreeNode, depth: number): string[] =>
      [`${'  '.repeat(depth)}- ${line(n)}`, ...(n.children ?? []).flatMap(c => walk(c, depth + 1))];
    return head + walk(d.root, 0).join('\n');
  }
  return head + d.columns.map(c => `- ${line(c)}\n${c.points.map(p => `  - ${p}`).join('\n')}`).join('\n');
};

/** Während des Schreibens: fertige und angefangene Grafikblöcke ausblenden. */
export const hideDiagramsWhileStreaming = (text: string): string =>
  text.replace(BLOCK_RE, '\n').replace(/```diagram[\s\S]*$/, '');
