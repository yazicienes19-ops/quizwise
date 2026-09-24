import type { ProcessedDocument } from '../types';

/**
 * Zusammenfassung pro Fach (Audit 23.09.2026): Die Lerndigests lagen nur
 * einzeln je Dokument vor. Hier werden sie für ein Fach zu einem
 * Markdown-Dokument gebündelt, zum Lesen, Kopieren und Speichern.
 *
 * PDFs/Bilder liefern ihren Digest; Text- und Word-Quellen haben keinen
 * Digest, dort steht der extrahierte Text selbst (gekürzt).
 */
export const TEXT_SOURCE_LIMIT = 8000;

export interface SubjectSummaryLabels {
  missing: string;
  truncated: string;
  /** Überschrift für eigene PDF-Markierungen (services/userHighlights.ts). */
  highlights?: string;
  page?: (n: number) => string;
}

export interface SummaryHighlight { page: number; quote: string; note?: string }


export interface SubjectSummary {
  markdown: string;
  included: number;
  missing: number;
}

/** Überschriften eine Ebene tiefer setzen, damit der Dokumentname (##) oben bleibt. */
const demoteHeadings = (md: string): string =>
  md.replace(/^(#{1,5})(\s)/gm, '#$1$2');

const bodyFor = (doc: ProcessedDocument, labels: SubjectSummaryLabels): string | null => {
  if (doc.digestStatus === 'ready' && doc.digestText?.trim()) return demoteHeadings(doc.digestText.trim());
  if ((doc.type === 'text' || doc.type === 'docx') && doc.content?.trim()) {
    const text = doc.content.trim();
    return text.length > TEXT_SOURCE_LIMIT
      ? `${text.slice(0, TEXT_SOURCE_LIMIT).trimEnd()} …\n\n_${labels.truncated}_`
      : text;
  }
  return null;
};

const highlightBlock = (list: SummaryHighlight[], labels: SubjectSummaryLabels): string => {
  const lines = list.map(h => {
    const where = labels.page ? ` (${labels.page(h.page)})` : '';
    // Frei gesetzte Notiz ohne markierten Text: nur Seite und Notiz.
    if (!h.quote) return `- ${labels.page ? labels.page(h.page) : h.page}${h.note ? `: ${h.note}` : ''}`;
    return `- „${h.quote}“${where}${h.note ? `: ${h.note}` : ''}`;
  });
  return `### ${labels.highlights ?? 'Markierungen'}\n\n${lines.join('\n')}`;
};

export const buildSubjectSummary = (
  subjectName: string,
  docs: ProcessedDocument[],
  labels: SubjectSummaryLabels,
  highlightsFor: (docId: string) => SummaryHighlight[] = () => [],
): SubjectSummary => {
  const sorted = [...docs].sort((a, b) => a.uploadDate - b.uploadDate);
  const parts = [`# ${subjectName}`];
  let included = 0;
  let missing = 0;
  for (const doc of sorted) {
    const body = bodyFor(doc, labels);
    const marks = highlightsFor(doc.id);
    const extra = marks.length ? `\n\n${highlightBlock(marks, labels)}` : '';
    if (body) { included += 1; parts.push(`## ${doc.name}\n\n${body}${extra}`); }
    else { missing += 1; parts.push(`## ${doc.name}\n\n_${labels.missing}_${extra}`); }
  }
  return { markdown: parts.join('\n\n'), included, missing };
};

/** Dateiname für den Download, ohne Sonderzeichen. */
export const summaryFileName = (subjectName: string): string =>
  `${subjectName.replace(/[^a-z0-9äöüß]+/gi, '_').replace(/^_+|_+$/g, '') || 'Fach'}_Zusammenfassung.md`;
