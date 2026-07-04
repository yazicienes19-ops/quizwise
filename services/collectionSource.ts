import type { Collection, ProcessedDocument } from '../types';
import type { GenerationSource } from './geminiService';
import { documentDisplayName } from './libraryService';

/**
 * collectionSource — macht einen ganzen Ordner (Collection) zur Wissensbasis.
 *
 * Alle lesbaren Inhalte des Ordners (Digests von PDFs/Bildern, Volltexte von
 * Notizen) werden mit Quellen-Labels zu EINER GenerationSource kombiniert.
 * Die Generierung soll Informationen quellenübergreifend verbinden — Folie,
 * Tafelfoto, eigene Notiz und Altklausur zählen gemeinsam.
 */

export interface CollectionSourceResult {
  source: GenerationSource;
  /** Anzeigename, z.B. „Ordner: Sozialpsychologie" */
  name: string;
  /** Quellen, die in die Wissensbasis eingeflossen sind */
  includedCount: number;
  /** Quellen ohne lesbaren Text (Digest läuft noch oder fehlgeschlagen) */
  pendingCount: number;
}

/** Grobe Obergrenze, damit große Ordner den Kontext nicht sprengen. */
const MAX_TOTAL_CHARS = 80_000;

/** Lesbarer Text eines Dokuments: Digest (kompakt, auch für PDFs/Fotos) vor Volltext. */
const readableText = (d: ProcessedDocument): string | null => {
  if (d.digestText && d.digestStatus === 'ready') return d.digestText;
  if ((d.type === 'text' || d.type === 'docx') && d.content) return d.content;
  return null;
};

export const collectionDocs = (collection: Collection, documents: ProcessedDocument[]): ProcessedDocument[] =>
  documents.filter(d => d.collectionId === collection.id);

export const buildCollectionSource = (
  collection: Collection,
  documents: ProcessedDocument[],
): CollectionSourceResult | null => {
  const docs = collectionDocs(collection, documents);
  if (docs.length === 0) return null;

  const parts: string[] = [];
  let includedCount = 0;
  let pendingCount = 0;
  let totalChars = 0;

  for (const d of docs) {
    const text = readableText(d);
    if (!text) { pendingCount += 1; continue; }
    const chunk = `[Quelle: ${documentDisplayName(d)}]\n${text.trim()}`;
    if (totalChars + chunk.length > MAX_TOTAL_CHARS) { pendingCount += 1; continue; }
    parts.push(chunk);
    totalChars += chunk.length;
    includedCount += 1;
  }

  if (includedCount === 0) return { source: { text: '' }, name: `Ordner: ${collection.name}`, includedCount: 0, pendingCount };

  const intro =
    `WISSENSBASIS des Ordners „${collection.name}" (${includedCount} Quellen: z.B. Folien, eigene Notizen, ` +
    `Fotos, Zusammenfassungen, Altklausuren).\n` +
    `Betrachte ALLE folgenden Quellen gemeinsam als eine Lernbasis und kombiniere Informationen ` +
    `quellenübergreifend. Wenn eine Quelle etwas ergänzt (z.B. eine Notiz die Folie), führe beides zusammen. ` +
    `Erfinde nichts, was in keiner Quelle steht.`;

  return {
    source: { text: `${intro}\n\n${parts.join('\n\n---\n\n')}` },
    name: `Ordner: ${collection.name}`,
    includedCount,
    pendingCount,
  };
};
