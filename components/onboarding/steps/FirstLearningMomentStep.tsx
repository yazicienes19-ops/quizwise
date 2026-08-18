import React, { useEffect, useState } from 'react';
import type { OnboardingChallenge, ProcessedDocument } from '../../../types';
import { useTranslation } from '../../../i18n/I18nProvider';
import { detectChaptersForDoc, type Chapter } from '../../../services/chapterService';
import { getRecommendation, buildCombinedRecommendation } from '../../../services/onboardingRecommendation';
import { TAB_LABEL_KEY } from '../tabLabels';

const CHALLENGE_LABEL_KEY: Record<OnboardingChallenge, 'onboarding.flow.challenges.understanding.label' | 'onboarding.flow.challenges.structure.label' | 'onboarding.flow.challenges.knowledge_gaps.label' | 'onboarding.flow.challenges.exam_confidence.label' | 'onboarding.flow.challenges.retention.label' | 'onboarding.flow.challenges.effectiveness.label' | 'onboarding.flow.challenges.motivation.label' | 'onboarding.flow.challenges.unsure.label'> = {
  understanding: 'onboarding.flow.challenges.understanding.label',
  structure: 'onboarding.flow.challenges.structure.label',
  knowledge_gaps: 'onboarding.flow.challenges.knowledge_gaps.label',
  exam_confidence: 'onboarding.flow.challenges.exam_confidence.label',
  retention: 'onboarding.flow.challenges.retention.label',
  effectiveness: 'onboarding.flow.challenges.effectiveness.label',
  motivation: 'onboarding.flow.challenges.motivation.label',
  unsure: 'onboarding.flow.challenges.unsure.label',
};

/** Nie länger als das warten, sonst fühlt sich der Abschluss des Flows langsam an. */
const CHAPTER_DETECTION_TIMEOUT_MS = 9000;

interface FirstLearningMomentStepProps {
  challenges: OnboardingChallenge[];
  /** null solange das gerade hochgeladene Dokument im documents-State des
   *  Aufrufers noch nicht aufgetaucht ist (sehr kurzes Zeitfenster nach dem Upload). */
  doc: ProcessedDocument | null;
}

/**
 * "Wir haben N Themen erkannt" (Spec Abschnitt 11) — blockiert NIE den CTA:
 * detectChaptersForDoc läuft im Hintergrund mit kurzem Timeout-Budget, bei
 * Zeitüberschreitung oder 0 Treffern wird einfach ohne Themenliste weiter-
 * gemacht (die Zielfunktion hat ohnehin eine eigene Kapitel-/Themenauswahl).
 */
export const FirstLearningMomentStep: React.FC<FirstLearningMomentStepProps> = ({ challenges, doc }) => {
  const { t, tp } = useTranslation();
  const [topics, setTopics] = useState<Chapter[] | null>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const timeout = new Promise<Chapter[]>(resolve => setTimeout(() => resolve([]), CHAPTER_DETECTION_TIMEOUT_MS));
    Promise.race([detectChaptersForDoc(doc), timeout])
      .then(chapters => { if (!cancelled) setTopics(chapters); })
      .catch(() => { if (!cancelled) setTopics([]); });
    return () => { cancelled = true; };
  }, [doc]);

  const primaryChallenge = challenges[0] ?? 'unsure';
  const isCombined = challenges.length >= 2;
  const primaryTab = isCombined
    ? buildCombinedRecommendation(challenges).steps[0].tab
    : getRecommendation(primaryChallenge).primaryTab;
  const featureTabKey = TAB_LABEL_KEY[primaryTab];

  return (
    <>
      <h2 className="text-lg font-black tracking-tight mb-2" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.firstMoment.title')}
      </h2>

      {topics && topics.length > 0 && (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            {tp('onboarding.flow.firstMoment.topicsFound', topics.length)}
          </p>
          <ul className="space-y-1.5 mb-4">
            {topics.slice(0, 8).map(chapter => (
              <li
                key={chapter.index}
                className="text-sm px-3 py-2 rounded-[10px]"
                style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
              >
                {chapter.title}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.firstMoment.recommendedStart', {
          challenge: t(CHALLENGE_LABEL_KEY[primaryChallenge]),
          feature: featureTabKey ? t(featureTabKey) : t(getRecommendation(primaryChallenge).phaseLabelKey),
        })}
      </p>
    </>
  );
};
