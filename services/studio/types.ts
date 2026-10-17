/**
 * Lernstudio v2 (Phase 1, 16.10.2026): Typen der mehrstufigen Pipeline.
 * Extraktion je Quelle (Einheiten) → Duplikate + Gliederung → Schreiben je
 * Kapitel → Prüfen → Reparatur. Ergebnis sind strukturierte Blöcke statt
 * Markdown (formatVersion 2); alte Markdown-Einträge rendern weiter.
 */

/** Fußnote: Dokument-ID und 1-basierte Seite; 0 = Quelle ohne Seiten (Text, Digest). */
export type Cite = { sourceId: string; page: number };
export type Origin = 'quelle' | 'ki';

/** leitfrage, bruecke: nur im Skript (Phase 2). */
export type CalloutVariant = 'merksatz' | 'klausurfalle' | 'hinweis' | 'beispiel' | 'einordnung' | 'leitfrage' | 'bruecke';

/** Format des Ergebnisses: Zusammenfassung (wiederholen) oder Skript (verstehen). */
export type StudioOutputFormat = 'zusammenfassung' | 'skript' | 'leitfaden' | 'glossar' | 'faq';

/** unitIds: Einheiten, aus denen der Block stammt (für die Abdeckung je Abschnitt; nicht angezeigt). */
export type Block = { id: string; origin: Origin; cites: Cite[]; unitIds?: string[] } & (
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: { text: string; cites: Cite[] }[] }
  | { type: 'table'; caption?: string; headers: string[]; rows: string[][]; rowCites?: Cite[][]; /** Zeilen mit falscher Zellenzahl (vom Modell), vor dem Auffüllen. */ shapeError?: string }
  | { type: 'callout'; variant: CalloutVariant; text: string }
  | { type: 'study'; authors: string; year?: number; design: string; result: string; conclusion: string }
  | { type: 'figure'; sourceId: string; page: number; imageRef: string; caption: string; title?: string }
  | { type: 'timeline'; items: { year: number; who: string; what: string; cites: Cite[] }[] }
  | { type: 'tasks'; items: { text: string; cites: Cite[] }[] }
  // answerOrigin 'ki': Antwort vom Modell geschrieben (Folie ohne Lösung), als Erklärhilfe markiert.
  | { type: 'check'; question: string; answer: string; answerOrigin?: 'ki' }
);

export type BlockType = Block['type'];

export interface LernstudioResult {
  formatVersion: 2;
  format: 'zusammenfassung' | 'skript' | string;
  blocks: Block[];
  /** part: ausgelassene Vorlesung innerhalb einer zusammengefügten PDF. */
  omittedSources: { sourceId: string; reason: string; part?: SourcePart }[];
  warnings: string[];
  /** outputWords: alles; mainWords: nur der Haupttext (Kapitel), daran misst sich die Länge (Entscheidung 16.10.2026). */
  stats: { sourceWords: number; outputWords: number; mainWords?: number };
  /** Kapitel, die trotz neuer Versuche unvollständig blieben (Titel). Fehlt bei Ergebnissen vor Phase 1.1. */
  incompleteChapters?: string[];
  /** Protokoll je Kapitel: Einheiten → Blöcke → verworfen → Versuche (Fehlersuche, Eval). */
  diagnostics?: ChapterDiagnostic[];
}

export interface ChapterDiagnostic {
  title: string;
  units: number;
  blocks: number;
  dropped: { type: string; reason: string }[];
  attempts: number;
  /** Abgebrochene Antworten (Schleife erkannt, ungültiges JSON, Token-Limit). */
  aborts: string[];
  /** Neu geschrieben, Abschnitt für Abschnitt. */
  split: boolean;
  /** Abdeckung der inhaltlichen Einheiten (0 bis 1). */
  coverage: number;
}

/** Vorlesung in einer zusammengefügten PDF (Gliederungseintrag), Seiten 1-basiert. */
export interface SourcePart { title: string; from: number; to: number }

export type UnitType =
  | 'definition' | 'concept' | 'study' | 'finding' | 'example' | 'list' | 'comparison'
  | 'task' | 'practice_question' | 'exam_info' | 'organizational' | 'figure' | 'source_error';

export const UNIT_TYPES: UnitType[] = [
  'definition', 'concept', 'study', 'finding', 'example', 'list', 'comparison',
  'task', 'practice_question', 'exam_info', 'organizational', 'figure', 'source_error',
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
  /** Beispiel mit ausgedachten Werten (Szenario, Rechenbeispiel, Illustration): nie ein Studienergebnis. */
  illustrative?: boolean;
  /** Übungsfrage: die Antwort, falls sie auf der Folie steht. */
  answer?: string;
  /** Prüfungsrelevant: Inhalt taucht auf einer Wiederholungs- oder Quizfolie wieder auf (setzt der Code). */
  priority?: boolean;
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
  /** Zusammengefügte PDF: die einzelnen Vorlesungen (Abdeckung je Vorlesung, Fußnote mit Folie). */
  parts?: SourcePart[];
  /** Seitenbild als JPEG (base64), für Extraktion und Prüfung von Folienfehlern am Bild. */
  renderPage?: (page: number) => Promise<string | null>;
  /** all: jede Seite mit Bild; selective: nur Seiten, bei denen der Text nicht reicht (extract.pageNeedsImage). */
  imagePolicy?: 'all' | 'selective';
}

export interface Issue {
  rule: 'cites' | 'coverage' | 'length' | 'numbers' | 'author_year' | 'truncated' | 'cite_density' | 'ki_facts'
    | 'empty_heading' | 'section_coverage' | 'study_incomplete'
    | 'merksatz' | 'source_error_hint' | 'illustrative_result' | 'repetition' | 'priority_missing' | 'table_shape' | 'illustrative_label' | 'meta' | 'guide_structure' | 'result_missing' | 'faq_coverage'
    | 'script_structure'
    | 'nicht_belegt' | 'falsch' | 'chronologie' | 'zitat_falsch' | 'ki_fakt';
  blockId?: string;
  sourceId?: string;
  /** Abdeckung einer Vorlesung in einer zusammengefügten PDF: ihr Seitenbereich. */
  part?: SourcePart;
  message: string;
  fix?: string;
}

export type PipelineStep = 'read' | 'outline' | 'write' | 'check';
export interface PipelineProgress { step: PipelineStep; done: number; total: number }
