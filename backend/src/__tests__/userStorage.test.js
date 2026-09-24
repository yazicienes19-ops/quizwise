import { describe, it, expect } from 'vitest';
import { collectUserStoragePaths, deleteUserStorage } from '../utils/userStorage';

/** Minimaler Supabase-Admin-Ersatz: Tabellen-Query + Storage je Bucket. */
const fakeAdmin = ({ docs = [], buckets = {}, missing = [] }) => {
  const removed = {};
  return {
    removed,
    from: () => ({
      select: () => ({ eq: () => ({ not: async () => ({ data: docs, error: null }) }) }),
    }),
    storage: {
      from: (name) => ({
        list: async (prefix) => {
          if (missing.includes(name)) return { data: null, error: { message: 'Bucket not found' } };
          return { data: (buckets[name] || {})[prefix] || [], error: null };
        },
        remove: async (paths) => { removed[name] = [...(removed[name] || []), ...paths]; return { error: null }; },
      }),
    },
  };
};

describe('userStorage', () => {
  it('sammelt Dateien aus Tabelle und Ordnern beider Buckets, ohne Doppelte', async () => {
    const admin = fakeAdmin({
      docs: [{ storage_path: 'u1/d1/a.pdf' }],
      buckets: {
        'document-files': { u1: [{ name: 'd1' }, { name: 'lose.pdf', id: 'x' }], 'u1/d1': [{ name: 'a.pdf' }, { name: 'b.pdf' }] },
        'card-images': { u1: [{ name: 'c1-ab.webp', id: 'y' }] },
      },
    });
    const paths = await collectUserStoragePaths(admin, 'u1');
    expect(paths['document-files'].sort()).toEqual(['u1/d1/a.pdf', 'u1/d1/b.pdf', 'u1/lose.pdf']);
    expect(paths['card-images']).toEqual(['u1/c1-ab.webp']);
  });

  it('löscht alles und verträgt einen noch fehlenden Bildkarten-Bucket', async () => {
    const admin = fakeAdmin({
      docs: [{ storage_path: 'u1/d1/a.pdf' }],
      buckets: { 'document-files': { u1: [] } },
      missing: ['card-images'],
    });
    expect(await deleteUserStorage(admin, 'u1')).toBe(1);
    expect(admin.removed['document-files']).toEqual(['u1/d1/a.pdf']);
  });
});
