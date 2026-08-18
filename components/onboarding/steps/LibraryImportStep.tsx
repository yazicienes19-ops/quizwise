import React, { useRef } from 'react';
import { useTranslation } from '../../../i18n/I18nProvider';
import { SelectCard } from '../SelectCard';

export type ImportMode = 'file' | 'text' | 'link';

const ACCEPTED = '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.heic,.heif';

interface LibraryImportStepProps {
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  text: string;
  onTextChange: (v: string) => void;
  textTitle: string;
  onTextTitleChange: (v: string) => void;
  link: string;
  onLinkChange: (v: string) => void;
}

/**
 * Schlanker, eigener Import-Screen (User-Entscheidung, Onboarding-Plan
 * Abschnitt 4) — nutzt dieselben Upload-Wege wie UploadSourceModal.tsx
 * (Datei/Text/Link), aber ohne dessen 9 Metadatenfelder (Modul, Semester,
 * Prüfungsdatum, Tags, Altklausur…). Die eigentliche Übermittlung passiert
 * über den gemeinsamen primären Button in OnboardingFlow, nicht hier.
 */
export const LibraryImportStep: React.FC<LibraryImportStepProps> = ({
  mode, onModeChange, selectedFile, onFileSelect, text, onTextChange, textTitle, onTextTitleChange, link, onLinkChange,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <h2 className="text-lg font-black tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.import.title')}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{t('onboarding.flow.import.subtitle')}</p>

      <div className="space-y-2.5 mb-5">
        <SelectCard
          layout="list"
          selected={mode === 'file'}
          onClick={() => onModeChange('file')}
          icon="📄"
          label={t('onboarding.flow.import.mode.file.label')}
          description={t('onboarding.flow.import.mode.file.desc')}
        />
        <SelectCard
          layout="list"
          selected={mode === 'text'}
          onClick={() => onModeChange('text')}
          icon="✍️"
          label={t('onboarding.flow.import.mode.text.label')}
          description={t('onboarding.flow.import.mode.text.desc')}
        />
        <SelectCard
          layout="list"
          selected={mode === 'link'}
          onClick={() => onModeChange('link')}
          icon="▶️"
          label={t('onboarding.flow.import.mode.link.label')}
          description={t('onboarding.flow.import.mode.link.desc')}
        />
      </div>

      {mode === 'file' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={e => onFileSelect(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 rounded-[14px] text-sm font-bold transition-colors"
            style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '2px dashed var(--border-color)' }}
          >
            {selectedFile ? t('onboarding.flow.import.fileSelected', { name: selectedFile.name }) : t('onboarding.flow.import.filePrompt')}
          </button>
        </div>
      )}

      {mode === 'text' && (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
              {t('onboarding.flow.import.textTitleLabel')}
            </span>
            <input
              type="text"
              value={textTitle}
              onChange={e => onTextTitleChange(e.target.value)}
              className="w-full px-4 py-3 rounded-[14px] text-sm font-medium outline-none"
              style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '2px solid var(--border-color)' }}
            />
          </label>
          <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
              {t('onboarding.flow.import.textLabel')}
            </span>
            <textarea
              value={text}
              onChange={e => onTextChange(e.target.value)}
              rows={6}
              className="w-full px-4 py-3 rounded-[14px] text-sm font-medium outline-none resize-none"
              style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '2px solid var(--border-color)' }}
            />
          </label>
        </div>
      )}

      {mode === 'link' && (
        <label className="block">
          <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
            {t('onboarding.flow.import.linkLabel')}
          </span>
          <input
            type="text"
            value={link}
            onChange={e => onLinkChange(e.target.value)}
            placeholder="https://…"
            className="w-full px-4 py-3 rounded-[14px] text-sm font-medium outline-none"
            style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '2px solid var(--border-color)' }}
          />
        </label>
      )}
    </>
  );
};
