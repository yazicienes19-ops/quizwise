import type { ProcessedDocument } from '../types';

// ── Lokaler Dokumenten-Cache (Key: studearc_docs) ────────────────────────────
// localStorage ist ein BEGRENZTER Speicher (~5 MB) — historisch landeten hier
// vollständige Bild-Base64-Payloads (ein einzelnes 8-MB-Foto → ~11 MB Base64,
// allein damit war das Quota gesprengt) und unbegrenzt viele Skript-Volltexte.
// Folge: QuotaExceededError riss Upload UND State-Update mit (Feature-Audit
// 2026-08-22, Punkt "localStorage-Quota").
//
// Ursachenbehebung statt Fehlerfang — der Cache hat drei feste Regeln:
//   1. Binärdaten mit Cloud-Kopie werden NIEMALS persistiert. PDF/Bild liegen
//      in Supabase Storage (storagePath) und werden bei Bedarf per
//      downloadPdfAsBase64 nachgeladen — Base64 im Cache wäre reine Redundanz.
//      Betrifft auch Alt-Bestand: überdimensionierte Legacy-Docs werden beim
//      ersten Lesen oder Schreiben automatisch bereinigt ("Self-Healing").
//   2. Text-Inhalte (text/docx) teilen sich ein Zeichen-Budget; überschreitet
//      der Bestand es, wird der Inhalt der ältesten Dokumente verworfen (LRU
//      nach uploadDate) — Metadaten/Digest bleiben immer erhalten. Eingeloggte
//      Nutzer bekommen die Volltexte beim nächsten Cloud-Lauf ohnehin zurück
//      (loadDocumentsFromSupabase liefert content_text).
//   3. persistDocs() wirft NIEMALS: sinkt selbst die Restschrift unter das
//      Quota, wird stufenlos weiter abgebaut (erst Inhalte, dann ganz ohne
//      Texte); scheitert selbst das, bleibt der Stand im Speicher (RAM) und
//      wird nur protokolliert. Ein Crash der App ist ausgeschlossen.

const DOCS_KEY = 'studearc_docs';

/**
 * Zeichen-Budget für text/docx-Inhalte im lokalen Cache (~2,4 MB als UTF-16).
 * Bewusst großzügig gegenüber dem typ. 5-MB-Limit, damit Meta-/Digest-Daten
 * und die übrigen App-Keys Luft behalten.
 */
export const CACHE_TEXT_BUDGET_CHARS = 1_200_000;

/** Ein text/docx-Dokument, dessen Inhalt aus dem Cache evicted wurde. */
function withoutContent(doc: ProcessedDocument): ProcessedDocument {
  return doc.content === '' ? doc : { ...doc, content: '' };
}

/**
 * Regel 1+2: erzeugt die cache-fähige Ansicht eines Dokumentbestands.
 * - PDF/Bild MIT storagePath: Inhalt verworfen (liegt sicher in Storage).
 * - PDF/Bild OHNE storagePath (historische Nur-lokal-Docs): Inhalt BLEIBT —
 *   er ist dann die einzige Kopie (getDocumentSource-Fallback).
 * - text/docx: Inhalt bleibt, solange das Gesamtbudget reicht; sonst wird
 *   nach uploadDate (älteste zuerst) evicted. digestText bleibt unberührt.
 *
 * Rückgabe: { docs: Cache-Ansicht, changed: boolean } — changed=true bedeutet,
 * dass sich gegenüber dem Eingabe-Stand etwas entfernen ließ (Legacy-Heilung
 * oder Budget-Eviction) und der Aufrufer den bereinigten Stand übernehmen/
 * zurückschreiben sollte.
 */
export function sanitizeForCache(
  docs: ProcessedDocument[],
  budgetChars: number = CACHE_TEXT_BUDGET_CHARS,
): { docs: ProcessedDocument[]; changed: boolean } {
  let changed = false;

  // Regel 1: redundante Binär-Payloads entfernen.
  const stripped = docs.map(doc => {
    if ((doc.type === 'pdf' || doc.type === 'image') && doc.storagePath && doc.content !== '') {
      changed = true;
      return { ...doc, content: '' };
    }
    return doc;
  });

  // Regel 2: Text-Budget einhalten (LRU nach uploadDate, älteste zuerst).
  const totalText = stripped.reduce(
    (sum, d) => sum + ((d.type === 'text' || d.type === 'docx') ? d.content.length : 0),
    0,
  );
  if (totalText > budgetChars) {
    let overflow = totalText - budgetChars;
    const byOldest = stripped
      .map((doc, index) => ({ doc, index }))
      .filter(({ doc }) => doc.type === 'text' || doc.type === 'docx')
      .sort((a, b) =>
        a.doc.uploadDate - b.doc.uploadDate || a.index - b.index,
      );
    const evict = new Set<number>();
    for (const { doc, index } of byOldest) {
      if (overflow <= 0) break;
      overflow -= doc.content.length;
      evict.add(index);
    }
    changed = true;
    return {
      docs: stripped.map((doc, i) => (evict.has(i) ? withoutContent(doc) : doc)),
      changed,
    };
  }

  return { docs: stripped, changed };
}

/** Stufe 2 des Abbaus: ALLE Text-Inhalte verwerfen, nur Struktur/Meta halten. */
function stripAllContents(docs: ProcessedDocument[]): ProcessedDocument[] {
  return docs.map(doc =>
    (doc.type === 'text' || doc.type === 'docx') ? withoutContent(doc) : doc,
  );
}

function writeThrough(docs: ProcessedDocument[]): void {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  } catch {
    // Quota (oder SecurityError im Privatmodus): weiter abbauen statt werfen.
    try {
      localStorage.setItem(DOCS_KEY, JSON.stringify(stripAllContents(docs)));
    } catch (finalErr) {
      // Selbst Metadaten passen nicht mehr (fremde Keys füllen den Speicher):
      // bewusst schlucken — der In-Memory-State läuft weiter, nichts crasht.
      console.warn('[docLocalCache] localStorage-Speicher voll — Cache übersprungen.', finalErr);
    }
  }
}

/**
 * Dokumentbestand persistent machen. Wirft nie; baut bei Quota-Druck stufenlos
 * ab (Budget-Eviction → alle Textinhalte → Verzicht auf Schreiben).
 */
export function persistDocs(docs: ProcessedDocument[]): void {
  const { docs: cacheView } = sanitizeForCache(docs);
  writeThrough(cacheView);
}

/**
 * Gesicherten Lesepfad: korruptes/fehlerndes JSON wird zu einem leeren
 * Bestand (statt White-Screen beim Start), Alt-Bestand wird beim Lesen
 * direkt geheilt und — falls dabei etwas entfernt wurde — sofort neu
 * geschrieben, damit der Platz frei wird, bevor irgendetwas Neues landet.
 */
export function loadCachedDocs(): ProcessedDocument[] {
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(DOCS_KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const { docs, changed } = sanitizeForCache(parsed as ProcessedDocument[]);
  if (changed) {
    try { localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); } catch { /* Quota — ignorieren */ }
  }
  return docs;
}
