import React from 'react';

/** Bewusst im Futur formuliert (Onboarding-Plan, User-Vorgabe) — der echte Coach
 *  braucht ≥5 Sessions Historie (LearningCoach.tsx MIN_SESSIONS_FOR_COACH), ein
 *  frischer Account hat die nie. Nie so tun, als wäre das eine echte Analyse. */
export const CoachPreview: React.FC = () => (
  <div className="rounded-[16px] p-4 flex items-start gap-3" style={{ background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-main))', border: '1px solid var(--primary)' }}>
    <span className="text-lg shrink-0">🎯</span>
    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-main)' }}>
      "Du hast bereits gute Fortschritte bei klassischer Konditionierung gemacht. Als Nächstes solltest du dein Wissen zu operanter Konditionierung mit Transferfragen testen."
    </p>
  </div>
);
