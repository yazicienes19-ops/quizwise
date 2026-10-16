/**
 * Lernstudio v2 (Phase 1, 16.10.2026): Typen der mehrstufigen Pipeline.
 * Extraktion je Quelle (Einheiten) → Duplikate + Gliederung → Schreiben je
 * Kapitel → Prüfen → Reparatur. Ergebnis sind strukturierte Blöcke statt
 * Markdown (formatVersion 2); alte Markdown-Einträge rendern weiter.
 */

/** Fußnote: Dokument-ID und 1-basierte Seite; 0 = Quelle ohne Seiten (Text, Digest). */
export type Cite = { sourceId: string; page: number };
export type Origin = 'quelle' | 'ki';

export type CalloutVariant = 'merksatz' | 'klausurfalle' | 'hinweis' | 'beispiel' | 'einordnung';

export type Block = { id: string; origin: Origin; cites: Cite[] } & (
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: { text: string; cites: Cite[] }[] }
  | { type: 'table'; caption?: string; headers: string[]; rows: string[][] }
  | { type: 'callout'; variant: CalloutVariant; text: string }
  | { type: 'study'; authors: string; year: number; design: string; result: string; conclusion: string }
  | { type: 'figure'; sourceId: string; page: number; imageRef: string; caption: string; title?: string }
  | { type: 'timeline'; items: { year: number; who: string; what: string; cites: Cite[] }[] }
  | { type: 'tasks'; items: { text: string; cites: Cite[] }[] }
  | { type: 'check'; question: string; answer: string }
);

export type BlockType = Block['type'];

export interface LernstudioResult {
  formatVersion: 2;
  format: 'zusammenfassung' | 'skript' | string;
  blocks: Block[];
  omittedSources: { sourceId: string; reason: string }[];
  warnings: string[];
  stats: { sourceWords: number; outputWords: number };
}

export type UnitType =
  | 'definition' | 'concept' | 'study' | 'finding' | 'example' | 'list' | 'comparison'
  | 'task' | 'exam_info' | 'organizational' | 'figure' | 'source_error';

export const UNIT_TYPES: UnitType[] = [
  'definition', 'concept', 'study', 'finding', 'example', 'list', 'comparison',
  'task', 'exam_info', 'organizational', 'figure', 'source_error',
];

/** Inhaltliche Einheit einer Seite (Ergebnis der Extraktion). */
export interface Unit {
  /** Laufende Kurz-ID im Lauf ("u12"), vergeben nach dem Laden. */
  id: string;
  sourceId: string;
  page: number;
  type: UnitType;
  title?: string;
  text: string;
  study?: { authors?: string; year?: number; design?: string; result?: string; conclusion?: string };
}

/** Eine ausgewählte Quelle, wie die Pipeline sie bekommt. */
export interface PipelineSource {
  docId: string;
  name: string;
  /** Text je Seite (1-basiert über den Index); Seiten außerhalb der Kapitelwahl sind leer. null = ohne Seiten. */
  pages: string[] | null;
  /** Ohne Seiten: lesbarer Text (Digest oder Volltext). */
  plain?: string;
  /** Seiten im Dokument (für die Prüfung der Fußnoten); 0 bei Quellen ohne Seiten. */
  pageCount: number;
  /** Bildbeschreibungen aus dem Abbildungsverzeichnis, je Seite. */
  figures?: { ref: string; page: number; title: string; description: string }[];
}

export interface Issue {
  rule: 'cites' | 'coverage' | 'length' | 'numbers' | 'author_year' | 'truncated' | 'cite_density' | 'ki_facts'
    | 'nicht_belegt' | 'falsch' | 'chronologie' | 'zitat_falsch' | 'ki_fakt';
  blockId?: string;
  sourceId?: string;
  message: string;
  fix?: string;
}

export type PipelineStep = 'read' | 'outline' | 'write' | 'check';
export interface PipelineProgress { step: PipelineStep; done: number; total: number }
