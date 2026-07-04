
import React, { useEffect, useState } from 'react';
import { ProcessedDocument } from '../types';
import { documentDisplayName } from '../services/libraryService';
import { downloadPdfAsBase64 } from '../services/documentService';

interface DocumentViewerModalProps {
  doc: ProcessedDocument;
  onClose: () => void;
}

const base64ToBlob = (base64: string, mime: string): Blob => {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mime });
};

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ doc, onClose }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(doc.type === 'pdf' || doc.type === 'image');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    const load = async () => {
      if (doc.type !== 'pdf' && doc.type !== 'image') return;
      try {
        let base64: string;
        if (doc.storagePath) {
          base64 = await downloadPdfAsBase64(doc.storagePath);
        } else if (doc.content) {
          base64 = doc.content;
        } else {
          throw new Error('Kein Inhalt verfügbar');
        }
        if (cancelled) return;
        const mime = doc.type === 'pdf' ? 'application/pdf' : (doc.mimeType || 'image/jpeg');
        const blob = base64ToBlob(base64, mime);
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch {
        if (!cancelled) setError('Dokument konnte nicht geladen werden.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const handleDownload = () => {
    if (blobUrl) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.name;
      a.click();
    } else if (doc.content && (doc.type === 'text' || doc.type === 'docx')) {
      const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name.replace(/\.[^/.]+$/, '')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const canDownload = !!blobUrl || ((doc.type === 'text' || doc.type === 'docx') && !!doc.content);

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-[28px] w-full max-w-4xl h-[88vh] shadow-3d-deep overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="min-w-0 flex-1 pr-4">
            <h2 className="text-base font-black dark:text-white truncate">{documentDisplayName(doc)}</h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              {doc.type === 'docx'
                ? 'Extrahierter Text · keine Original-Formatierung'
                : doc.type.toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canDownload && (
              <button
                onClick={handleDownload}
                className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
                title="Herunterladen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
            )}
            <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-rose-500 transition-colors rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-slate-50 dark:bg-slate-950">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && error && (
            <div className="flex items-center justify-center h-full text-sm text-slate-400 px-8 text-center">{error}</div>
          )}

          {!isLoading && !error && doc.type === 'pdf' && blobUrl && (
            <iframe src={blobUrl} className="w-full h-full border-0" title={doc.name} />
          )}

          {!isLoading && !error && doc.type === 'image' && blobUrl && (
            <div className="w-full h-full flex items-center justify-center p-6 overflow-auto">
              <img src={blobUrl} alt={doc.name} className="max-w-full max-h-full rounded-2xl shadow-lg" />
            </div>
          )}

          {(doc.type === 'text' || doc.type === 'docx') && (
            <div className="h-full overflow-y-auto px-8 py-8">
              <div className="max-w-2xl mx-auto">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {doc.content || 'Kein Textinhalt verfügbar.'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
