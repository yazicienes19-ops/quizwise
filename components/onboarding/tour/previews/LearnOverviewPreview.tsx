import React from 'react';

const METHODS = [
  { icon: '📝', label: 'Quiz', hint: 'Wissen testen' },
  { icon: '🔁', label: 'Karteikarten', hint: 'Wissen behalten' },
  { icon: '🧠', label: 'Feynman', hint: 'Verständnis prüfen' },
  { icon: '💬', label: 'Tutor', hint: 'Inhalte verstehen' },
];

/** Bewusst nur eine kurze Einordnung, keine ausführliche Erklärung pro Methode
 *  (Spec: "Nicht jede Funktion einzeln ausführlich erklären") — Feynman und
 *  Tutor bekommen direkt danach eigene, tiefere Tour-Schritte. */
export const LearnOverviewPreview: React.FC = () => (
  <div className="grid grid-cols-2 gap-2">
    {METHODS.map(m => (
      <div key={m.label} className="rounded-[12px] p-3 text-center" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
        <span className="text-lg leading-none block mb-1">{m.icon}</span>
        <span className="text-[10px] font-black block" style={{ color: 'var(--text-main)' }}>{m.label}</span>
        <span className="text-[9px] opacity-60 block" style={{ color: 'var(--text-main)' }}>{m.hint}</span>
      </div>
    ))}
  </div>
);
