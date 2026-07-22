import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadFileWithProgress, UploadStalledError, UploadTimeoutError } from './documentService';

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
