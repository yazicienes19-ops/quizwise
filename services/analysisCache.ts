import type { TopicMetric, LearningAnalysis } from '../types';

const CACHE_KEY = 'quizwise_gap_analysis_v2';

export interface CacheFingerprint {
  /** IDs aller in die Analyse eingeflossenen Fehler (aus errorPool). */
  errorIds: string[];
  /** "thema:konfidenz" pro Thema — Themen-Konfidenz-Snapshot. */
  topicSnapshot: string;
  /** Aktiver Dokument-Filter der Seite, oder 'global'. */
  filterScope: string;
}

export const buildTopicSnapshot = (metrics: TopicMetric[]): string =>
  metrics.map(m => `${m.topic}:${m.confidence}`).sort().join(',');

/**
 * Deterministischer Fingerprint über die tatsächlichen Eingabedaten statt einer
 * abgeleiteten Summe (Summen kollidieren: 5 Quiz + 3 Feynman = 4 Quiz + 4 Feynman
 * = 8, obwohl die Datengrundlage komplett verschieden ist). SHA-256 ist für
 * diesen Zweck praktisch kollisionsfrei.
 */
export async function buildCacheKey(fp: CacheFingerprint): Promise<string> {
  const raw = [fp.errorIds.slice().sort().join(','), fp.topicSnapshot, fp.filterScope].join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface CacheEntry {
  key: string;
  analysis: LearningAnalysis;
  computedAt: number;
}

export function loadCachedAnalysis(key: string): LearningAnalysis | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    return entry?.key === key ? entry.analysis : null;
  } catch {
    return null;
  }
}

export function saveCachedAnalysis(key: string, analysis: LearningAnalysis): void {
  try {
    const entry: CacheEntry = { key, analysis, computedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

export function clearCachedAnalysis(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}
