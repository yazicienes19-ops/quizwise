import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, X } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { useModalA11y } from '../hooks/useModalA11y';
import { ModalCloseButton } from './ModalCloseButton';
import { toast } from '../services/toast';
import { uploadCardImage, CardImageError } from '../services/cardImages';
import { rectFromPoints, type OcclusionMask, type OcclusionMode } from '../services/occlusion';

interface Props {
  userId: string;
  onClose: () => void;
  /** Bild ist hochgeladen: Pfad, Rechtecke und Texte zum Anlegen der Karten. */
  onCreate: (data: { image: string; masks: OcclusionMask[]; mode: OcclusionMode; header: string; back: string }) => void;
}

/**
 * Bild verdecken: Bild wählen, Rechtecke über die abzufragenden Stellen
 * ziehen (Maus, Touch, Stift). Jedes Rechteck wird eine Karte.
 */
export const OcclusionEditorModal: React.FC<Props> = ({ userId, onClose, onCreate }) => {
  const { t, tp } = useTranslation();
  const { titleId, dialogProps } = useModalA11y(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [masks, setMasks] = useState<OcclusionMask[]>([]);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<OcclusionMask | null>(null);
  const [mode, setMode] = useState<OcclusionMode>('hideAll');
  const [header, setHeader] = useState(t('occ.defaultHeader'));
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error(t('img.err.not-image')); return; }
    setFile(f); setMasks([]);
    setPreview(URL.createObjectURL(f));
  };

  const point = (e: React.PointerEvent) => {
    const r = areaRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setStart(point(e)); setDraft(null);
  };
  const onMove = (e: React.PointerEvent) => { if (start) setDraft(rectFromPoints(start, point(e))); };
  const onUp = (e: React.PointerEvent) => {
    if (!start) return;
    const rect = rectFromPoints(start, point(e));
    if (rect) setMasks(m => [...m, rect]);
    setStart(null); setDraft(null);
  };

  const save = async () => {
    if (!file || !masks.length || saving) return;
    setSaving(true);
    try {
      const image = await uploadCardImage(userId, `occ${Date.now().toString(36)}`, file);
      onCreate({ image, masks, mode, header: header.trim(), back: back.trim() });
      onClose();
    } catch (e) {
      toast.error(e instanceof CardImageError ? t(`img.err.${e.code}` as const) : t('img.err.upload'));
    } finally {
      setSaving(false);
    }
  };

  const box = (m: OcclusionMask) => ({ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` });

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div {...dialogProps} className="bg-white dark:bg-slate-900 rounded-[24px] w-full max-w-3xl shadow-3d-deep max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 sm:px-8 py-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 id={titleId} className="text-xl font-black dark:text-white">{t('occ.title')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('occ.subtitle')}</p>
          </div>
          <ModalCloseButton onClick={onClose} label={t('common.close')} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl" />
        </div>

        <div className="px-6 sm:px-8 py-5 space-y-5">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {!preview ? (
            <button type="button" onClick={() => inputRef.current?.click()}
              className="w-full py-12 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center gap-2 text-slate-500 hover:border-slate-400 transition-colors">
              <ImagePlus className="w-7 h-7" aria-hidden="true" />
              <span className="text-[13px] font-semibold">{t('occ.pick')}</span>
            </button>
          ) : (
            <div className="space-y-2">
              <div
                ref={areaRef}
                className="relative w-full select-none touch-none cursor-crosshair rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800"
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
                role="application"
                aria-label={t('occ.drawHint')}
              >
                <img src={preview} alt="" draggable={false} className="block w-full h-auto pointer-events-none" />
                {masks.map((m, i) => (
                  <div key={i} className="absolute rounded-[4px] flex items-center justify-center" style={{ ...box(m), background: 'rgba(245,200,75,0.85)', border: '2px solid #8A6420' }}>
                    <span className="text-[13px] font-black text-[#5b420f]">{i + 1}</span>
                    <button
                      type="button"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => setMasks(ms => ms.filter((_, j) => j !== i))}
                      aria-label={t('occ.removeMask', { n: i + 1 })}
                      className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-white dark:bg-slate-900 shadow flex items-center justify-center text-slate-600 dark:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {draft && <div className="absolute rounded-[4px] border-2 border-dashed border-[#8A6420] bg-[rgba(245,200,75,0.4)]" style={box(draft)} />}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{masks.length ? tp('occ.masksN', masks.length) : t('occ.drawHint')}</span>
                <button type="button" onClick={() => inputRef.current?.click()} className="font-semibold hover:text-slate-800 dark:hover:text-slate-200">{t('occ.otherImage')}</button>
              </div>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1">{t('occ.mode')}</legend>
            {(['hideAll', 'hideOne'] as const).map(m => (
              <label key={m} className="flex items-start gap-2.5 text-[13px] text-slate-700 dark:text-slate-200 cursor-pointer">
                <input type="radio" name="occ-mode" checked={mode === m} onChange={() => setMode(m)} className="mt-1" />
                <span><span className="font-semibold">{t(`occ.mode.${m}` as const)}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{t(`occ.mode.${m}.hint` as const)}</span></span>
              </label>
            ))}
          </fieldset>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-semibold text-slate-500">
              {t('occ.header')}
              <input value={header} onChange={e => setHeader(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm font-normal text-slate-900 dark:text-white outline-none border-2 border-transparent focus:border-slate-300" />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-500">
              {t('occ.back')}
              <input value={back} onChange={e => setBack(e.target.value)} placeholder={t('occ.backPlaceholder')} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm font-normal text-slate-900 dark:text-white outline-none border-2 border-transparent focus:border-slate-300" />
            </label>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-3 rounded-2xl text-[13px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800">{t('quiz.cancel')}</button>
          <button type="button" onClick={save} disabled={!file || !masks.length || saving}
            className="px-6 py-3 rounded-2xl text-[13px] font-semibold shadow-lg transition-all disabled:opacity-40"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
            {saving ? t('img.uploading') : masks.length ? tp('occ.createN', masks.length) : t('occ.create0')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
