import { describe, it, expect, vi } from 'vitest';
import { requireAdmin, ADMIN_IDS } from '../middleware/requireAdmin.js';
import { checkUsageLimit } from '../middleware/limits.js';

// requireAuth bleibt bewusst ungetestet: sein Auth-Client wird beim Modul-
// Import aus env-Variablen gebaut (CommonJS-require) und lässt sich ohne
// Refactor von auth.js nicht sauber stubben — das Risiko eines Eingriffs in
// die Auth-Middleware wiegt schwerer als der Testnutzen.

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('checkUsageLimit', () => {
  // supabase rpc löst zu { data, error } auf — Mocks brauchen diese Hülle.
  const baseReq = (rpc) => ({ user: { id: 'u1' }, supabase: { rpc } });

  it('ruft next mit usage-Daten auf, wenn das Limit erlaubt', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: true, plan: 'free', limit: 20, used: 5 }, error: null });
    const req = baseReq(rpc);
    const next = vi.fn();
    await checkUsageLimit(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.usage).toEqual({ plan: 'free', used: 5, limit: 20, remaining: 15 });
  });

  it('blockt mit 429 und Upgrade-Hinweis, wenn das Tageslimit erreicht ist', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: false, plan: 'free', limit: 20, used: 20 }, error: null });
    const res = mockRes();
    await checkUsageLimit(baseReq(rpc), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ upgradeRequired: true }));
  });

  it('Pro mit unbegrenztem Limit (limit null) hat remaining null', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: true, plan: 'pro', limit: null, used: 42 }, error: null });
    const req = baseReq(rpc);
    await checkUsageLimit(req, mockRes(), vi.fn());
    expect(req.usage.remaining).toBeNull();
  });

  it('RPC-Fehler wird zu 500, nicht zu einem stillen Durchfallen', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = mockRes();
    await checkUsageLimit(baseReq(rpc), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('RPC-Exception propagiert als Rejection (Express 5-Fehlerhandler → 500)', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network'));
    await expect(checkUsageLimit(baseReq(rpc), mockRes(), vi.fn())).rejects.toThrow('network');
  });
});

describe('requireAdmin', () => {
  it('ohne req.user → 403', () => {
    const res = mockRes();
    requireAdmin({}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('Nicht-Admin-ID → 403', () => {
    const res = mockRes();
    requireAdmin({ user: { id: 'nicht-admin' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('Admin-ID darf durch', () => {
    const next = vi.fn();
    requireAdmin({ user: { id: ADMIN_IDS[0] } }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
