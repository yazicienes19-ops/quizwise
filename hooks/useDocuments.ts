import { useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { ProcessedDocument, Collection } from '../types';
import type { GenerationSource } from '../services/geminiService';
import {
  loadDocumentsFromSupabase,
  loadCollectionsFromSupabase,
  saveDocumentToSupabase,
  deleteDocumentFromSupabase,
  saveCollectionToSupabase,
  deleteCollectionFromSupabase,
  updateDocumentCollectionInSupabase,
  triggerDocumentAnalysis,
  UploadStalledError,
  UploadTimeoutError,
} from '../services/documentService';
import { toast } from '../services/toast';
import mammoth from 'mammoth';
import heic2any from 'heic2any';

interface UseDocumentsParams {
  user: User | null;
  userPlan: 'free' | 'pro';
  isOffline: boolean;
  setIsLoading: (v: boolean) => void;
  setShowUpgradeModal: (v: boolean) => void;
}

export const useDocuments = ({ user, userPlan, isOffline, setIsLoading, setShowUpgradeModal }: UseDocumentsParams) => {
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  /** Löst Neuladen + Digest-Polling aus (z.B. nach einem Upload). */
  const [refreshTick, setRefreshTick] = useState(0);
  /** Verhindert doppelte Analyse-Trigger für dasselbe Dokument in dieser Session. */
  const triggeredDigestsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('quizwise_docs');
    if (saved) setDocuments(JSON.parse(saved));
    const savedCols = localStorage.getItem('quizwise_collections');
    if (savedCols) setCollections(JSON.parse(savedCols));
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let attempts = 0;

    // PDF/Bild ohne fertigen Lern-Digest = für Ordner-Wissensbasis noch nicht lesbar.
    // 'error' zählt fürs Nachholen (einmal neu versuchen), aber NICHT fürs Polling —
    // sonst pollt die App endlos gegen dauerhaft fehlschlagende Dokumente (z.B. zu groß).
    const needsDigest = (d: ProcessedDocument) =>
      (d.type === 'pdf' || d.type === 'image') && d.digestStatus !== 'ready';
    const digestInFlight = (d: ProcessedDocument) =>
      (d.type === 'pdf' || d.type === 'image') && (d.digestStatus === 'pending' || d.digestStatus === undefined);

    const load = async (isFirst: boolean) => {
      try {
        const cloudDocs = await loadDocumentsFromSupabase();
        if (cancelled) return;

        // Lokale, noch nicht gesyncte Dokumente nicht verwerfen
        setDocuments(prev => {
          const cloudIds = new Set(cloudDocs.map(d => d.id));
          const merged = [...cloudDocs, ...prev.filter(d => !cloudIds.has(d.id))];
          localStorage.setItem('quizwise_docs', JSON.stringify(merged));
          return merged;
        });

        // Nachhol-Lauf: Digest für Dokumente anstoßen, die nie einen bekommen
        // haben oder deren Verarbeitung fehlgeschlagen ist
        if (isFirst) {
          cloudDocs
            .filter(d => needsDigest(d) && d.digestStatus !== 'pending' && !triggeredDigestsRef.current.has(d.id))
            .forEach(d => { triggeredDigestsRef.current.add(d.id); triggerDocumentAnalysis(d.id); });
        }

        // Solange Digests laufen: nachladen, bis alles lesbar ist (max ~5 Min)
        if (cloudDocs.some(digestInFlight) && attempts < 20) {
          attempts += 1;
          setTimeout(() => { if (!cancelled) load(false); }, 15_000);
        }
      } catch {
        if (isFirst && refreshTick === 0) toast.error('Dokumente konnten nicht aus der Cloud geladen werden.');
      }
    };

    load(true);
    loadCollectionsFromSupabase()
      .then(cols => { if (!cancelled) { setCollections(cols); localStorage.setItem('quizwise_collections', JSON.stringify(cols)); } })
      .catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshTick]);

  const saveDocs = (docs: ProcessedDocument[]) => {
    setDocuments(docs);
    localStorage.setItem('quizwise_docs', JSON.stringify(docs));
  };

  const saveCollections = (cols: Collection[]) => {
    setCollections(cols);
    localStorage.setItem('quizwise_collections', JSON.stringify(cols));
  };

  const addCollection = (col: Collection) => {
    saveCollections([...collections, col]);
    if (user) saveCollectionToSupabase(col).catch(() => {});
  };

  const removeCollection = (id: string) => {
    saveCollections(collections.filter(c => c.id !== id));
    if (user) deleteCollectionFromSupabase(id).catch(() => {});
  };

  const updateCollection = (updated: Collection) => {
    saveCollections(collections.map(c => c.id === updated.id ? updated : c));
    if (user) saveCollectionToSupabase(updated).catch(() => {});
  };

  const deleteDoc = (id: string) => {
    const doc = documents.find(d => d.id === id);
    saveDocs(documents.filter(d => d.id !== id));
    if (user && doc) deleteDocumentFromSupabase(doc).catch(() => {});
  };

  const moveDoc = (docId: string, collectionId: string | undefined) => {
    const updated = documents.map(d => d.id === docId ? { ...d, collectionId } : d);
    saveDocs(updated);
    if (user) updateDocumentCollectionInSupabase(docId, collectionId).catch(() => {});
  };

  const getDocumentSource = (doc: ProcessedDocument): GenerationSource => {
    if (doc.digestText && doc.digestStatus === 'ready') return { text: doc.digestText };
    if (doc.type === 'text' || doc.type === 'docx') return { text: doc.content };
    if (doc.type === 'image') {
      const mime = doc.mimeType || 'image/jpeg';
      if (doc.storagePath) return { storagePath: doc.storagePath, mimeType: mime };
      if (doc.content) return { file: { data: doc.content, mimeType: mime } };
      throw new Error('Bild-Inhalt nicht verfügbar.');
    }
    if (doc.storagePath) return { storagePath: doc.storagePath, mimeType: 'application/pdf' };
    if (doc.content) return { file: { data: doc.content, mimeType: 'application/pdf' } };
    throw new Error('PDF-Inhalt nicht verfügbar.');
  };

  const handleFileUpload = async (
    fileInput: File,
    collectionId?: string,
    onProgress?: (fraction: number) => void,
  ): Promise<string | null> => {
    let file = fileInput;
    if (isOffline) { toast.error('Hochladen ist im Offline-Modus nicht möglich.'); return null; }

    const FREE_DOC_LIMIT = 5;
    if (userPlan === 'free' && documents.length >= FREE_DOC_LIMIT) {
      toast.error(`Free-Plan: Maximal ${FREE_DOC_LIMIT} Dokumente. Upgrade auf Pro für unbegrenzte Bibliothek.`);
      setShowUpgradeModal(true);
      return null;
    }

    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum ist 50 MB.`);
      return null;
    }

    if (documents.some(d => d.name === file.name)) {
      toast.info(`"${file.name}" ist bereits in deiner Bibliothek.`);
    }

    setIsLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let content = '';
      let docType: 'pdf' | 'docx' | 'text' | 'image' = 'text';
      let imageMimeType: string | undefined;

      const IMAGE_MIME: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
        heic: 'image/jpeg', heif: 'image/jpeg',
      };

      if (ext === 'heic' || ext === 'heif') {
        try {
          const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }) as Blob;
          file = new File([converted], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
        } catch {
          toast.error('HEIC-Konvertierung fehlgeschlagen. Bitte als JPEG exportieren.');
          return null;
        }
      }

      if (ext === 'pdf') {
        docType = 'pdf';
        if (!user) { toast.error('Zum Speichern von PDFs bitte zuerst anmelden.'); return null; }
      } else if (ext && IMAGE_MIME[ext]) {
        docType = 'image';
        imageMimeType = IMAGE_MIME[ext];
        content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        content = (await mammoth.extractRawText({ arrayBuffer })).value;
        docType = 'docx';
      } else {
        content = await file.text();
        docType = 'text';
      }

      if ((docType === 'text' || docType === 'docx') && content.length > 900_000) {
        toast.error('Dokument sehr groß — nur der erste Teil wird verarbeitet. Für beste Ergebnisse empfehlen wir PDF.');
      }

      const newDoc: ProcessedDocument = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        content,
        type: docType,
        ...(imageMimeType ? { mimeType: imageMimeType } : {}),
        uploadDate: Date.now(),
        collectionId,
      };

      if (docType === 'pdf' || docType === 'image') {
        const storagePath = await saveDocumentToSupabase(newDoc, file, onProgress);
        const savedDoc = { ...newDoc, storagePath: storagePath ?? undefined };
        saveDocs([...documents, savedDoc]);
        if (user && storagePath) {
          triggeredDigestsRef.current.add(newDoc.id);
          triggerDocumentAnalysis(newDoc.id);
          // Polling starten, damit der fertige Digest ohne Reload ankommt
          setRefreshTick(t => t + 1);
        }
      } else {
        saveDocs([...documents, newDoc]);
        if (user) {
          saveDocumentToSupabase(newDoc)
            .then(() => {
              triggeredDigestsRef.current.add(newDoc.id);
              triggerDocumentAnalysis(newDoc.id);
              setRefreshTick(t => t + 1);
            })
            .catch(() => toast.error('Cloud-Sync fehlgeschlagen. Dokument nur lokal gespeichert.'));
        }
      }
      return newDoc.id;
    } catch (e) {
      if (e instanceof UploadStalledError) {
        toast.error(`Verbindung beim Hochladen von "${file.name}" unterbrochen. Bitte erneut versuchen (stabiles WLAN hilft bei großen Dateien).`);
      } else if (e instanceof UploadTimeoutError) {
        toast.error(`Hochladen von "${file.name}" dauert ungewöhnlich lange und wurde abgebrochen. Bitte erneut versuchen.`);
      } else {
        toast.error('Dokument konnte nicht verarbeitet werden.');
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /** Analyse erneut anstoßen (z.B. nach 'error') — Badge springt sofort auf pending, Polling läuft wieder an. */
  const retryAnalysis = (docId: string) => {
    triggeredDigestsRef.current.add(docId);
    triggerDocumentAnalysis(docId);
    setDocuments(prev => {
      const updated = prev.map(d => d.id === docId ? { ...d, digestStatus: 'pending' as const } : d);
      localStorage.setItem('quizwise_docs', JSON.stringify(updated));
      return updated;
    });
    setRefreshTick(t => t + 1);
  };

  return { documents, collections, saveDocs, addCollection, removeCollection, updateCollection, deleteDoc, moveDoc, getDocumentSource, handleFileUpload, retryAnalysis };
};
