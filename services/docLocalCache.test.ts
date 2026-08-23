import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CACHE_TEXT_BUDGET_CHARS,
  loadCachedDocs,
  persistDocs,
  sanitizeForCache,
} from './docLocalCache';
import type { ProcessedDocument } from '../types';

// ── Regression: localStorage-Quota-Crash (Feature-Audit 2026-08-22) ──────────
// Historisch landeten Bild-Base64-Payloads und unbegrenzte Skripttexte im
// Key studearc_docs; ein QuotaExceededError riss dann Upload/State mit.
// Diese Tests sichern die drei Ursachen-Regeln des docLocalCache:
//   Regel 1: Binärdaten MIT Cloud-Kopie werden nie persistiert
//            (Legacy ohne Cloud-Kopie bleibt als einzige Kopie erhalten)
//   Regel 2: Textinhalte teilen ein Zeichen-Budget, LRU-Eviction nach uploadDate
//   Regel 3: Schreiben wirft NIEMALS — Abbau in Stufen statt Crash

const makeDoc = (over: Partial<ProcessedDocument> & { id: string }): ProcessedDocument => ({
  name: `${over.id}.txt`,
  content: '',
  type: 'text',
  uploadDate: 0,
  ...over,
});

const rawCache = (): ProcessedDocument[] =>
  JSON.parse(localStorage.getItem('studearc_docs') || 'null') ?? [];

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Regel 1 — redundante Binär-Payloads werden nie persistiert', () => {
  it('entfernt Base64-Inhalt von PDF/Bild mit storagePath beim Schreiben', () => {
    const hugeBase64 = 'A'.repeat(3_000_000); // ~4 MB UTF-16 — allein quota-sprengend
    const docs: ProcessedDocument[] = [
      makeDoc({ id: 'img1', type: 'image', content: hugeBase64, storagePath: 'u1/img1/foto.jpg', mimeType: 'image/jpeg', digestText: 'Tafelfoto-Digest' }),
      makeDoc({ id: 'pdf1', type: 'pdf', content: hugeBase64, storagePath: 'u1/pdf1/skript.pdf' }),
    ];

    persistDocs(docs);

    const cached = rawCache();
    expect(cached).toHaveLength(2);
    // Inhalt weg, aber ALLES andere unangetastet (Meta, Mime, Digest, Pfad):
    expect(cached[0]).toEqual({
      id: 'img1', name: 'img1.txt', content: '', type: 'image',
      uploadDate: 0, storagePath: 'u1/img1/foto.jpg', mimeType: 'image/jpeg', digestText: 'Tafelfoto-Digest',
    });
    expect(cached[1].storagePath).toBe('u1/pdf1/skript.pdf');
    expect(cached.every(d => d.content === '')).toBe(true);
  });

  it('BEHALT den Inhalt historischer Nur-lokal-Bilder (ohne storagePath) — einzige verbleibende Kopie', () => {
    const legacyBase64 = 'B'.repeat(500_000);
    const docs: ProcessedDocument[] = [
      makeDoc({ id: 'alt1', type: 'image', content: legacyBase64 }), // kein storagePath
    ];

    persistDocs(docs);

    expect(rawCache()[0].content).toBe(legacyBase64);
  });
});

