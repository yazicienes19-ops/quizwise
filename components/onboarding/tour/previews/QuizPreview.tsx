import React from 'react';
import { Check } from 'lucide-react';

const OPTIONS = [
  { text: 'Ein neutraler Reiz wird mit einem unkonditionierten Reiz gekoppelt.', correct: true },
  { text: 'Verhalten wird durch Belohnung verstärkt.', correct: false },
  { text: 'Wissen wird durch reine Wiederholung gefestigt.', correct: false },
];

export const QuizPreview: React.FC = () => (
  <div className="rounded-[16px] p-4" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
    <p className="text-xs font-bold mb-3" style={{ color: 'var(--text-main)' }}>
      Was passiert bei der klassischen Konditionierung?
    </p>
    <div className="space-y-1.5">
      {OPTIONS.map((opt, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-[11px] font-medium"
          style={opt.correct
            ? { background: 'color-mix(in srgb, #22c55e 16%, var(--bg-main))', border: '1px solid #22c55e', color: 'var(--text-main)' }
            : { background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
        >
          {opt.correct
            ? <Check className="w-3.5 h-3.5 shrink-0" style={{ color: '#22c55e' }} strokeWidth={2.5} />
            : <span className="w-3.5 h-3.5 shrink-0" />}
          <span>{opt.text}</span>
        </div>
      ))}
    </div>
  </div>
);
