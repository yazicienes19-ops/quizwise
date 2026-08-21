import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadTutorSessions, saveTutorSession, deleteTutorSession, tutorSessionTitle,
  type StoredTutorSession,
} from './tutorSessions';

const mkSession = (id: string, over: Partial<StoredTutorSession> = {}): StoredTutorSession => ({
  id,
  mode: 'explain',
  sourceName: 'Skript.pdf',
  sourceRef: { kind: 'doc', id: 'doc-1' },
  useExternal: false,
  messages: [{ id: 'm1', role: 'user', content: 'Was ist Falsifikation?', ts: 1 }],
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

describe('tutorSessions', () => {
  beforeEach(() => localStorage.clear());

  it('speichert und lädt Sitzungen', () => {
    saveTutorSession(mkSession('a'));
    const loaded = loadTutorSessions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('a');
    expect(loaded[0].mode).toBe('explain');
  });

  it('Upsert: gleiche id wird ersetzt, nicht dupliziert', () => {
    saveTutorSession(mkSession('a'));
    saveTutorSession(mkSession('a', { mode: 'quiz', messages: [
      { id: 'm1', role: 'user', content: 'Start', ts: 1 },
      { id: 'm2', role: 'tutor', content: 'Frage 1?', ts: 2 },
    ] }));
    const loaded = loadTutorSessions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].mode).toBe('quiz');
    expect(loaded[0].messages).toHaveLength(2);
  });

  it('kappt Nachrichten auf die letzten 40', () => {
    const messages = Array.from({ length: 55 }, (_, i) => ({ id: `m${i}`, role: 'user' as const, content: `msg ${i}`, ts: i }));
    saveTutorSession(mkSession('a', { messages }));
    const loaded = loadTutorSessions();
    expect(loaded[0].messages).toHaveLength(40);
    expect(loaded[0].messages[0].content).toBe('msg 15');
  });

  it('behält maximal 10 Sitzungen (älteste fliegen raus)', () => {
    for (let i = 0; i < 12; i++) {
      saveTutorSession(mkSession(`s${i}`, { createdAt: i, updatedAt: i }));
    }
    const loaded = loadTutorSessions();
    expect(loaded).toHaveLength(10);
    expect(loaded.map(s => s.id)).not.toContain('s0');
    expect(loaded.map(s => s.id)).toContain('s11');
  });

  it('löscht Sitzungen by id', () => {
    saveTutorSession(mkSession('a'));
    saveTutorSession(mkSession('b'));
    const rest = deleteTutorSession('a');
    expect(rest.map(s => s.id)).toEqual(['b']);
    expect(loadTutorSessions()).toHaveLength(1);
  });

  it('ignoriert korruptes JSON und ungültige Einträge', () => {
    localStorage.setItem('studearc_tutor_sessions_v1', 'nicht json{{{');
    expect(loadTutorSessions()).toEqual([]);
    localStorage.setItem('studearc_tutor_sessions_v1', JSON.stringify([{ kaputt: true }, 'text', null]));
    expect(loadTutorSessions()).toEqual([]);
  });

  it('Titel ist die erste Nutzer-Nachricht, gekürzt auf 60 Zeichen', () => {
    const long = 'x'.repeat(80);
    expect(tutorSessionTitle(mkSession('a', { messages: [{ id: 'm', role: 'user', content: long, ts: 1 }] }), 'Fallback')).toBe(`${'x'.repeat(60)}…`);
    expect(tutorSessionTitle(mkSession('a'), 'Fallback')).toBe('Was ist Falsifikation?');
    expect(tutorSessionTitle(mkSession('a', { messages: [] }), 'Fallback')).toBe('Fallback');
  });
});
