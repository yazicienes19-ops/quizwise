import React, { useState, useMemo, useCallback } from 'react';
import { Flashcard, FlashcardDeck } from '../types';
import { createSrsState } from '../services/spacedRepetition';

interface AnkiImportModalProps {
  decks: FlashcardDeck[];
  onClose: () => void;
  onImport: (cards: Flashcard[], targetDeckId: string | null, newDeckName?: string) => void;
}

function detectSeparator(line: string): '\t' | ';' | ',' {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  return ',';
}

function parseLines(text: string): { front: string; back: string }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = detectSeparator(lines[0]);
  return lines
    .map(line => {
      const idx = line.indexOf(sep);
      if (idx === -1) return null;
      const front = line.slice(0, idx).trim().replace(/^["']|["']$/g, '');
      const back = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      return front && back ? { front, back } : null;
    })
    .filter((c): c is { front: string; back: string } => c !== null);
}

export const AnkiImportModal: React.FC<AnkiImportModalProps> = ({ decks, onClose, onImport }) => {
  const [tab, setTab] = useState<'paste' | 'file'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [fileText, setFileText] = useState('');
  const [targetDeckId, setTargetDeckId] = useState<string>('__new__');
  const [newDeckName, setNewDeckName] = useState('Importiertes Deck');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  const rawText = tab === 'paste' ? pasteText : fileText;

  const parsed = useMemo(() => parseLines(rawText), [rawText]);
  const preview = parsed.slice(0, 5);
  const skipped = useMemo(() => {
    if (!rawText.trim()) return 0;
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.length - parsed.length;
  }, [rawText, parsed]);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    file.text().then(t => setFileText(t));
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = () => {
    if (!parsed.length) return;
    const cards: Flashcard[] = parsed.map(c => ({
      id: Math.random().toString(36).substr(2, 9),
      front: c.front,
      back: c.back,
      level: 0,
      nextReview: Date.now(),
      lastInterval: 0,
      srs: createSrsState(),
    }));
    onImport(
      cards,
      targetDeckId === '__new__' ? null : targetDeckId,
      targetDeckId === '__new__' ? newDeckName.trim() || 'Importiertes Deck' : undefined
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => onClose()}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-lg shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-black dark:text-white">Karten importieren</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Anki · Quizlet · CSV · TSV</p>
          </div>
          <button aria-label="Schließen" onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Tab switcher */}
          <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl">
            {(['paste', 'file'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-white dark:bg-slate-900 shadow' : 'text-slate-400 hover:text-slate-600'}`}
                style={tab === t ? { color: 'var(--primary)' } : {}}
              >
                {t === 'paste' ? 'Text einfügen' : 'Datei hochladen'}
              </button>
            ))}
          </div>

          {/* Input area */}
          {tab === 'paste' ? (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Eine Karte pro Zeile: Begriff [Tab/;/,] Definition</p>
              <textarea
                autoFocus
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
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <p className="text-2xl mb-2">📂</p>
              {fileName ? (
                <p className="font-black dark:text-white text-sm">{fileName}</p>
              ) : (
                <>
                  <p className="font-black dark:text-white text-sm">CSV / TSV hierher ziehen</p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">oder klicken zum Auswählen</p>
                </>
              )}
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Vorschau — {parsed.length} Karte{parsed.length !== 1 ? 'n' : ''} erkannt
                {skipped > 0 && <span className="text-amber-500 ml-2">· {skipped} übersprungen</span>}
              </p>
              <div className="space-y-1.5">
                {preview.map((c, i) => (
                  <div key={i} className="flex gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs">
                    <span className="font-black dark:text-white shrink-0 truncate max-w-[45%]">{c.front}</span>
                    <span className="text-slate-300 dark:text-slate-600">→</span>
                    <span className="text-slate-500 dark:text-slate-400 truncate">{c.back}</span>
                  </div>
                ))}
                {parsed.length > 5 && (
                  <p className="text-[9px] text-slate-400 text-center">+{parsed.length - 5} weitere Karten</p>
                )}
              </div>
            </div>
          )}

          {/* Target deck */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ziel-Stapel</p>
            <select
              value={targetDeckId}
              onChange={e => setTargetDeckId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm font-medium outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white"
            >
              <option value="__new__">+ Neuen Stapel erstellen</option>
              {decks.map(d => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
            {targetDeckId === '__new__' && (
              <input
                type="text"
                value={newDeckName}
                onChange={e => setNewDeckName(e.target.value)}
                placeholder="Name des neuen Stapels"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm font-medium outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white"
              />
            )}
          </div>

          {/* CTA */}
          <button
            onClick={handleImport}
            disabled={!parsed.length}
            className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] transition-all disabled:opacity-40 disabled:scale-100"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {parsed.length
              ? `${parsed.length} Karte${parsed.length !== 1 ? 'n' : ''} importieren`
              : 'Noch keine Karten erkannt'}
          </button>
        </div>
      </div>
    </div>
  );
};
