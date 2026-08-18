import React, { useState } from 'react';
import type { EducationPath, OnboardingContext } from '../../../types';
import { useTranslation } from '../../../i18n/I18nProvider';
import type { TKey } from '../../../i18n';

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean }> = ({
  label, value, onChange, placeholder, textarea,
}) => {
  const [focused, setFocused] = useState(false);
  const style: React.CSSProperties = {
    background: 'var(--bg-main)',
    color: 'var(--text-main)',
    border: `2px solid ${focused ? 'var(--primary)' : 'var(--border-color)'}`,
    boxShadow: focused ? '0 0 0 4px color-mix(in srgb, var(--primary) 18%, transparent)' : 'none',
  };
  const shared = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    placeholder,
    className: 'w-full px-4 py-3 rounded-[14px] text-sm font-medium outline-none transition-all',
    style,
  };
  return (
    <label className="block mb-4">
      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{label}</span>
      {textarea ? <textarea {...shared} rows={3} className={`${shared.className} resize-none`} /> : <input type="text" {...shared} />}
    </label>
  );
};

interface ContextStepProps {
  path: EducationPath | undefined;
  value: OnboardingContext;
  onChange: (patch: Partial<OnboardingContext>) => void;
}

/**
 * Ein Feld-Set pro Bildungsweg (Spec Abschnitt 3) — alle Felder optional,
 * "Weiter" ist nie deaktiviert. Kein separater Skip-Button nötig, da Weiter
 * ohne jede Eingabe funktioniert.
 */
export const ContextStep: React.FC<ContextStepProps> = ({ path, value, onChange }) => {
  const { t } = useTranslation();
  const set = (fieldName: keyof OnboardingContext) => (v: string) => onChange({ [fieldName]: v });

  const renderField = (labelKey: TKey, fieldName: keyof OnboardingContext, placeholderKey: TKey, textarea?: boolean) => (
    <Field
      key={fieldName}
      label={t(labelKey)}
      value={value[fieldName] ?? ''}
      onChange={set(fieldName)}
      placeholder={t(placeholderKey)}
      textarea={textarea}
    />
  );

  let fields: React.ReactNode = null;
  switch (path) {
    case 'university':
      fields = <>
        {renderField('onboarding.flow.context.university.subject', 'subject', 'onboarding.flow.context.university.subjectPlaceholder')}
        {renderField('onboarding.flow.context.university.stage', 'stage', 'onboarding.flow.context.university.stagePlaceholder')}
        {renderField('onboarding.flow.context.university.currentTopic', 'currentTopic', 'onboarding.flow.context.university.currentTopicPlaceholder')}
      </>;
      break;
    case 'school':
      fields = <>
        {renderField('onboarding.flow.context.school.subject', 'subject', 'onboarding.flow.context.school.subjectPlaceholder')}
        {renderField('onboarding.flow.context.school.currentTopic', 'currentTopic', 'onboarding.flow.context.school.currentTopicPlaceholder')}
        {renderField('onboarding.flow.context.school.examDate', 'upcomingExamAt', 'onboarding.flow.context.school.examDatePlaceholder')}
      </>;
      break;
    case 'apprenticeship':
      fields = <>
        {renderField('onboarding.flow.context.apprenticeship.subject', 'subject', 'onboarding.flow.context.apprenticeship.subjectPlaceholder')}
        {renderField('onboarding.flow.context.apprenticeship.stage', 'stage', 'onboarding.flow.context.apprenticeship.stagePlaceholder')}
        {renderField('onboarding.flow.context.apprenticeship.currentTopic', 'currentTopic', 'onboarding.flow.context.apprenticeship.currentTopicPlaceholder')}
        {renderField('onboarding.flow.context.apprenticeship.examDate', 'upcomingExamAt', 'onboarding.flow.context.apprenticeship.examDatePlaceholder')}
      </>;
      break;
    case 'continuing_education':
      fields = <>
        {renderField('onboarding.flow.context.continuing.subject', 'subject', 'onboarding.flow.context.continuing.subjectPlaceholder')}
        {renderField('onboarding.flow.context.continuing.examDate', 'upcomingExamAt', 'onboarding.flow.context.continuing.examDatePlaceholder')}
      </>;
      break;
    case 'self_directed':
      fields = <>
        {renderField('onboarding.flow.context.self.subject', 'subject', 'onboarding.flow.context.self.subjectPlaceholder')}
        {renderField('onboarding.flow.context.self.goal', 'goalText', 'onboarding.flow.context.self.goalPlaceholder')}
      </>;
      break;
    case 'other':
    default:
      fields = renderField('onboarding.flow.context.other.freeText', 'freeText', 'onboarding.flow.context.other.freeTextPlaceholder', true);
      break;
  }

  return (
    <>
      <h2 className="text-lg font-black tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.context.title')}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{t('onboarding.flow.context.subtitle')}</p>
      {fields}
    </>
  );
};
