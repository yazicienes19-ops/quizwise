import React from 'react';

export const PlannerPreview: React.FC = () => (
  <div className="space-y-2">
    <div className="flex items-center justify-between px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
      <span className="text-[11px] font-bold" style={{ color: 'var(--text-main)' }}>Klausur Entwicklungspsychologie</span>
      <span className="text-[10px] font-black shrink-0 ml-2" style={{ color: 'var(--primary)' }}>noch 12 Tage</span>
    </div>
    <div className="flex items-center justify-between px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
      <span className="text-[11px] font-bold" style={{ color: 'var(--text-main)' }}>Feynman-Session</span>
      <span className="text-[10px] font-black shrink-0 ml-2 opacity-60" style={{ color: 'var(--text-main)' }}>täglich, 18:00</span>
    </div>
  </div>
);
