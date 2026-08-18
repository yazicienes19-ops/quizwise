import React from 'react';
import { useTranslation } from '../../../../i18n/I18nProvider';

/**
 * Zeigt das Split-Screen-Konzept des echten `SplitScreenReader.tsx` (Zeile
 * 304-386: links Dokument als "Papier"-Karte in Serif-Schrift, rechts Tutor-
 * Chat) als kompaktes 2-Spalten-Mockup — kein Fake-Modus der echten,
 * zustandsbehafteten Komponente (braucht echtes Dokument + KI-Calls),
 * konsistent mit allen anderen Tour-Preview-Panels dieses Onboardings.
 */
export const SplitScreenReaderPreview: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-stretch gap-2">
      <div
        className="flex-[1.2] min-w-0 rounded-[10px] p-2.5"
        style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
      >
        <p className="text-[8px] font-black uppercase tracking-widest mb-1.5 opacity-60" style={{ color: 'var(--text-main)' }}>
          {t('onboarding.tour.explainer.docLabel')}
        </p>
        <p
          className="text-[11px] leading-snug"
          style={{ fontFamily: 'ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif', color: 'var(--text-main)' }}
        >
          Extinktion beschreibt das Verschwinden einer{' '}
          <span className="rounded px-0.5" style={{ background: 'color-mix(in srgb, var(--primary) 30%, transparent)' }}>
            konditionierten Reaktion
          </span>
          , wenn der Reiz nicht mehr gekoppelt wird.
        </p>
      </div>
      <div className="flex items-center shrink-0 text-sm opacity-40" style={{ color: 'var(--text-main)' }}>↔</div>
      <div
        className="flex-1 min-w-0 rounded-[10px] p-2.5 space-y-1.5"
        style={{ background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-main))', border: '1px solid var(--border-color)' }}
      >
        <p className="text-[8px] font-black uppercase tracking-widest opacity-60" style={{ color: 'var(--text-main)' }}>
          {t('nav.explainer')}
        </p>
        <p className="text-[10px] font-bold" style={{ color: 'var(--text-main)' }}>"Was bedeutet das hier?"</p>
        <p className="text-[10px] leading-snug" style={{ color: 'var(--text-main)' }}>
          Genau die markierte Stelle links, kurz erklärt.
        </p>
      </div>
    </div>
  );
};
