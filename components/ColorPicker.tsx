
import React, { useState } from 'react';
import { Palette, Check } from 'lucide-react';

const PRESETS = [
  { name: 'Claude Coral', value: '#D97757' },
  { name: 'Indigo',       value: '#6366F1' },
  { name: 'Blau',         value: '#3B82F6' },
  { name: 'Teal',         value: '#14B8A6' },
  { name: 'Grün',         value: '#22C55E' },
  { name: 'Rose',         value: '#F43F5E' },
  { name: 'Violet',       value: '#8B5CF6' },
  { name: 'Amber',        value: '#F59E0B' },
];

export function applyAccentColor(color: string) {
  document.documentElement.style.setProperty('--primary', color);
  localStorage.setItem('accent_color', color);
}

export const ColorPicker: React.FC = () => {
  const [current, setCurrent] = useState(() =>
    localStorage.getItem('accent_color') || '#D97757'
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
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 transition-all active:scale-95"
        style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))' }}
      >
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shadow-inner" style={{ background: current }} />
          Akzentfarbe
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
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Farbe wählen</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => select(p.value)}
                  title={p.name}
                  className="relative w-full aspect-square rounded-xl transition-all active:scale-90 hover:scale-110 flex items-center justify-center"
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
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Eigene Farbe</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
};
