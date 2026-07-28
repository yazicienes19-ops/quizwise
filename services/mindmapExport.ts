const PADDING = 24;

export const exportSvgAsPng = async (svgEl: SVGSVGElement, filename: string): Promise<void> => {
  const bbox = svgEl.getBBox();
  const width = Math.ceil(bbox.width + PADDING * 2);
  const height = Math.ceil(bbox.height + PADDING * 2);

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute(
    'viewBox',
    `${bbox.x - PADDING} ${bbox.y - PADDING} ${width} ${height}`
  );
  clone.style.background = '#ffffff';

  const svgString = new XMLSerializer().serializeToString(clone);
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
