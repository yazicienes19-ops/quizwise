/**
 * Fußnoten im Lernstudio (services/subjectStudio.ts): [2] = Quelle 2,
 * [2:14] = Quelle 2, Seite 14, mehrere Belege [1:3][2] oder [1, 2].
 * Gerendert in components/markdownRenderer.tsx (MarkdownOptions.renderCitation).
 */
export interface CitationRef { n: number; page?: number }

export const CITATION_RE = /\[\d+(?::\d+)?(?:\s*[,;]\s*\d+(?::\d+)?)*\]/;

export const parseCitationToken = (token: string): CitationRef[] =>
  token.slice(1, -1).split(/[,;]/).map(part => {
    const [n, page] = part.trim().split(':').map(Number);
    return page ? { n, page } : { n };
  });
