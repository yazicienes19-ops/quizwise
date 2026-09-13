
import React, { useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { setFunctionalPref } from '../services/cookieConsent';

const PRESETS = [
  { name: 'StudeArc Gold', value: '#D9A94E' },
  { name: 'Navy',          value: '#1B2A4A' },
  { name: 'Indigo',        value: '#6366F1' },
  { name: 'Blau',          value: '#3B82F6' },
  { name: 'Teal',          value: '#14B8A6' },
  { name: 'Grün',          value: '#22C55E' },
  { name: 'Rose',          value: '#F43F5E' },
  { name: 'Violet',        value: '#8B5CF6' },
];

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360; s /= 100; l /= 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Die Sidebar ist IMMER dunkles Navy (Layout.tsx SIDEBAR.bg), unabhängig von
 *  der gewählten Akzentfarbe. Eine zu dunkle Akzentfarbe (z.B. der "Navy"-
 *  Preset selbst) wäre darauf unlesbar — sowohl als Text/Icon-Farbe auf dem
 *  Navy-Hintergrund als auch als Pill-Hintergrund (dessen Text wiederum
 *  SIDEBAR.bg ist, also ebenfalls Navy). Deshalb Helligkeit auf einen für
 *  Navy sicheren Bereich anheben, Farbton bleibt erhalten — bereits helle
 *  Farben (der Gold-Standard) bleiben unverändert. */
export function getSidebarSafeAccent(color: string): string {
  if (!color.startsWith('#') || color.length !== 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const [h, s, l] = rgbToHsl(r, g, b);
  const safeL = Math.max(l, 58);
  const safeS = Math.max(s, 25);
  if (safeL === l && safeS === s) return color;
  return hslToHex(h, safeS, safeL);
}

export function applyAccentColor(color: string) {
  document.documentElement.style.setProperty('--primary', color);
  document.documentElement.style.setProperty('--sidebar-accent', getSidebarSafeAccent(color));
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    document.documentElement.style.setProperty('--primary-text', lum > 0.52 ? '#1a1a2e' : '#ffffff');
  }
  setFunctionalPref('accent_color', color);
}

export const ColorPicker: React.FC = () => {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(() =>
    localStorage.getItem('accent_color') || '#D9A94E'
  );
  const [open, setOpen] = useState(false);

  const select = (color: string) => {
    setCurrent(color);
    applyAccentColor(color);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 transition-all"
        style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))' }}
      >
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shadow-inner" style={{ background: current }} />
          {t('settings.accentColor')}
        </span>
        <Palette className="w-4 h-4" strokeWidth={1.75} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full mb-2 left-0 right-0 rounded-2xl p-4 shadow-3d-deep z-50"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
          >
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">{t('cp.chooseColor')}</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => select(p.value)}
                  title={p.name}
                  className="relative w-full aspect-square rounded-xl transition-all hover:scale-110 flex items-center justify-center"
                  style={{ background: p.value }}
                >
                  {current === p.value && (
                    <Check className="w-4 h-4 text-white drop-shadow" strokeWidth={3} />
                  )}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="color"
                value={current}
                onChange={e => select(e.target.value)}
                className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent p-0"
              />
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('settings.customColor')}</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
};
