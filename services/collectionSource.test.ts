import { describe, it, expect } from 'vitest';
import { buildCollectionSource, collectionDocs } from './collectionSource';
import type { Collection, ProcessedDocument } from '../types';

const col: Collection = { id: 'c1', name: 'Sozialpsychologie', emoji: '🧠', color: 'bg-blue-500' };

const mkDoc = (over: Partial<ProcessedDocument>): ProcessedDocument => ({
  id: Math.random().toString(36).slice(2, 9), name: 'doc.pdf', content: '', type: 'pdf',
  uploadDate: 0, collectionId: 'c1', ...over,
});

describe('buildCollectionSource', () => {
  it('kombiniert Digests und Volltexte mit Quellen-Labels', () => {
    const docs = [
      mkDoc({ name: 'Folien.pdf', digestText: 'Digest der Folien', digestStatus: 'ready' }),
      mkDoc({ name: 'Notizen.txt', type: 'text', content: 'Meine Mitschrift' }),
    ];
    const res = buildCollectionSource(col, docs)!;
    expect(res.includedCount).toBe(2);
    expect(res.pendingCount).toBe(0);
    expect(res.source.text).toContain('[Quelle: Folien]');
    expect(res.source.text).toContain('Meine Mitschrift');
    expect(res.source.text).toContain('Sozialpsychologie');
    expect(res.name).toBe('Ordner: Sozialpsychologie');
  });

  it('zählt PDFs ohne fertigen Digest als pending', () => {
    const docs = [
      mkDoc({ name: 'Roh.pdf', digestStatus: 'pending' }),
      mkDoc({ name: 'Fertig.pdf', digestText: 'Inhalt', digestStatus: 'ready' }),
    ];
    const res = buildCollectionSource(col, docs)!;
    expect(res.includedCount).toBe(1);
    expect(res.pendingCount).toBe(1);
  });

  it('null bei leerem Ordner; includedCount 0 wenn nichts lesbar', () => {
    expect(buildCollectionSource(col, [])).toBeNull();
    const res = buildCollectionSource(col, [mkDoc({ digestStatus: 'pending' })])!;
    expect(res.includedCount).toBe(0);
  });

  it('ignoriert Dokumente anderer Ordner', () => {
    const docs = [
      mkDoc({ type: 'text', content: 'gehört dazu' }),
      mkDoc({ type: 'text', content: 'anderer Ordner', collectionId: 'c2' }),
    ];
    expect(collectionDocs(col, docs)).toHaveLength(1);
    expect(buildCollectionSource(col, docs)!.source.text).not.toContain('anderer Ordner');
  });

  it('respektiert die Zeichen-Obergrenze', () => {
    const big = 'x'.repeat(60_000);
    const docs = [
      mkDoc({ name: 'a.txt', type: 'text', content: big }),
      mkDoc({ name: 'b.txt', type: 'text', content: big }),
    ];
    const res = buildCollectionSource(col, docs)!;
    expect(res.includedCount).toBe(1);
    expect(res.pendingCount).toBe(1);
  });
});
