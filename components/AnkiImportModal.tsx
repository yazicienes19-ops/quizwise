import { hasCloze } from '../services/cloze';
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Flashcard, FlashcardDeck } from '../types';
import { createSrsState } from '../services/spacedRepetition';
import { useTranslation } from '../i18n/I18nProvider';
import { useModalA11y } from '../hooks/useModalA11y';
import { ModalCloseButton } from './ModalCloseButton';
import { readApkg, imageMimeFor, AnkiPackageError, type AnkiPackage } from '../services/ankiPackage';
import { uploadCardImage, CardImageError } from '../services/cardImages';
import { toast } from '../services/toast';

interface AnkiImportModalProps {
  decks: FlashcardDeck[];
  onClose: () => void;
  onImport: (cards: Flashcard[], targetDeckId: string | null, newDeckName?: string) => void;
  /** Für Bilder aus Anki-Paketen (Upload in den eigenen Bildspeicher). */
  userId?: string;
}

function detectSeparator(line: string): '\t' | ';' | ',' {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  return ',';
}

/** Erste NICHT in Anführungszeichen stehende Trenner-Position — sonst würde
 *  ein Komma-Trenner bei einem Quizlet-Export wie
 *  `"Klassische, operante Konditionierung","Lernen durch Verstärkung"`
 *  mitten im zitierten Begriff splitten statt am Feldende. */
function findUnquotedSeparator(line: string, sep: string): number {
  let inQuotes = false;
  let quoteChar = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === quoteChar) {
        if (line[i + 1] === quoteChar) { i++; continue; } // "" = escapetes Anführungszeichen
        inQuotes = false;
      }
    } else if (ch === '"' || ch === "'") {
      inQuotes = true;
      quoteChar = ch;
    } else if (ch === sep) {
      return i;
    }
  }
  return -1;
}

function unquoteField(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    return s.slice(1, -1).split(s[0] + s[0]).join(s[0]);
  }
  return s;
}

function parseLines(text: string): { front: string; back: string }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = detectSeparator(lines[0]);
  return lines
    .map(line => {
      const idx = findUnquotedSeparator(line, sep);
      // Anki-Lückentext kommt oft ohne Rückseite ("Extra"-Feld leer): die Lücke ist die Antwort.
      if (idx === -1) {
        const only = unquoteField(line);
        return hasCloze(only) ? { front: only, back: '' } : null;
      }
      const front = unquoteField(line.slice(0, idx));
      const back = unquoteField(line.slice(idx + 1));
      return front && (back || hasCloze(front)) ? { front, back } : null;
    })
    .filter((c): c is { front: string; back: string } => c !== null);
}

