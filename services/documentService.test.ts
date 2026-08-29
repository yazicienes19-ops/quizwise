import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { uploadFileWithProgress, UploadStalledError, UploadTimeoutError, saveDocumentToSupabase } from './documentService';
import type { ProcessedDocument } from '../types';

// Supabase-Client wird für die saveDocumentToSupabase-Tests unten gedoppelt;
// die XHR-Tests darüber berühren ihn nicht.
const upsertMock = vi.fn(async () => ({ error: null }));
const storageUploadMock = vi.fn(async () => ({ error: null }));
vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
      getSession: async () => ({ data: { session: null } }),
    },
    from: () => ({ upsert: upsertMock }),
    storage: { from: () => ({ upload: storageUploadMock }) },
  },
}));

// Minimaler XHR-Doppelgänger — genug um send/open/setRequestHeader/abort und
// die Event-Handler nachzubilden, die uploadFileWithProgress tatsächlich nutzt.
class FakeXHR {
  static instances: FakeXHR[] = [];
  status = 0;
  aborted = false;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  headers: Record<string, string> = {};

  open(_method: string, _url: string) {}
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  send(_body: unknown) { FakeXHR.instances.push(this); }
  abort() { this.aborted = true; this.onabort?.(); }
}

const lastXhr = () => FakeXHR.instances[FakeXHR.instances.length - 1];

describe('uploadFileWithProgress', () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXHR as unknown as typeof XMLHttpRequest);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const file = new File(['x'.repeat(100)], 'skript.pdf', { type: 'application/pdf' });

  it('meldet Fortschritt und löst bei HTTP 2xx auf', async () => {
    const progress: number[] = [];
    const promise = uploadFileWithProgress('document-files', 'u/d/skript.pdf', file, 'token-123', p => progress.push(p));
    const xhr = lastXhr();
    xhr.headers['Authorization'] && expect(xhr.headers['Authorization']).toBe('Bearer token-123');
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.status = 200;
    xhr.onload?.();
    await expect(promise).resolves.toBeUndefined();
    expect(progress).toEqual([0.5]);
  });

  it('lehnt bei HTTP-Fehlerstatus mit lesbarer Meldung ab', async () => {
    const promise = uploadFileWithProgress('document-files', 'u/d/skript.pdf', file, 'token-123');
    const xhr = lastXhr();
    xhr.status = 403;
    xhr.onload?.();
    await expect(promise).rejects.toThrow(/HTTP 403/);
  });

  it('lehnt bei Netzwerkfehler ab', async () => {
    const promise = uploadFileWithProgress('document-files', 'u/d/skript.pdf', file, 'token-123');
    lastXhr().onerror?.();
    await expect(promise).rejects.toThrow(/Netzwerkfehler/);
  });

  it('bricht nach 25s ohne Fortschritt als "hängengeblieben" ab (nicht erst nach 10 Minuten)', async () => {
    const promise = uploadFileWithProgress('document-files', 'u/d/skript.pdf', file, 'token-123');
    const xhr = lastXhr();
    const assertion = expect(promise).rejects.toBeInstanceOf(UploadStalledError);
    await vi.advanceTimersByTimeAsync(26_000);
    await assertion;
    expect(xhr.aborted).toBe(true);
  });

  it('bricht NICHT ab, solange regelmäßig Fortschritt reinkommt (langsame, aber lebende Verbindung)', async () => {
    const promise = uploadFileWithProgress('document-files', 'u/d/skript.pdf', file, 'token-123');
    const xhr = lastXhr();
    // 5x alle 20s ein Fortschritts-Ping (< 25s-Stall-Schwelle) — macht in Summe
    // 100s, weit über der 25s-Stall-Grenze, aber die Verbindung lebt sichtbar.
    for (let i = 1; i <= 5; i++) {
      await vi.advanceTimersByTimeAsync(20_000);
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: i, total: 5 });
    }
    expect(xhr.aborted).toBe(false);
    xhr.status = 200;
    xhr.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });

  it('bricht spätestens nach der harten 10-Minuten-Obergrenze ab, auch bei laufendem Fortschritt', async () => {
    const promise = uploadFileWithProgress('document-files', 'u/d/skript.pdf', file, 'token-123');
    const xhr = lastXhr();
    const assertion = expect(promise).rejects.toBeInstanceOf(UploadTimeoutError);
    // Alle 20s ein Ping (verhindert Stall-Abbruch) über insgesamt 11 Minuten —
    // die harte Obergrenze muss trotzdem greifen.
    for (let i = 0; i < 34; i++) {
      await vi.advanceTimersByTimeAsync(20_000);
      if (!xhr.aborted) xhr.upload.onprogress?.({ lengthComputable: true, loaded: i, total: 34 });
    }
    await assertion;
    expect(xhr.aborted).toBe(true);
  }, 15_000);
});

// ── Regression: Quota-Audit 2026-08-22 — Cloud-Invariante ────────────────────
// Der lokale Cache darf Bild-/PDF-Base64 nie mehr halten (docLocalCache); diese
// Tests sichern die Cloud-Seite derselben Ursache: Binärdaten leben AUSSCHLIESSLICH
// im Storage (storage_path), die documents-Zeile trägt sie niemals als Text.
describe('saveDocumentToSupabase — Binärdaten landen nie in content_text', () => {
  beforeEach(() => {
    upsertMock.mockClear();
    storageUploadMock.mockClear();
  });

  it('Bild mit (hypothetischer) Base64-Restmenge: content_text bleibt null, Storage wird beschrieben', async () => {
    const doc: ProcessedDocument = {
      id: 'img-9', name: 'foto.jpg', type: 'image', mimeType: 'image/jpeg',
      content: 'QUJDREVGRw==', uploadDate: 1,
    };
    const file = new File([new Uint8Array([255, 216, 255])], 'foto.jpg', { type: 'image/jpeg' });

    const path = await saveDocumentToSupabase(doc, file);

    expect(path).toBe('user-1/img-9/foto.jpg');
    expect(storageUploadMock).toHaveBeenCalledTimes(1);
    const row = (upsertMock.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(row.content_text).toBeNull();
    expect(row.storage_path).toBe('user-1/img-9/foto.jpg');
  });

  it('Regression: Dateiname mit Umlauten/türkischen Sonderzeichen wird für den Storage-Pfad bereinigt (Supabase Storage lehnt Nicht-ASCII-Objektschlüssel als "InvalidKey" ab)', async () => {
    const doc: ProcessedDocument = {
      id: 'pdf-tr', name: 'Matematik_Ünlü_Sınav.pdf', type: 'pdf',
      content: '', uploadDate: 3,
    };
    const file = new File([new Uint8Array([1, 2, 3])], 'Matematik_Ünlü_Sınav.pdf', { type: 'application/pdf' });

    const path = await saveDocumentToSupabase(doc, file);

    expect(path).toBe('user-1/pdf-tr/Matematik_Unlu_Sinav.pdf');
    const [calledPath] = storageUploadMock.mock.calls[0] as unknown as [string, File, unknown];
    expect(calledPath).toMatch(/^[a-zA-Z0-9._\/-]+$/);
  });

  it('text/docx-Inhalt landet gekappt (500.000 Zeichen) in content_text', async () => {
    const doc: ProcessedDocument = {
      id: 'txt-1', name: 'skript.txt', type: 'text',
      content: 'a'.repeat(500_500), uploadDate: 2,
    };

    await saveDocumentToSupabase(doc);

    const row = (upsertMock.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect((row.content_text as string).length).toBe(500_000);
  });
});
