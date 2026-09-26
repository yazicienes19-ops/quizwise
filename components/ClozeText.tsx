import React from 'react';
import { parseCloze } from '../services/cloze';
import { MathText } from './MathText';
import { useTranslation } from '../i18n/I18nProvider';

/**
 * Zeigt Lückentext (services/cloze.ts): verdeckt als Lücke mit optionalem
 * Hinweis, aufgedeckt als hervorgehobene Antwort.
 */
export const ClozeText: React.FC<{ text: string; revealed: boolean }> = ({ text, revealed }) => {
  const { t } = useTranslation();
  return (
  <>
    {parseCloze(text).map((seg, i) => {
      if (seg.kind === 'text') return <MathText key={i} text={seg.text} />;
      return revealed ? (
        <mark
          key={i}
          className="rounded px-1 font-semibold"
          style={{ background: 'color-mix(in srgb, var(--primary) 22%, transparent)', color: 'var(--ink)' }}
        >
          <MathText text={seg.answer} />
        </mark>
      ) : (
        <span
          key={i}
          className="inline-block min-w-[3ch] rounded px-1.5 font-semibold"
          style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary-ink)', borderBottom: '2px solid var(--primary)' }}
          aria-label={seg.hint ? t('cloze.gapHint', { hint: seg.hint }) : t('cloze.gap')}
        >
          [{seg.hint ?? '…'}]
        </span>
      );
    })}
  </>
  );
};
