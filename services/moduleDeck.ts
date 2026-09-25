import type { ProcessedDocument } from '../types';

/**
 * Ganzes Fach als Karteikarten (angelehnt an Retain Cards): alle Dokumente
 * eines Fachs abschnittsweise, damit die Karten den ganzen Stoff abdecken und
 * nicht nur die auffälligsten Themen. Reine Planung, ohne KI-Aufrufe.
 */
export type ModuleLevel = 'overview' | 'standard' | 'thorough';

/**
 * Karten je 1 000 Zeichen Text, Mindestkarten je Abschnitt, Obergrenze je
 * Dokument. Die Raten gelten für verdichteten Text (Zusammenfassung); für den
 * vollen PDF-Text gilt FULLTEXT_FACTOR, sonst entstünden bei Lehrbüchern
 * mehrere Karten pro Seite.
 */
export const LEVELS: Record<ModuleLevel, { perKChars: number; perPage: number; minPerChunk: number; maxPerDoc: number }> = {
  overview: { perKChars: 0.5, perPage: 0.25, minPerChunk: 1, maxPerDoc: 150 },
  standard: { perKChars: 1.0, perPage: 0.5, minPerChunk: 2, maxPerDoc: 300 },
  thorough: { perKChars: 1.8, perPage: 1, minPerChunk: 3, maxPerDoc: 600 },
};
/** Ausgelesener PDF-Volltext und Zahl der Seiten mit Text. */
export interface FullText { text: string; pages: number }

/** Voller PDF-Text ist weniger dicht als eine Zusammenfassung (gründlich: etwa 2 Karten je Buchseite). */
export const FULLTEXT_FACTOR = 0.45;
/** Obergrenze für ein ganzes Fach (Budget und Bedienbarkeit). */
export const MAX_MODULE_CARDS = 1000;
/** Abschnittsgröße pro KI-Aufruf; lange Abschnitte werden geteilt. */
export const CHUNK_CHARS = 6000;
/** Höchstens so viele Karten pro KI-Aufruf, darüber wird es ungenau. */
const MAX_PER_CALL = 25;
/** Abschnitte mit weniger Karten werden mit dem nächsten zusammengelegt (spart Anfragen). */
const MIN_PER_CALL = 5;
/** Obergrenze für zusammengelegte Abschnitte. */
const MAX_MERGED_CHARS = 20000;

export interface PlannedChunk { text: string; count: number }
export interface PlannedDoc { doc: ProcessedDocument; chunks: PlannedChunk[]; cards: number; fullText: boolean }
export interface ModulePlan { docs: PlannedDoc[]; skipped: ProcessedDocument[]; totalCards: number; calls: number }

/** Text, mit dem die Karten entstehen: Zusammenfassung, sonst der Text selbst (Text/Word). */
export const docStudyText = (doc: ProcessedDocument): string | null => {
  if (doc.digestStatus === 'ready' && doc.digestText?.trim()) return doc.digestText;
  if ((doc.type === 'text' || doc.type === 'docx') && doc.content?.trim()) return doc.content;
  return null;
};

