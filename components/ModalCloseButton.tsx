import React from 'react';
import { X } from 'lucide-react';

interface ModalCloseButtonProps {
  onClick: () => void;
  label: string;
  className?: string;
}

/** Gemeinsamer Schließen-Button für alle Modals — ersetzt 7 handgeschriebene
 *  Inline-SVGs und 2 unterschiedliche lucide-Größen (w-4/w-5), die dieselbe
 *  Rolle mit leicht unterschiedlicher Größe/Strichstärke abbildeten. */
export const ModalCloseButton: React.FC<ModalCloseButtonProps> = ({ onClick, label, className }) => (
  <button
    aria-label={label}
    onClick={onClick}
    className={className ?? 'p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl shrink-0'}
  >
    <X className="w-[18px] h-[18px]" strokeWidth={2} />
  </button>
);
