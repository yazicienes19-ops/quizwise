import React from 'react';

/**
 * Wiederverwendbare Tap-Card für Single-/Multi-Select-Screens. Farblogik
 * verallgemeinert aus dem Sprachwähler des bisherigen components/Onboarding.tsx
 * (CSS-var-getrieben, kein hartkodiertes indigo wie in ExamGenerator.tsx).
 */
interface SelectCardProps {
  selected: boolean;
  onClick: () => void;
  icon?: string;
  label: string;
  /** Erklärsatz darunter — nur im 'list'-Layout gerendert (Lernprobleme-Screen). */
  description?: string;
  /** Priorität bei Mehrfachauswahl, z. B. 1 oder 2 — zeigt eine kleine Zahl-Badge. */
  priority?: number;
  layout?: 'grid' | 'list';
}

export const SelectCard: React.FC<SelectCardProps> = ({
  selected, onClick, icon, label, description, priority, layout = 'grid',
}) => {
  // Getönter statt vollflächiger Auswahlzustand — User-Feedback "Selected State
  // zu dominant, wirkt wie ein Formularfeld". Auswahl bleibt über Rand+Tönung
  // eindeutig erkennbar, Text bleibt immer var(--text-main) statt auf einem
  // satten Farbblock zu stehen.
  const selectedStyle = selected
    ? { background: 'color-mix(in srgb, var(--primary) 14%, var(--bg-main))', color: 'var(--text-main)', border: '2px solid var(--primary)' }
    : { background: 'var(--bg-main)', color: 'var(--text-main)', border: '2px solid var(--border-color)' };
  const badgeStyle = { background: 'var(--primary)', color: 'var(--primary-text)' };

  if (layout === 'list') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-start gap-3 py-4 px-4 rounded-[16px] text-left transition-all hover:scale-[1.01] active:scale-[0.98]"
        style={selectedStyle}
      >
        {icon && <span className="text-xl leading-none shrink-0 mt-0.5">{icon}</span>}
        <span className="grow min-w-0">
          <span className="block text-sm font-black tracking-tight">{label}</span>
          {description && (
            <span className="block text-xs font-medium leading-relaxed mt-1 opacity-70">
              {description}
            </span>
          )}
        </span>
        {priority !== undefined && (
          <span
            className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black animate-in zoom-in-50 duration-200"
            style={badgeStyle}
          >
            {priority}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative py-4 px-3 rounded-[16px] text-sm font-black tracking-tight transition-all hover:scale-[1.02] active:scale-[0.97] flex flex-col items-center gap-1.5 text-center"
      style={selectedStyle}
    >
      {priority !== undefined && (
        <span
          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black animate-in zoom-in-50 duration-200"
          style={badgeStyle}
        >
          {priority}
        </span>
      )}
      {icon && <span className="text-xl leading-none">{icon}</span>}
      <span>{label}</span>
    </button>
  );
};
