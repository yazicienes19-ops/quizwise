import React from 'react';

export const CardsPreview: React.FC = () => (
  <div className="rounded-[16px] p-5 text-center" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
    <p className="text-[9px] font-black uppercase tracking-widest mb-2 opacity-50" style={{ color: 'var(--text-main)' }}>
      Karteikarte
    </p>
    <p className="text-sm font-bold mb-3" style={{ color: 'var(--text-main)' }}>
      Was ist das Mehrspeichermodell?
    </p>
    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
      Tippen zum Umdrehen
    </p>
  </div>
);