/** In Abschnitte an Überschriften teilen, kleine zusammenfassen, zu große an Absätzen teilen. */
export const splitSections = (text: string, max = CHUNK_CHARS): string[] => {
  const parts = text.split(/\n(?=#{1,6}\s)/).map(s => s.trim()).filter(Boolean);
  const pieces: string[] = [];
  for (const p of parts) {
    if (p.length <= max) { pieces.push(p); continue; }
    let buf = '';
    for (const para of p.split(/\n{2,}/)) {
      if (buf && buf.length + para.length + 2 > max) { pieces.push(buf); buf = ''; }
      // Einzelner Riesenabsatz: hart teilen
      if (para.length > max) { for (let i = 0; i < para.length; i += max) pieces.push(para.slice(i, i + max)); continue; }
      buf = buf ? `${buf}\n\n${para}` : para;
    }
    if (buf) pieces.push(buf);
  }
  const merged: string[] = [];
  for (const p of pieces) {
    const last = merged[merged.length - 1];
    if (last && last.length + p.length + 2 <= max) merged[merged.length - 1] = `${last}\n\n${p}`;
    else merged.push(p);
  }
  return merged;
};

/**
 * fullTexts: ausgelesener Volltext je Dokument-ID (PDFs). Ist er da, werden
 * die Karten aus dem ganzen Dokument erzeugt statt aus der Zusammenfassung.
 */
/**
 * Kartenzahlen der Abschnitte anteilig auf eine Summe bringen, exakt
 * (kumulativ gerundet). Abschnitte, die dabei 0 Karten bekämen, werden mit
 * dem vorigen zusammengelegt, damit kein Stoff wegfällt.
 */
export const fitChunks = (chunks: PlannedChunk[], total: number): PlannedChunk[] => {
  const sum = chunks.reduce((s, c) => s + c.count, 0);
  if (!sum || sum === total) return chunks;
  const f = total / sum;
  let cum = 0;
  const out: PlannedChunk[] = [];
  for (const c of chunks) {
    const before = Math.round(cum * f);
    cum += c.count;
    const count = Math.min(MAX_PER_CALL, Math.round(cum * f) - before);
    const last = out[out.length - 1];
    // Ein führender Abschnitt mit 0 Karten bekommt 1; die Überschreitung um eine Karte ist hinnehmbar.
    if (count > 0 || !last) out.push({ text: c.text, count: Math.max(count, 1) });
    else last.text = `${last.text}\n\n${c.text}`;
  }
  return out;
};

/** Auf eine Obergrenze kürzen (unverändert, wenn darunter). */
export const scaleChunks = (chunks: PlannedChunk[], max: number): PlannedChunk[] =>
  chunks.reduce((s, c) => s + c.count, 0) <= max ? chunks : fitChunks(chunks, max);

/** Benachbarte Abschnitte mit wenigen Karten zusammenlegen, bis eine Anfrage sich lohnt. */
export const mergeSmallChunks = (chunks: PlannedChunk[]): PlannedChunk[] => {
  const out: PlannedChunk[] = [];
  for (const c of chunks) {
    const last = out[out.length - 1];
    if (last && last.count < MIN_PER_CALL && last.count + c.count <= MAX_PER_CALL && last.text.length + c.text.length <= MAX_MERGED_CHARS) {
      out[out.length - 1] = { text: `${last.text}\n\n${c.text}`, count: last.count + c.count };
    } else out.push({ ...c });
  }
  return out;
};

export const planModule = (docs: ProcessedDocument[], level: ModuleLevel, fullTexts?: ReadonlyMap<string, FullText>): ModulePlan => {
  const cfg = LEVELS[level];
  const planned: PlannedDoc[] = [];
  const skipped: ProcessedDocument[] = [];
  for (const doc of [...docs].sort((a, b) => a.uploadDate - b.uploadDate)) {
    const ft = fullTexts?.get(doc.id);
    const full = ft?.text.trim() || null;
    const text = full ?? docStudyText(doc);
    if (!text) { skipped.push(doc); continue; }
    const rate = cfg.perKChars * (full ? FULLTEXT_FACTOR : 1);
    let chunks = splitSections(text).map(t => ({
      text: t,
      count: Math.min(MAX_PER_CALL, Math.max(cfg.minPerChunk, Math.round((t.length / 1000) * rate))),
    }));
    // Folien haben wenig Text je Seite: mindestens perPage Karten je Seite
    const byPages = full && ft ? Math.round(ft.pages * cfg.perPage) : 0;
    if (byPages > chunks.reduce((s, c) => s + c.count, 0)) chunks = fitChunks(chunks, byPages);
    // Obergrenze je Dokument anteilig auf die Abschnitte verteilen
    chunks = scaleChunks(chunks, cfg.maxPerDoc);
    chunks = mergeSmallChunks(chunks);
    planned.push({ doc, chunks, cards: chunks.reduce((s, c) => s + c.count, 0), fullText: !!full });
  }
  // Obergrenze fürs Fach: gleichmäßig kürzen
  let total = planned.reduce((s, d) => s + d.cards, 0);
  if (total > MAX_MODULE_CARDS) {
    const f = MAX_MODULE_CARDS / total;
    for (const d of planned) {
      d.chunks = mergeSmallChunks(scaleChunks(d.chunks, Math.max(1, Math.floor(d.cards * f))));
      d.cards = d.chunks.reduce((s, c) => s + c.count, 0);
    }
    total = planned.reduce((s, d) => s + d.cards, 0);
  }
  return { docs: planned, skipped, totalCards: total, calls: planned.reduce((s, d) => s + d.chunks.length, 0) };
};

/**
 * Neue Karten pro Tag, damit bis zur Klausur jede Karte einmal gelernt ist und
 * davor noch Tage nur zum Wiederholen bleiben.
 */
export const suggestNewPerDay = (newCards: number, examDate: string, now: number = Date.now(), bufferDays = 3): { perDay: number; days: number } | null => {
  const exam = new Date(`${examDate}T00:00:00`).getTime();
  if (!Number.isFinite(exam) || newCards <= 0) return null;
  const daysLeft = Math.floor((exam - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  if (daysLeft <= 0) return null;
  const days = Math.max(1, daysLeft - Math.min(bufferDays, Math.floor(daysLeft / 3)));
  return { perDay: Math.ceil(newCards / days), days };
};

/** Schlagwort für ein Dokument: Name ohne Endung, gekürzt. */
export const docTag = (doc: ProcessedDocument): string =>
  (doc.name.replace(/\.[a-z0-9]{2,5}$/i, '').trim() || 'Dokument').slice(0, 30);
