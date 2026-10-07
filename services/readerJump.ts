/**
 * Einmaliger Sprung beim nächsten Öffnen des PDF-Readers auf eine bestimmte
 * Seite (Fußnote [n:Seite] im Lernstudio). Der Reader liest den Wunsch beim
 * Start (peek, auch unter StrictMode zweimal sicher) und löscht ihn danach.
 */
let pending: { docId: string; page: number } | null = null;

export const requestReaderJump = (docId: string, page: number): void => { pending = { docId, page }; };

export const peekReaderJump = (docId: string): number | null =>
  pending && pending.docId === docId ? pending.page : null;

export const clearReaderJump = (docId: string): void => {
  if (pending?.docId === docId) pending = null;
};
