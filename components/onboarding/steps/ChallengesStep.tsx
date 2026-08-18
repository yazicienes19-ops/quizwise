import React from 'react';
import type { OnboardingChallenge } from '../../../types';
import { useTranslation } from '../../../i18n/I18nProvider';
import type { TKey } from '../../../i18n';
import { SelectCard } from '../SelectCard';
import { MAX_CHALLENGES } from '../../../services/onboardingRecommendation';

/** Exportiert, damit RecommendationStep.tsx (USP-Reveal, "Du hast gesagt: {label}")
 *  dieselben Label/Icon-Daten wiederverwendet statt sie zu duplizieren. */
export const CHALLENGES: { challenge: OnboardingChallenge; icon: string; labelKey: TKey; descKey: TKey }[] = [
  { challenge: 'understanding', icon: '🧠', labelKey: 'onboarding.flow.challenges.understanding.label', descKey: 'onboarding.flow.challenges.understanding.desc' },
  { challenge: 'structure', icon: '🗂️', labelKey: 'onboarding.flow.challenges.structure.label', descKey: 'onboarding.flow.challenges.structure.desc' },
  { challenge: 'knowledge_gaps', icon: '❓', labelKey: 'onboarding.flow.challenges.knowledge_gaps.label', descKey: 'onboarding.flow.challenges.knowledge_gaps.desc' },
  { challenge: 'exam_confidence', icon: '😰', labelKey: 'onboarding.flow.challenges.exam_confidence.label', descKey: 'onboarding.flow.challenges.exam_confidence.desc' },
  { challenge: 'retention', icon: '🔄', labelKey: 'onboarding.flow.challenges.retention.label', descKey: 'onboarding.flow.challenges.retention.desc' },
  { challenge: 'effectiveness', icon: '⏱️', labelKey: 'onboarding.flow.challenges.effectiveness.label', descKey: 'onboarding.flow.challenges.effectiveness.desc' },
  { challenge: 'motivation', icon: '🚀', labelKey: 'onboarding.flow.challenges.motivation.label', descKey: 'onboarding.flow.challenges.motivation.desc' },
  { challenge: 'unsure', icon: '🤷', labelKey: 'onboarding.flow.challenges.unsure.label', descKey: 'onboarding.flow.challenges.unsure.desc' },
];

interface ChallengesStepProps {
  value: OnboardingChallenge[];
  onChange: (challenges: OnboardingChallenge[]) => void;
}

/**
 * Wichtigster Screen für die Personalisierung. Max. MAX_CHALLENGES (3)
 * Auswahl, Reihenfolge = Priorität. OnboardingFlow deaktiviert "Weiter"
 * extern, solange value leer ist — "Sonstiges/weiß ich nicht" ist selbst
 * eine valide Antwort, deshalb kein echter Zwangs-Dead-End und kein
 * separater Skip-Button nötig.
 */
export const ChallengesStep: React.FC<ChallengesStepProps> = ({ value, onChange }) => {
  const { t, tp } = useTranslation();

  const toggle = (challenge: OnboardingChallenge) => {
    if (value.includes(challenge)) {
      onChange(value.filter(c => c !== challenge));
    } else if (value.length < MAX_CHALLENGES) {
      onChange([...value, challenge]);
    } else {
      // Bereits am Maximum: die niedrigste Priorität (zuerst gewählt) weicht der neuen Auswahl.
      onChange([...value.slice(1), challenge]);
    }
  };

  const remaining = MAX_CHALLENGES - value.length;

  return (
    <>
      <h2 className="text-lg font-black tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.challenges.title')}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{t('onboarding.flow.challenges.subtitle')}</p>
      <div className="space-y-2.5">
        {CHALLENGES.map(({ challenge, icon, labelKey, descKey }) => {
          const idx = value.indexOf(challenge);
          return (
            <SelectCard
              key={challenge}
              layout="list"
              selected={idx !== -1}
              onClick={() => toggle(challenge)}
              icon={icon}
              label={t(labelKey)}
              description={t(descKey)}
              priority={value.length > 1 && idx !== -1 ? idx + 1 : undefined}
            />
          );
        })}
      </div>
      {value.length > 0 && remaining > 0 && (
        <p className="text-[11px] text-slate-400 mt-3 text-center">
          {tp('onboarding.flow.challenges.moreHint', remaining)}
        </p>
      )}
    </>
  );
};
