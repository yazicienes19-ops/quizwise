import React from 'react';
import type { SourceStatus } from '../services/libraryService';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';

const CONFIG: Record<SourceStatus, { labelKey: TKey; dot: string; pill: string }> = {
  uploading:  { labelKey: 'ssb.uploading',  dot: 'bg-blue-500 animate-pulse',   pill: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  processing: { labelKey: 'ssb.processing',  dot: 'bg-amber-500 animate-pulse',  pill: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  ready:      { labelKey: 'ssb.ready',       dot: 'bg-emerald-500',              pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  failed:     { labelKey: 'ssb.failed',      dot: 'bg-rose-500',                 pill: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
};

export const SourceStatusBadge: React.FC<{ status: SourceStatus }> = ({ status }) => {
  const { t } = useTranslation();
  const { labelKey, dot, pill } = CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {t(labelKey)}
    </span>
  );
};

const DIGEST_CONFIG: Record<'pending' | 'ready' | 'error', { labelKey: TKey; dot: string; pill: string }> = {
  pending: { labelKey: 'ssb.analyzing',     dot: 'bg-violet-500 animate-pulse', pill: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  ready:   { labelKey: 'ssb.analyzed',      dot: 'bg-violet-500',               pill: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  error:   { labelKey: 'ssb.analyzeFailed', dot: 'bg-rose-400',                 pill: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
};

export const DigestStatusBadge: React.FC<{ status: 'pending' | 'ready' | 'error' }> = ({ status }) => {
  const { t } = useTranslation();
  const { labelKey, dot, pill } = DIGEST_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {t(labelKey)}
    </span>
  );
};
