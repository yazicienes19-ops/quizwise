import React from 'react';

export const ExamPreview: React.FC = () => (
  <div className="rounded-[16px] p-4" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
    <p className="text-xs font-bold mb-3" style={{ color: 'var(--text-main)' }}>
      Erläutere den Unterschied zwischen klassischer und operanter Konditionierung.
    </p>
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
        style={{ background: 'color-mix(in srgb, #22c55e 18%, var(--bg-main))', color: '#16a34a' }}
      >
        8 / 10 Punkte
      </span>
      <span className="text-[10px] font-black" style={{ color: 'var(--primary)' }}>Note 2,0</span>
    </div>
  </div>
);
