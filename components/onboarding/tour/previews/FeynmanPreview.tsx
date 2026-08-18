import React from 'react';

export const FeynmanPreview: React.FC = () => (
  <div className="space-y-2">
    <div className="rounded-[14px] p-3 text-[11px] italic" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
      "Bei der klassischen Konditionierung lernt man, zwei Reize miteinander zu verbinden…"
    </div>
    <div className="rounded-[14px] p-3 text-[11px] leading-relaxed flex items-start gap-2" style={{ background: 'color-mix(in srgb, var(--primary) 12%, var(--bg-main))', border: '1px solid var(--primary)', color: 'var(--text-main)' }}>
      <span className="shrink-0">💡</span>
      <span>Guter Ansatz, was genau meinst du mit "zwei Reize"? Nenn ein konkretes Beispiel.</span>
    </div>
  </div>
);