describe('Regel 2 — Text-Budget mit LRU-Eviction (älteste uploadDate zuerst)', () => {
  it('evicted die ältesten Textinhalte übers Budget hinaus, Meta/Digest bleiben', () => {
    const chunk = 'x'.repeat(600_000);
    const docs: ProcessedDocument[] = [
      makeDoc({ id: 'alt', uploadDate: 100, content: chunk, digestText: 'alter Digest' }),
      makeDoc({ id: 'mittel', uploadDate: 200, content: chunk }),
      makeDoc({ id: 'neu', uploadDate: 300, content: chunk }),
      makeDoc({ id: 'meta-only', uploadDate: 50, content: '', digestText: 'nur Digest' }),
    ];

    const { docs: view, changed } = sanitizeForCache(docs);

    expect(changed).toBe(true);
    const totalText = view.reduce((s, d) => s + d.content.length, 0);
    expect(totalText).toBeLessThanOrEqual(CACHE_TEXT_BUDGET_CHARS);
    // Ältester Text-Inhalt ist geflogen …
    expect(view.find(d => d.id === 'alt')!.content).toBe('');
    // … aber sein Digest und alle Metadaten sind noch da:
    expect(view.find(d => d.id === 'alt')!.digestText).toBe('alter Digest');
    expect(view.find(d => d.id === 'alt')!.name).toBe('alt.txt');
    // Jüngere Inhalte blieben innerhalb des Budgets erhalten:
    expect(view.find(d => d.id === 'mittel')!.content.length).toBe(600_000);
    expect(view.find(d => d.id === 'neu')!.content.length).toBe(600_000);
    // Reiner Digest-Träger war nie betroffen:
    expect(view.find(d => d.id === 'meta-only')!.digestText).toBe('nur Digest');
  });

  it('greift NICHT, solange das Budget eingehalten ist (changed=false)', () => {
    const docs: ProcessedDocument[] = [
      makeDoc({ id: 'a', content: 'kurz' }),
      makeDoc({ id: 'b', type: 'pdf', content: 'legacy-base64', storagePath: 'u/b.pdf' }),
    ];
    const { docs: view, changed } = sanitizeForCache(docs);
    expect(changed).toBe(true); // nur wegen Regel 1 (PDF-Redundanz)
    expect(view.find(d => d.id === 'a')!.content).toBe('kurz');
  });
});

describe('Regel 3 — Schreiben wirft niemals (Stufenabbau statt Crash)', () => {
  it('fällt bei einmaligem QuotaExceededError auf schreibbare Stufe zurück (ohne Textinhalte)', () => {
    const docs: ProcessedDocument[] = [
      makeDoc({ id: 't1', uploadDate: 1, content: 'Volltext', digestText: 'd1' }),
      makeDoc({ id: 'img1', type: 'image', content: 'legacy', storagePath: 'u/img.jpg' }),
    ];
    // 1. Aufruf (mit Budget-Ansicht) sprengt das Quota → Stufe 2 (ohne Texte) passt:
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => { throw new DOMException('quota', 'QuotaExceededError'); });

    expect(() => persistDocs(docs)).not.toThrow();
    expect(setItemSpy).toHaveBeenCalledTimes(2);

    const cached = rawCache();
    expect(cached.find(d => d.id === 'img1')).toMatchObject({ content: '' }); // Regel 1 auch in Stufe 2
    const t1 = cached.find(d => d.id === 't1')!;
    expect(t1.content).toBe('');          // Textinhalt geopfert …
    expect(t1.digestText).toBe('d1');     // … aber Digest/Meta gerettet.
  });

  it('schluckt dauerhaft volles Quota still (App läuft im RAM weiter)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(() => persistDocs([makeDoc({ id: 'x', content: 'egal' })])).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('localStorage-Speicher voll'),
      expect.anything(),
    );
  });
});

describe('Gesicherter Lesepfad (loadCachedDocs)', () => {
  it('heilt übernommenen Alt-Bestand: bloated Bild-Payload wird beim Lesen entfernt UND zurückgeschrieben', () => {
    const bloatedLegacy = [makeDoc({ id: 'old-img', type: 'image', content: 'C'.repeat(2_000_000), storagePath: 'u/old.jpg' })];
    localStorage.setItem('studearc_docs', JSON.stringify(bloatedLegacy));

    const loaded = loadCachedDocs();

    expect(loaded[0].content).toBe('');
    // Self-Healing: der bereinigte Stand steht bereits wieder im Cache.
    expect(rawCache()[0].content).toBe('');
  });

  it('liefert [] statt Crash bei korruptem JSON', () => {
    localStorage.setItem('studearc_docs', '{nicht json');
    expect(loadCachedDocs()).toEqual([]);
  });

  it('liefert [] bei nicht-Array-Payload (z.B. Objekt aus älterer Version)', () => {
    localStorage.setItem('studearc_docs', JSON.stringify({ kaputt: true }));
    expect(loadCachedDocs()).toEqual([]);
  });

  it('rundet alle Felder verlustfrei durch (Mime, Ordner, Digest-Status)', () => {
    const doc = makeDoc({
      id: 'full', type: 'docx', content: 'Hallo Welt', uploadDate: 42,
      collectionId: 'col-1', digestStatus: 'ready',
    });
    localStorage.setItem('studearc_docs', JSON.stringify([doc]));

    expect(loadCachedDocs()).toEqual([doc]);
  });
});
