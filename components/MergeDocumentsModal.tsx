import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowDown, Combine, Loader2 } from 'lucide-react';
import type { Collection, ProcessedDocument } from '../types';
import { useTranslation } from '../i18n/I18nProvider';
import { useModalA11y } from '../hooks/useModalA11y';
import { ModalCloseButton } from './ModalCloseButton';
import { documentDisplayName } from '../services/libraryService';
import { groupDocsByFolder, effectiveFolderId } from '../services/moduleFolders';
import { buildMergedFile, mergeKind, mergeKindOf, sortByDisplayName, suggestMergedName, MAX_MERGED_BYTES } from '../services/documentMerge';
import { toast } from '../services/toast';

interface Props {
  collection: Collection;
  /** Dokumente dieses Fachs. */
  documents: ProcessedDocument[];
  onUpload: (file: File, collectionId?: string, onProgress?: (fraction: number) => void, folderId?: string) => Promise<string | null>;
  onDeleteDoc: (doc: ProcessedDocument) => void;
  onClose: () => void;
}

type Phase = { kind: 'idle' } | { kind: 'load'; done: number; total: number } | { kind: 'upload'; fraction: number };

export const MergeDocumentsModal: React.FC<Props> = ({ collection, documents, onUpload, onDeleteDoc, onClose }) => {
  const { t, tp } = useTranslation();
  const busyRef = React.useRef(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const busy = phase.kind !== 'idle';
  const { titleId, dialogProps } = useModalA11y(() => { if (!busyRef.current) onClose(); });
  /** Gewählte IDs in Zielreihenfolge. */
  const [order, setOrder] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [deleteOriginals, setDeleteOriginals] = useState(false);

  const byId = useMemo(() => new Map(documents.map(d => [d.id, d])), [documents]);
  const chosen = order.map(id => byId.get(id)).filter((d): d is ProcessedDocument => !!d);
  const kind = mergeKind(chosen);
  const groups = useMemo(() => groupDocsByFolder(collection, sortByDisplayName(documents)), [collection, documents]);

  const applyOrder = (ids: string[]) => {
    setOrder(ids);
    if (!nameTouched) {
      const docs = ids.map(id => byId.get(id)).filter((d): d is ProcessedDocument => !!d);
      setName(docs.length >= 2 ? suggestMergedName(docs, collection.name) : '');
    }
  };

  const toggle = (doc: ProcessedDocument) => {
    if (order.includes(doc.id)) { applyOrder(order.filter(id => id !== doc.id)); return; }
    // Neu gewählte Dokumente in natürlicher Reihenfolge einsortieren, solange nicht von Hand umsortiert wurde.
    const next = [...order, doc.id];
    applyOrder(sortByDisplayName(next.map(id => byId.get(id)!)).map(d => d.id));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };

  const sharedFolderId = (() => {
    const ids = new Set(chosen.map(d => effectiveFolderId(collection, d)));
    return ids.size === 1 ? [...ids][0] : undefined;
  })();

  const canMerge = chosen.length >= 2 && !!kind && name.trim().length > 0 && !busy;

  const run = async () => {
    if (!canMerge) return;
    busyRef.current = true;
    try {
      setPhase({ kind: 'load', done: 0, total: chosen.length });
      const file = await buildMergedFile(chosen, name.trim(), p => setPhase({ kind: 'load', ...p }));
      if (file.size > MAX_MERGED_BYTES) {
        toast.error(t('merge.tooLarge', { mb: (file.size / 1024 / 1024).toFixed(1) }));
        return;
      }
      setPhase({ kind: 'upload', fraction: 0 });
      const newId = await onUpload(file, collection.id, f => setPhase({ kind: 'upload', fraction: f }), sharedFolderId);
      if (!newId) return; // Upload meldet seinen Fehler selbst (Limit, Netz …); Originale bleiben.
      if (deleteOriginals) chosen.forEach(onDeleteDoc);
      toast.success(tp('merge.done', chosen.length, { name: name.trim() }));
      onClose();
    } catch (e) {
      console.error('Zusammenfügen fehlgeschlagen:', e);
      toast.error(t('merge.failed'));
    } finally {
      busyRef.current = false;
      setPhase({ kind: 'idle' });
    }
  };

  const status = phase.kind === 'load'
    ? t('merge.loading', { done: Math.min(phase.done + 1, phase.total), total: phase.total })
    : phase.kind === 'upload'
      ? t('merge.uploading', { pct: Math.round(phase.fraction * 100) })
      : null;

  const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.08em]';

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => { if (!busy) onClose(); }}>
      <div
        {...dialogProps}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-[24px] shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-4 px-6 sm:px-8 pt-6 pb-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="min-w-0">
            <p className={`${eyebrow} mb-1`} style={{ color: 'var(--primary-ink)' }}>{collection.name}</p>
            <h2 id={titleId} className="text-xl font-semibold" style={{ color: 'var(--text-main)' }}>{t('merge.title')}</h2>
            <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t('merge.desc')}</p>
          </div>
          {!busy && <ModalCloseButton onClick={onClose} label={t('common.close')} />}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 py-5 space-y-6">
          <section className="space-y-2">
            <p className={eyebrow} style={{ color: 'var(--text-secondary)' }}>{t('merge.pick')}</p>
            {groups.map(({ folder, docs: groupDocs }) => groupDocs.length > 0 && (
              <div key={folder?.id ?? 'loose'} className="space-y-1">
                {folder && <p className="text-[12px] font-semibold px-1 pt-1" style={{ color: 'var(--text-secondary)' }}>{folder.name}</p>}
                {groupDocs.map(d => {
                  const on = order.includes(d.id);
                  const blocked = !on && !!kind && mergeKindOf(d) !== kind;
                  return (
                    <label key={d.id} className={`flex items-start gap-2.5 px-2 py-2 rounded-xl transition-colors ${blocked || busy ? 'opacity-50' : 'cursor-pointer hover:bg-[var(--bg-main)]'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={blocked || busy}
                        onChange={() => toggle(d)}
                        className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--primary)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold break-words" style={{ color: 'var(--text-main)' }}>{documentDisplayName(d)}</span>
                        {blocked && <span className="block text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{t('merge.otherKind')}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </section>

          {chosen.length >= 2 && (
            <section className="space-y-2">
              <p className={eyebrow} style={{ color: 'var(--text-secondary)' }}>{t('merge.order')}</p>
              <ol className="space-y-1.5">
                {chosen.map((d, i) => (
                  <li key={d.id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
                    <span className="w-6 text-[12px] font-semibold tabular-nums shrink-0" style={{ color: 'var(--primary-ink)' }}>{i + 1}.</span>
                    <span className="flex-1 min-w-0 text-[13px] font-semibold break-words" style={{ color: 'var(--text-main)' }}>{documentDisplayName(d)}</span>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || busy} aria-label={t('merge.up')} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-[var(--bg-sidebar)]" style={{ color: 'var(--text-secondary)' }}>
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === chosen.length - 1 || busy} aria-label={t('merge.down')} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-[var(--bg-sidebar)]" style={{ color: 'var(--text-secondary)' }}>
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {chosen.length >= 2 && (
            <section className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="merge-name" className={eyebrow} style={{ color: 'var(--text-secondary)' }}>{t('merge.name')}</label>
                <input
                  id="merge-name"
                  value={name}
                  onChange={e => { setName(e.target.value); setNameTouched(true); }}
                  disabled={busy}
                  maxLength={120}
                  className="w-full px-4 py-3 rounded-2xl text-[14px] outline-none"
                  style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                />
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={deleteOriginals} disabled={busy} onChange={e => setDeleteOriginals(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--primary)]" />
                <span>
                  <span className="block text-[13.5px] font-semibold" style={{ color: 'var(--text-main)' }}>{t('merge.deleteOriginals')}</span>
                  <span className="block text-[12px]" style={{ color: 'var(--text-secondary)' }}>{t('merge.deleteOriginalsHint')}</span>
                </span>
              </label>
            </section>
          )}
        </div>

        <div className="px-6 sm:px-8 py-4 flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          <p className="flex-1 min-w-[12rem] text-[12.5px] flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            {status
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />{status}</>
              : kind === 'pdf' ? t('merge.hintPdf') : kind === 'text' ? t('merge.hintText') : t('merge.hintPick')}
          </p>
          <button
            type="button"
            onClick={run}
            disabled={!canMerge}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            <Combine className="w-4 h-4" strokeWidth={2.25} />
            {chosen.length >= 2 ? tp('merge.cta', chosen.length) : t('merge.ctaEmpty')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
