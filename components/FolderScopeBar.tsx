import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { Collection, ProcessedDocument } from '../types';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';
import { folderList, persistentExcludedIds, setRunFolderScope, isDocInScope } from '../services/moduleFolders';

interface Props {
  collection: Collection | null | undefined;
  /** Alle Dokumente (zum Prüfen, dass nach dem Abwählen noch etwas übrig bleibt). */
  documents: ProcessedDocument[];
  /** Nach jeder Änderung: Quelle neu bauen (buildCollectionSource liest die Auswahl). */
  onChange: () => void;
  className?: string;
}

/**
 * Unterordner eines Fachs nur für diesen Durchgang an- oder abwählen
 * (services/moduleFolders.ts). Startet mit der dauerhaften Einstellung aus der
 * Bibliothek; beim Verlassen der Funktion gilt wieder diese.
 * Ohne Unterordner zeigt die Leiste nichts.
 */
export const FolderScopeBar: React.FC<Props> = ({ collection, documents, onChange, className = '' }) => {
  const { t } = useTranslation();
  const folders = folderList(collection);
  const [excluded, setExcluded] = useState<Set<string>>(() => collection ? persistentExcludedIds(collection) : new Set());
  const collectionId = collection?.id;

  useEffect(() => () => { if (collectionId) setRunFolderScope(collectionId, null); }, [collectionId]);

  if (!collection || folders.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set<string>(excluded);
    if (next.has(id)) next.delete(id); else next.add(id);
    // Nicht alles abwählen: ohne Dokumente gäbe es keine Quelle mehr.
    if (!documents.some(d => d.collectionId === collection.id && isDocInScope(collection, d, next))) {
      toast.info(t('mf.keepOne'));
      return;
    }
    setExcluded(next);
    setRunFolderScope(collection.id, next);
    onChange();
  };

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>{t('mf.scopeLabel')}</span>
      {folders.map(f => {
        const on = !excluded.has(f.id);
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => toggle(f.id)}
            aria-pressed={on}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-all"
            style={on
              ? { background: 'var(--primary)', color: 'var(--primary-text)', border: '1px solid var(--primary)' }
              : { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', textDecoration: 'line-through' }}
          >
            {on && <Check className="w-3 h-3" strokeWidth={3} />}
            {f.name}
          </button>
        );
      })}
    </div>
  );
};
