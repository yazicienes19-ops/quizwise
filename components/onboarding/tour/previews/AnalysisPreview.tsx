import React from 'react';

/** Gleiches Ampelschema wie GapRadar.tsx securityColor (sicher/unsicher/kritisch). */
const TOPICS: { name: string; color: string; pct: number }[] = [
  { name: 'Klassische Konditionierung', color: '#22c55e', pct: 88 },
  { name: 'Operante Konditionierung', color: '#f59e0b', pct: 54 },
  { name: 'Gedächtnismodelle', color: '#f43f5e', pct: 22 },
];

export const AnalysisPreview: React.FC = () => (
  <div className="space-y-2.5">
    {TOPICS.map(topic => (
      <div key={topic.name}>
        <div className="flex items-center justify-between text-[10px] font-bold mb-1" style={{ color: 'var(--text-main)' }}>
          <span>{topic.name}</span>
          <span style={{ color: topic.color }}>{topic.pct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
          <div className="h-full rounded-full" style={{ width: `${topic.pct}%`, background: topic.color }} />
        </div>
      </div>
    ))}
  </div>
);