export const AnkiImportModal: React.FC<AnkiImportModalProps> = ({ decks, onClose, onImport, userId }) => {
  const { t, tp } = useTranslation();
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const { titleId, dialogProps } = useModalA11y(onClose, pasteRef);
  const [tab, setTab] = useState<'paste' | 'file'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [fileText, setFileText] = useState('');
  const [targetDeckId, setTargetDeckId] = useState<string>('__new__');
  const [newDeckName, setNewDeckName] = useState(t('aim.importedDeck'));
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  // Anki-Paket (.apkg): gelesenes Paket, Lesefehler, Fortschritt beim Bild-Upload
  const [apkg, setApkg] = useState<AnkiPackage | null>(null);
  const [apkgBusy, setApkgBusy] = useState(false);
  const [apkgError, setApkgError] = useState<string | null>(null);
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null);

  const rawText = tab === 'paste' ? pasteText : fileText;

  const parsed = useMemo(
    () => (tab === 'file' && apkg ? apkg.cards : parseLines(rawText)),
    [tab, apkg, rawText],
  );
  const preview = parsed.slice(0, 5);
  const skipped = useMemo(() => {
    if (tab === 'file' && apkg) return apkg.skipped;
    if (!rawText.trim()) return 0;
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.length - parsed.length;
  }, [tab, apkg, rawText, parsed]);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setApkg(null); setApkgError(null);
    if (/\.(apkg|colpkg)$/i.test(file.name)) {
      setFileText('');
      setApkgBusy(true);
      file.arrayBuffer()
        .then(buf => readApkg(new Uint8Array(buf)))
        .then(pkg => {
          setApkg(pkg);
          setNewDeckName(pkg.deckName || file.name.replace(/\.(apkg|colpkg)$/i, ''));
        })
        .catch(e => setApkgError(e instanceof AnkiPackageError ? t(`aim.apkg.err.${e.code}` as const) : t('aim.apkg.err.not-apkg')))
        .finally(() => setApkgBusy(false));
      return;
    }
    file.text().then(t => setFileText(t));
  }, [t]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  /** Bilder eines Anki-Pakets einmal je Datei hochladen; Name → Speicherpfad. */
  const uploadApkgImages = async (pkg: AnkiPackage): Promise<{ paths: Map<string, string>; failed: number }> => {
    const names = [...new Set(pkg.cards.flatMap(c => [c.frontImage, c.backImage]).filter((n): n is string => !!n))];
    const paths = new Map<string, string>();
    let failed = 0;
    if (!names.length || !userId) return { paths, failed: userId ? 0 : names.length };
    let done = 0;
    setImageProgress({ done, total: names.length });
    let stop = false;
    const queue = [...names];
    const worker = async () => {
      while (queue.length && !stop) {
        const name = queue.shift()!;
        const data = pkg.getMedia(name);
        const type = imageMimeFor(name);
        if (data && type) {
          try {
            const file = new File([data], name, { type });
            paths.set(name, await uploadCardImage(userId, `anki${Date.now().toString(36)}`, file));
          } catch (e) {
            failed++;
            // Ohne eingerichteten Bildspeicher sind alle weiteren Versuche zwecklos.
            if (e instanceof CardImageError && e.code === 'not-set-up') stop = true;
          }
        } else failed++;
        done++;
        setImageProgress({ done, total: names.length });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    if (stop) failed = names.length - paths.size;
    return { paths, failed };
  };

  const handleImport = async () => {
    if (!parsed.length || imageProgress) return;
    let paths = new Map<string, string>();
    if (tab === 'file' && apkg) {
      const res = await uploadApkgImages(apkg);
      paths = res.paths;
      if (res.failed > 0) toast.info(tp('aim.apkg.imagesFailed', res.failed));
    }
    const cards: Flashcard[] = parsed.map(c => {
      const mapped = c as { front: string; back: string; tags?: string[]; frontImage?: string; backImage?: string };
      const frontImage = mapped.frontImage ? paths.get(mapped.frontImage) : undefined;
      const backImage = mapped.backImage ? paths.get(mapped.backImage) : undefined;
      return {
        id: Math.random().toString(36).substr(2, 9),
        front: mapped.front,
        back: mapped.back,
        ...(mapped.tags?.length ? { tags: mapped.tags } : {}),
        ...(frontImage ? { frontImage } : {}),
        ...(backImage ? { backImage } : {}),
        level: 0,
        nextReview: Date.now(),
        lastInterval: 0,
        srs: createSrsState(),
      };
    });
    onImport(
      cards,
      targetDeckId === '__new__' ? null : targetDeckId,
      targetDeckId === '__new__' ? newDeckName.trim() || t('aim.importedDeck') : undefined
    );
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => onClose()}
    >
      <div
        {...dialogProps}
        className="bg-white dark:bg-slate-900 rounded-[24px] w-full max-w-lg shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 id={titleId} className="text-xl font-black dark:text-white">{t('aim.title')}</h2>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">{t('aim.subtitle')}</p>
          </div>
          <ModalCloseButton onClick={onClose} label={t('upl.close')} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl" />
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Tab switcher */}
          <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl">
            {(['paste', 'file'] as const).map(tab2 => (
              <button
                key={tab2}
                onClick={() => setTab(tab2)}
                className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${tab === tab2 ? 'bg-white dark:bg-slate-900 shadow' : 'text-slate-400 hover:text-slate-600'}`}
                style={tab === tab2 ? { color: 'var(--primary-ink)' } : {}}
              >
                {tab2 === 'paste' ? t('aim.pasteText') : t('aim.uploadFile')}
              </button>
            ))}
          </div>

          {/* Input area */}
          {tab === 'paste' ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400">{t('aim.oneCardPerLine')}</p>
              <textarea
                ref={pasteRef}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={"Apoptose\tProgrammierter Zelltod\nSynapse\tVerbindung zwischen zwei Neuronen"}
                rows={6}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm font-mono outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white resize-none"
              />
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => document.getElementById('anki-file-input')?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <input
                id="anki-file-input"
                type="file"
                accept=".csv,.tsv,.txt,.apkg,.colpkg"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <p className="text-2xl mb-2">📂</p>
              {fileName ? (
                <>
                  <p className="font-black dark:text-white text-sm">{fileName}</p>
                  {apkgBusy && <p className="text-xs text-slate-400 mt-1 font-semibold">{t('aim.apkg.reading')}</p>}
                  {apkgError && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-semibold">{apkgError}</p>}
                  {apkg && (
                    <p className="text-xs text-slate-400 mt-1 font-semibold">
                      {tp('aim.apkg.imagesN', new Set(apkg.cards.flatMap(c => [c.frontImage, c.backImage]).filter(Boolean)).size)}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-black dark:text-white text-sm">{t('aim.dropCsv')}</p>
                  <p className="text-xs text-slate-400 mt-1 font-semibold">{t('aim.orClick')}</p>
                </>
              )}
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400">
                {tp('aim.previewN', parsed.length)}
                {skipped > 0 && <span className="text-amber-500 ml-2">{t('aim.skippedN', { n: skipped })}</span>}
              </p>
              <div className="space-y-1.5">
                {preview.map((c, i) => (
                  <div key={i} className="flex gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs">
                    <span className="font-black dark:text-white shrink-0 break-words max-w-[45%]">
                      {c.front || (('frontImage' in c && c.frontImage) ? t('aim.apkg.imageOnly') : '')}
                      {'frontImage' in c && c.frontImage && c.front && <span className="ml-1 text-slate-400 font-semibold">{t('aim.apkg.withImage')}</span>}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">→</span>
                    <span className="text-slate-500 dark:text-slate-400 break-words">{c.back}</span>
                  </div>
                ))}
                {parsed.length > 5 && (
                  <p className="text-[11px] text-slate-400 text-center">{t('sdp.moreCards', { n: parsed.length - 5 })}</p>
                )}
              </div>
            </div>
          )}

          {/* Target deck */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('aim.targetDeck')}</p>
            <select
              value={targetDeckId}
              onChange={e => setTargetDeckId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm font-medium outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white"
            >
              <option value="__new__">{t('aim.createNewDeck')}</option>
              {decks.map(d => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
            {targetDeckId === '__new__' && (
              <input
                type="text"
                value={newDeckName}
                onChange={e => setNewDeckName(e.target.value)}
                placeholder={t('aim.newDeckNamePlaceholder')}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm font-medium outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white"
              />
            )}
          </div>

          {/* CTA */}
          <button
            onClick={handleImport}
            disabled={!parsed.length || !!imageProgress || apkgBusy}
            className="w-full py-4 rounded-2xl text-[13px] font-semibold shadow-lg hover:scale-[1.02] transition-all disabled:opacity-40 disabled:scale-100"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {imageProgress
              ? t('aim.apkg.uploading', { done: imageProgress.done, total: imageProgress.total })
              : parsed.length
                ? tp('aim.importN', parsed.length)
                : t('aim.noCardsDetected')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
