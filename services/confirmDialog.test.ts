import { describe, it, expect, vi, afterEach } from 'vitest';
import { confirmDialog, registerConfirmHost, type PendingConfirm } from './confirmDialog';

describe('confirmDialog', () => {
  afterEach(() => vi.restoreAllMocks());

  it('liefert die Antwort des Hosts (Bestätigen und Abbrechen)', async () => {
    let shown: PendingConfirm | null = null;
    const unregister = registerConfirmHost(p => { shown = p; });

    const yes = confirmDialog({ message: 'Löschen?', danger: true });
    expect(shown!.message).toBe('Löschen?');
    shown!.resolve(true);
    await expect(yes).resolves.toBe(true);
    expect(shown).toBeNull(); // Host schließt nach der Antwort

    const no = confirmDialog({ message: 'Wirklich?' });
    shown!.resolve(false);
    await expect(no).resolves.toBe(false);
    unregister();
  });

  it('fällt ohne Host auf window.confirm zurück, statt still zu bestätigen', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await expect(confirmDialog({ message: 'Ohne Host' })).resolves.toBe(false);
    expect(spy).toHaveBeenCalledWith('Ohne Host');
  });
});
