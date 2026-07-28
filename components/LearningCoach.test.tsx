import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LearningCoach } from './LearningCoach';
import { I18nProvider } from '../i18n/I18nProvider';
import { setLocale } from '../i18n';
import type { Collection } from '../types';

// generateCoachInsights ruft das Backend (Gemini) auf — für den Regressionstest
// wird nur das Ergebnis gemockt, der Rest der Komponente läuft unverändert.
vi.mock('../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/geminiService')>();
  return { ...actual, generateCoachInsights: vi.fn() };
});
import { generateCoachInsights } from '../services/geminiService';

const QUIZ_HISTORY_KEY = 'studearc_quiz_history';

/** Legt Quiz-Sessions an, die per docName dem Fach-Filter zugeordnet werden
 *  (moduleFilter matcht immer auf "Ordner: <Fachname>", siehe LearningCoach.tsx). */
const seedQuizHistoryForModule = (moduleName: string, count: number) => {
  const now = Date.now();
  const existing = JSON.parse(localStorage.getItem(QUIZ_HISTORY_KEY) || '[]');
  const entries = Array.from({ length: count }, (_, i) => ({
    id: `${moduleName}-${i}`,
    docId: `${moduleName}-doc`,
    docName: `Ordner: ${moduleName}`,
    timestamp: now - i * 1000,
    score: 75,
    correctCount: 3,
    totalCount: 4,
    weakTopics: [],
    questions: [],
    answers: [],
  }));
  localStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify([...existing, ...entries]));
};

const moduleA: Collection = { id: 'mod-a', name: 'Fach A', emoji: '📘', color: '#000' };
const moduleB: Collection = { id: 'mod-b', name: 'Fach B', emoji: '📗', color: '#111' };

const renderCoach = (activeModule: Collection | null) =>
  render(
    <I18nProvider>
      <LearningCoach metrics={[]} decks={[]} onNavigate={() => {}} activeModule={activeModule} documents={[]} />
    </I18nProvider>,
  );

describe('LearningCoach — Fach-Wechsel (regression)', () => {
  beforeEach(() => {
    localStorage.clear();
    // Test sucht gezielt deutsche UI-Strings — jsdom hat standardmäßig navigator.language
    // 'en-US', worüber die App inzwischen (EN/TR-Support) sonst automatisch auf Englisch
    // erkennen würde.
    setLocale('de');
    vi.mocked(generateCoachInsights).mockReset();
  });

  it('setzt die KI-Coach-Analyse zurück, wenn das aktive Fach gewechselt wird', async () => {
    // Beide Fächer haben genug Sessions für den Coach (MIN_SESSIONS_FOR_COACH = 5)
    seedQuizHistoryForModule('Fach A', 5);
    seedQuizHistoryForModule('Fach B', 5);

    vi.mocked(generateCoachInsights).mockResolvedValue({
      synthesis: ['Fach-A-spezifische Beobachtung, die nicht in Fach B auftauchen darf.'],
      connections: [],
      prognosis: { grade: '2.0', passProbability: 80, reasoning: '' },
      forwardPrediction: '',
      methodInsight: '',
      recommendations: [],
    });

    const { rerender } = renderCoach(moduleA);

    // Coach für Fach A starten und auf das (gemockte) Ergebnis warten
    fireEvent.click(await screen.findByText('Coach starten'));
    await waitFor(() =>
      expect(screen.getByText('Fach-A-spezifische Beobachtung, die nicht in Fach B auftauchen darf.')).toBeTruthy(),
    );

    // Fach wechseln, OHNE die Komponente neu zu mounten (wie im echten Sidebar-Filter)
    rerender(
      <I18nProvider>
        <LearningCoach metrics={[]} decks={[]} onNavigate={() => {}} activeModule={moduleB} documents={[]} />
      </I18nProvider>,
    );

    // Die alte Analyse darf nicht mehr sichtbar sein …
    expect(screen.queryByText('Fach-A-spezifische Beobachtung, die nicht in Fach B auftauchen darf.')).toBeNull();
    // … und Fach B zeigt wieder den Start-Zustand (genug Daten, aber noch keine Analyse) statt der Reste von Fach A.
    expect(await screen.findByText('Coach starten')).toBeTruthy();
  });
});
