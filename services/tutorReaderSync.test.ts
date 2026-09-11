import { describe, it, expect, vi, beforeEach } from 'vitest';

const syncOptionalSavedField = vi.fn();
vi.mock('./syncService', () => ({ syncOptionalSavedField }));

import { mergeCloudTutorSessions, loadTutorSessions, type StoredTutorSession } from './tutorSessions';
import { mergeCloudReaderChat, saveReaderChat, getReaderChat } from './readerChatService';

const session = (id: string, updatedAt: number, text = 'Frage'): StoredTutorSession => ({
  id, mode: 'explain', sourceName: '', sourceRef: null, useExternal: true,
  messages: [{ id: `${id}-m`, role: 'user', content: text, ts: updatedAt }],
  createdAt: updatedAt, updatedAt,
});

describe('Tutor-Sitzungen: Cloud-Merge', () => {
  beforeEach(() => { localStorage.clear(); syncOptionalSavedField.mockReset(); });

  it('neuerer Stand gewinnt pro Sitzung, Cloud-only kommt dazu, ungültige Einträge fliegen raus', async () => {
    localStorage.setItem('studearc_tutor_sessions_v1', JSON.stringify([session('a', 10, 'lokal alt')]));
    const merged = mergeCloudTutorSessions([session('a', 20, 'cloud neu'), session('b', 5), { kaputt: true }]);

    expect(merged.map(s => s.id)).toEqual(['a', 'b']);
    expect(merged[0].messages[0].content).toBe('cloud neu');
    expect(loadTutorSessions().map(s => s.id)).toEqual(['a', 'b']);
  });

  it('schreibt zurück in die Cloud, wenn das Gerät Sitzungen hat, die dort fehlen', async () => {
    localStorage.setItem('studearc_tutor_sessions_v1', JSON.stringify([session('nur-lokal', 30)]));
    mergeCloudTutorSessions([]);
    await vi.waitFor(() => expect(syncOptionalSavedField).toHaveBeenCalledWith('tutor_sessions', expect.any(Function)));
  });

  it('kein Rückschreiben, wenn Cloud und Gerät identisch sind', async () => {
    const same = [session('x', 40)];
    localStorage.setItem('studearc_tutor_sessions_v1', JSON.stringify(same));
    mergeCloudTutorSessions(same);
    await new Promise(r => setTimeout(r, 0));
    expect(syncOptionalSavedField).not.toHaveBeenCalled();
  });
});

describe('Reader-Chats: Cloud-Merge und Speichern', () => {
  beforeEach(() => { localStorage.clear(); syncOptionalSavedField.mockReset(); });

  it('pro Dokument gewinnt der neuere Stand, kaputte Einträge werden ignoriert', () => {
    localStorage.setItem('studearc_reader_chat_v1', JSON.stringify({
      d1: { updatedAt: 100, chat: { 0: [{ concept: 'lokal', answer: 'a' }] } },
      d2: { updatedAt: 500, chat: { 0: [{ concept: 'lokal neuer', answer: 'a' }] } },
    }));
    mergeCloudReaderChat({
      d1: { updatedAt: 200, chat: { 0: [{ concept: 'cloud neuer', answer: 'b' }] } },
      d2: { updatedAt: 300, chat: { 0: [{ concept: 'cloud älter', answer: 'b' }] } },
      d3: { chat: {} },
    });

    expect(getReaderChat('d1')[0][0].concept).toBe('cloud neuer');
    expect(getReaderChat('d2')[0][0].concept).toBe('lokal neuer');
    expect(getReaderChat('d3')).toEqual({});
  });

  it('unveränderter Chat löst keinen erneuten Upload aus', async () => {
    const chat = { 0: [{ concept: 'Was ist X?', answer: 'X ist Y.', quote: null }] };
    saveReaderChat('doc', chat);
    await vi.waitFor(() => expect(syncOptionalSavedField).toHaveBeenCalledTimes(1));
    saveReaderChat('doc', chat);
    await new Promise(r => setTimeout(r, 0));
    expect(syncOptionalSavedField).toHaveBeenCalledTimes(1);
  });
});
