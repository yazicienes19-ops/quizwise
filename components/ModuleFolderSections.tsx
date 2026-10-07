import React, { useState } from 'react';
import { FolderOpen, Pencil, Trash2, Upload, Check } from 'lucide-react';
import type { Collection, ModuleFolder, ProcessedDocument } from '../types';
import { useTranslation } from '../i18n/I18nProvider';
import { confirmDialog } from '../services/confirmDialog';
import { groupDocsByFolder, folderList, type FolderActions } from '../services/moduleFolders';

interface Props {
  collection: Collection;
  docs: ProcessedDocument[];
  viewMode: 'grid' | 'list';
  actions: FolderActions;
  renderDoc: (doc: ProcessedDocument, folderSelect: React.ReactNode) => React.ReactNode;
  onUploadInto: (folderId: string | undefined) => void;
}

/** Schalter "Beim Lernen nutzen" eines Unterordners. */
const UseToggle: React.FC<{ on: boolean; onChange: (on: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none text-[12.5px] font-semibold" style={{ color: on ? 'var(--text-main)' : 'var(--text-secondary)' }}>
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative w-9 h-5 rounded-full transition-colors shrink-0"
      style={{ background: on ? 'var(--primary)' : 'var(--border-color)' }}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white dark:bg-slate-100 shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
    {label}
  </label>
);

/**
 * Dokumente eines Fachs nach Unterordnern gruppiert (services/moduleFolders.ts).
 * Je Unterordner: Schalter für die Wissensbasis, Umbenennen, Löschen, Hochladen.
 */
export const ModuleFolderSections: React.FC<Props> = ({ collection, docs, viewMode, actions, renderDoc, onUploadInto }) => {
  const { t } = useTranslation();
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const folders = folderList(collection);

  const folderSelect = (doc: ProcessedDocument) => (
    <select
      value={doc.folderId && folders.some(f => f.id === doc.folderId) ? doc.folderId : ''}
      onChange={e => actions.moveDocToFolder(doc.id, e.target.value || undefined)}
      onClick={e => e.stopPropagation()}
      aria-label={t('mf.moveTo')}
      className="max-w-full px-2.5 py-1.5 rounded-xl text-[12px] font-semibold outline-none"
      style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
    >
      <option value="">{t('mf.noFolder')}</option>
      {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  );

  const header = (folder: ModuleFolder | null, count: number) => {
    if (!folder) {
      return (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>{t('mf.loose')}</span>
          <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{count}</span>
        </div>
      );
    }
    const used = !folder.excluded;
    if (editId === folder.id) {
      return (
        <form
          className="flex items-center gap-2"
          onSubmit={e => { e.preventDefault(); actions.renameFolder(collection.id, folder.id, editName); setEditId(null); }}
        >
          <input
            autoFocus
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm font-semibold outline-none"
            style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '2px solid var(--primary)' }}
          />
          <button type="submit" aria-label={t('lib.save')} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
            <Check className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <button type="button" onClick={() => setEditId(null)} className="px-3 py-2 text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>✕</button>
        </form>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
            <FolderOpen className="w-4 h-4" style={{ color: 'var(--primary-ink)' }} strokeWidth={2} />
          </span>
          <h3 className="text-[15px] font-semibold break-words min-w-0" style={{ color: used ? 'var(--text-main)' : 'var(--text-secondary)' }}>{folder.name}</h3>
          <span className="text-[12px] shrink-0" style={{ color: 'var(--text-secondary)' }}>{count}</span>
        </div>
        <div className="flex items-center gap-1">
          <UseToggle on={used} onChange={on => actions.setFolderExcluded(collection.id, folder.id, !on)} label={t('mf.useForLearning')} />
          <button onClick={() => onUploadInto(folder.id)} className="w-8 h-8 ml-2 rounded-xl flex items-center justify-center text-slate-400 hover:text-[var(--primary-ink)] transition-colors" aria-label={t('mf.uploadHere')} title={t('mf.uploadHere')}>
            <Upload className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
          <button onClick={() => { setEditId(folder.id); setEditName(folder.name); }} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-[var(--primary-ink)] transition-colors" aria-label={t('mf.rename')} title={t('mf.rename')}>
            <Pencil className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
          <button
            onClick={() => {
              void confirmDialog({ message: t('mf.deleteConfirm', { name: folder.name }), danger: true })
                .then(ok => { if (ok) actions.removeFolder(collection.id, folder.id); });
            }}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors"
            aria-label={t('mf.delete')} title={t('mf.delete')}
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {groupDocsByFolder(collection, docs).map(({ folder, docs: groupDocs }) => (
        <section key={folder?.id ?? 'loose'} className="space-y-3">
          {header(folder, groupDocs.length)}
          {folder?.excluded && (
            <p className="text-[12.5px] px-1" style={{ color: 'var(--text-secondary)' }}>{t('mf.excludedHint')}</p>
          )}
          {groupDocs.length === 0 ? (
            <p className="text-[13px] px-4 py-5 rounded-2xl text-center" style={{ color: 'var(--text-secondary)', border: '1px dashed var(--border-color)' }}>
              {t('mf.emptyFolder')}
            </p>
          ) : (
            <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5' : 'space-y-2'} ${folder?.excluded ? 'opacity-60' : ''}`}>
              {groupDocs.map(doc => <React.Fragment key={doc.id}>{renderDoc(doc, folderSelect(doc))}</React.Fragment>)}
            </div>
          )}
        </section>
      ))}
    </div>
  );
};
