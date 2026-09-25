import React, { useEffect, useState } from 'react';
import { getCardImageUrl } from '../services/cardImages';
import { maskStates, type OcclusionData } from '../services/occlusion';

interface Props {
  occlusion: OcclusionData;
  revealed: boolean;
  alt: string;
  className?: string;
}

/**
 * Bild mit verdeckten Stellen (services/occlusion.ts). Die gefragte Stelle ist
 * gelb abgedeckt, beim Aufdecken nur noch umrandet; andere Stellen bleiben je
 * nach Modus grau verdeckt oder sichtbar.
 */
export const OcclusionImage: React.FC<Props> = ({ occlusion, revealed, alt, className }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCardImageUrl(occlusion.image).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [occlusion.image]);

  if (!url) return <div className={`${className ?? ''} aspect-video max-w-full rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse`} />;
  return (
    <div className={`relative inline-block max-w-full ${className ?? ''}`}>
      <img src={url} alt={alt} className="block max-w-full max-h-[55vh] rounded-xl" />
      {maskStates(occlusion, revealed).map(({ mask, state }, i) => state === 'none' ? null : (
        <div
          key={i}
          aria-hidden="true"
          className="absolute rounded-[4px] flex items-center justify-center transition-colors duration-200"
          style={{
            left: `${mask.x * 100}%`, top: `${mask.y * 100}%`, width: `${mask.w * 100}%`, height: `${mask.h * 100}%`,
            ...(state === 'target' ? { background: '#F5C84B', border: '2px solid #8A6420' }
              : state === 'hidden' ? { background: '#CBD5E1', border: '1px solid #94A3B8' }
              : { background: 'transparent', border: '3px solid #F5C84B', boxShadow: '0 0 0 2px rgba(0,0,0,0.35)' }),
          }}
        >
          {state === 'target' && <span className="text-[#5b420f] font-semibold text-lg leading-none select-none">?</span>}
        </div>
      ))}
    </div>
  );
};
