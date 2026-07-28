import { MindmapNode } from './mindmapTree';
import { computeMindmapLayout, NODE_HEIGHT } from './mindmapLayout';

const PADDING = 24;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Exportiert die Mindmap als PNG — baut dafür ein eigenes, rein statisches SVG
 * aus den Baumdaten (Rechtecke + Text), UNABHÄNGIG von der interaktiven
 * Vorschau (MindmapCanvas.tsx). Grund: die interaktive Vorschau nutzt
 * foreignObject mit echten HTML-Formularelementen (Farbwähler, Ein-/Ausklapp-
 * Buttons) und Tailwind-Klassen — wird dieses SVG geklont und als <img>
 * geladen (wie zuvor), gehen die externen CSS-Klassen verloren, während die
 * nativen Formular-Widgets mit ihrem Browser-Standardlook sichtbar bleiben.
 * Ein eigenes, reines SVG umgeht dieses Problem komplett.
 */
export const exportMindmapAsPng = async (
  tree: MindmapNode,
  filename: string,
  untitledLabel: string,
): Promise<void> => {
  const { positioned, links, colorMap } = computeMindmapLayout(tree, untitledLabel);
  if (positioned.length === 0) throw new Error('Keine Knoten zum Exportieren');

  const xs = positioned.flatMap(p => [p.x - p.width / 2, p.x + p.width / 2]);
  const ys = positioned.flatMap(p => [p.y - NODE_HEIGHT / 2, p.y + NODE_HEIGHT / 2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.ceil(maxX - minX) + PADDING * 2;
  const height = Math.ceil(maxY - minY) + PADDING * 2;
  const offsetX = -minX + PADDING;
  const offsetY = -minY + PADDING;

  // Respektiert die vom Nutzer gewählte Akzentfarbe (Design-Regel: niemals
  // hartkodiertes Indigo) — Fallback nur falls die CSS-Variable fehlt.
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#4f46e5';

  const linkPaths = links
    .map(l => `<path d="${l.d}" fill="none" stroke="${l.color || '#cbd5e1'}" stroke-width="2"/>`)
    .join('');

  const nodeShapes = positioned.map(p => {
    const isRoot = p.node.id === tree.id;
    const color = colorMap.get(p.node.id);
    const fill = color || (isRoot ? primary : '#ffffff');
    const textColor = (color || isRoot) ? '#ffffff' : '#334155';
    const stroke = (color || isRoot) ? 'none' : '#e2e8f0';
    const label = escapeXml(p.node.text || untitledLabel);
    return `<rect x="${p.x - p.width / 2}" y="${p.y - NODE_HEIGHT / 2}" width="${p.width}" height="${NODE_HEIGHT}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1"/>` +
      `<text x="${p.x}" y="${p.y + 4.5}" text-anchor="middle" font-size="13" font-weight="700" fill="${textColor}" font-family="Helvetica, Arial, sans-serif">${label}</text>`;
  }).join('');

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    `<g transform="translate(${offsetX}, ${offsetY})">${linkPaths}${nodeShapes}</g>` +
    `</svg>`;

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('SVG konnte nicht geladen werden'));
    image.src = svgDataUrl;
  });

  const scale = 2; // schärferer Export als 1:1 Bildschirmauflösung
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const pngDataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = pngDataUrl;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
