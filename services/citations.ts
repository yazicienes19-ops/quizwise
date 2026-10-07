/**
 * Fußnoten im Lernstudio (services/subjectStudio.ts): [2] = Quelle 2,
 * [2:14] = Quelle 2, Seite 14, mehrere Belege [1:3][2] oder [1, 2].
 * Seitenbereiche [1:3-5] werden zu einzelnen Seiten aufgelöst.
 * Gerendert in components/markdownRenderer.tsx (MarkdownOptions.renderCitation).
 */
export interface CitationRef { n: number; page?: number }

export const CITATION_RE = /\[\d+(?::\d+(?:[-–]\d+)?)?(?:\s*[,;]\s*\d+(?::\d+(?:[-–]\d+)?)?)*\]/;

/** Bis zu dieser Spanne wird ein Seitenbereich vollständig aufgelöst, darüber nur Anfang und Ende. */
export const MAX_RANGE_EXPAND = 6;

export const parseCitationToken = (token: string): CitationRef[] =>
  token.slice(1, -1).split(/[,;]/).flatMap((part): CitationRef[] => {
    const [nRaw, pageRaw] = part.trim().split(':');
    const n = Number(nRaw);
    if (!pageRaw) return [{ n }];
    const [from, to] = pageRaw.split(/[-–]/).map(Number);
    if (!to || to <= from) return [{ n, page: from }];
    if (to - from + 1 > MAX_RANGE_EXPAND) return [{ n, page: from }, { n, page: to }];
    return Array.from({ length: to - from + 1 }, (_, i) => ({ n, page: from + i }));
  });
