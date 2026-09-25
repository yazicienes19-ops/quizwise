import type { ProcessedDocument } from '../types';

/**
 * Ganzes Fach als Karteikarten (angelehnt an Retain Cards): alle Dokumente
 * eines Fachs abschnittsweise, damit die Karten den ganzen Stoff abdecken und
 * nicht nur die auffälligsten Themen. Reine Planung, ohne KI-Aufrufe.
 */
export type ModuleLevel = 'overview' | 'standard' | 'thorough';

/** Karten je 1 000 Zeichen Text, Mindestkarten je Abschnitt, Obergrenze je Dokument. */
export const LEVELS: Record<ModuleLevel, { perKChars: number; minPerChunk: number; maxPerDoc: number }> = {
  overview: { perKChars: 0.5, minPerChunk: 1, maxPerDoc: 25 },
  standard: { perKChars: 1.0, minPerChunk: 2, maxPerDoc: 60 },
  thorough: { perKChars: 1.8, minPerChunk: 3, maxPerDoc: 120 },
};
/** Obergrenze für ein ganzes Fach (Budget und Bedienbarkeit). */
export const MAX_MODULE_CARDS = 400;
/** Abschnittsgröße pro KI-Aufruf; lange Abschnitte werden geteilt. */
export const CHUNK_CHARS = 6000;
/** Höchstens so viele Karten pro KI-Aufruf, darüber wird es ungenau. */
const MAX_PER_CALL = 25;

export interface PlannedChunk { text: string; count: number }
export interface PlannedDoc { doc: ProcessedDocument; chunks: PlannedChunk[]; cards: number }
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

export const planModule = (docs: ProcessedDocument[], level: ModuleLevel): ModulePlan => {
  const cfg = LEVELS[level];
  const planned: PlannedDoc[] = [];
  const skipped: ProcessedDocument[] = [];
  for (const doc of [...docs].sort((a, b) => a.uploadDate - b.uploadDate)) {
    const text = docStudyText(doc);
    if (!text) { skipped.push(doc); continue; }
    let chunks = splitSections(text).map(t => ({
      text: t,
      count: Math.min(MAX_PER_CALL, Math.max(cfg.minPerChunk, Math.round((t.length / 1000) * cfg.perKChars))),
    }));
    // Obergrenze je Dokument anteilig auf die Abschnitte verteilen
    const sum = chunks.reduce((s, c) => s + c.count, 0);
    if (sum > cfg.maxPerDoc) {
      const f = cfg.maxPerDoc / sum;
      chunks = chunks.map(c => ({ ...c, count: Math.max(1, Math.floor(c.count * f)) }));
    }
    planned.push({ doc, chunks, cards: chunks.reduce((s, c) => s + c.count, 0) });
  }
  // Obergrenze fürs Fach: gleichmäßig kürzen
  let total = planned.reduce((s, d) => s + d.cards, 0);
  if (total > MAX_MODULE_CARDS) {
    const f = MAX_MODULE_CARDS / total;
    for (const d of planned) {
      d.chunks = d.chunks.map(c => ({ ...c, count: Math.max(1, Math.floor(c.count * f)) }));
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
