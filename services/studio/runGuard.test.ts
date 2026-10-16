import { describe, it, expect } from 'vitest';
import { createRunGuard } from './runGuard';

describe('createRunGuard', () => {
  it('Doppelklick startet nur einen Lauf, danach geht es wieder', async () => {
    const guard = createRunGuard();
    let runs = 0;
    let release!: () => void;
    const job = () => new Promise<void>(r => { runs += 1; release = r; });
    const first = guard.run(job);
    const second = guard.run(job);
    expect(runs).toBe(1);
    expect(await second).toBeUndefined();
    release();
    await first;
    expect(guard.running).toBe(false);
    void guard.run(job);
    expect(runs).toBe(2);
    release();
  });
  it('gibt die Sperre auch bei Fehlern frei', async () => {
    const guard = createRunGuard();
    await expect(guard.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(guard.running).toBe(false);
  });
});
