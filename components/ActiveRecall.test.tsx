import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ActiveRecall } from './ActiveRecall';
import { I18nProvider } from '../i18n/I18nProvider';
import { setLocale } from '../i18n';
import type { ProcessedDocument, RecallChallenge, RecallEvaluation } from '../types';
import type { GenerationSource } from '../services/geminiService';
import type { Chapter } from '../services/chapterService';

// generateValidatedChallenge/evaluateRecallResponse rufen das Backend (Gemini) auf —
// für den Regressionstest werden nur diese Ergebnisse gemockt. Coverage-/Fortschritts-
// Logik (recallCoverageService, der eigentliche Fix-2-Kern) läuft mit den echten
// Produktionsfunktionen, nicht mit Mocks.
vi.mock('../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/geminiService')>();
  return { ...actual, generateRecallChallenge: vi.fn(), evaluateRecallResponse: vi.fn() };
});
vi.mock('../services/recallChallengeGuard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/recallChallengeGuard')>();
  return { ...actual, generateValidatedChallenge: vi.fn() };
});
// Kapitel-Erkennung (PDF/Text) und Lesefortschritt sind reine Eingabedaten für
// diesen Test — pro Test deterministisch vorgegeben statt echt erkannt/gelesen.
vi.mock('../services/chapterService', () => ({ detectChaptersForDoc: vi.fn() }));
vi.mock('../services/chapterProgressService', () => ({ getDoneChapterIndices: vi.fn() }));

import { evaluateRecallResponse } from '../services/geminiService';
import { generateValidatedChallenge } from '../services/recallChallengeGuard';
import { detectChaptersForDoc } from '../services/chapterService';
import { getDoneChapterIndices } from '../services/chapterProgressService';

const chapter = (index: number, title: string, extra: Partial<Chapter> = {}): Chapter => ({
  index, title, content: 'x'.repeat(200), charCount: 200, ...extra,
});

const testDoc = (overrides: Partial<ProcessedDocument> = {}): ProcessedDocument => ({
  id: 'doc-1', name: 'Testdokument.txt', content: 'Inhalt', type: 'text', uploadDate: Date.now(), ...overrides,
});

const getDocumentSource = (): GenerationSource => ({ text: 'Voller Dokumentinhalt' });

const makeChallenge = (question: string, topic: string): RecallChallenge => ({
  question, topic, expectedKeywords: ['A', 'B', 'C'], conceptContext: 'Musterkontext.',
});

const baseEvaluation: RecallEvaluation = {
  score: 75, feedback: 'Solide Erklärung.', missingPoints: ['Detail X'], strengths: ['Kernidee klar'], suggestedReview: 'Vertiefe Detail X.',
};

const renderAR = (props: Partial<React.ComponentProps<typeof ActiveRecall>> = {}) =>
  render(
    <I18nProvider>
      <ActiveRecall
        availableDocuments={[]}
        collections={[]}
        getDocumentSource={getDocumentSource}
        onComplete={() => {}}
        {...props}
      />
    </I18nProvider>,
  );

const answerAndSubmit = async (evaluation: RecallEvaluation) => {
  vi.mocked(evaluateRecallResponse).mockResolvedValueOnce(evaluation);
  fireEvent.change(
    screen.getByPlaceholderText('Formuliere deine Erklärung hier... oder diktiere mit dem Mikrofon →'),
    { target: { value: 'Eine ausreichend lange Testantwort für die Bewertung.' } },
  );
  fireEvent.click(screen.getByText('Antwort abgeben'));
  await screen.findByText(`${evaluation.score}%`);
};

describe('ActiveRecall — Feynman-Workflow-Bug: Fix 1 (Nächster Drill) + Fix 2 (Leseforschritt-Grenze)', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('de');
    vi.mocked(evaluateRecallResponse).mockReset();
    vi.mocked(generateValidatedChallenge).mockReset();
    vi.mocked(detectChaptersForDoc).mockReset();
    vi.mocked(getDoneChapterIndices).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('Test A: „Nächster Drill" startet automatisch eine neue Challenge, ohne zur Quellenauswahl zurückzuspringen', async () => {
    vi.mocked(detectChaptersForDoc).mockResolvedValue([chapter(0, 'Kapitel A'), chapter(1, 'Kapitel B')]);
    vi.mocked(getDoneChapterIndices).mockReturnValue([0, 1]);
    vi.mocked(generateValidatedChallenge)
      .mockResolvedValueOnce({ challenge: makeChallenge('Frage 1: Was ist Kapitel A?', 'Kapitel A'), actualTopic: 'Kapitel A' })
      .mockResolvedValueOnce({ challenge: makeChallenge('Frage 2: Was ist Kapitel B?', 'Kapitel B'), actualTopic: 'Kapitel B' });

    renderAR({ initialDoc: testDoc(), initialFocusTopic: 'Kapitel A' });

    fireEvent.click(await screen.findByText('Runde starten'));
    await screen.findByText('Frage 1: Was ist Kapitel A?');
    await answerAndSubmit(baseEvaluation);

    fireEvent.click(screen.getByText('Nächste Runde'));

    // Neue Challenge kommt automatisch — KEIN Rücksprung zur Quellenauswahl (SourceSelector)
    await screen.findByText('Frage 2: Was ist Kapitel B?');
    expect(screen.queryByText('Fokus wählen')).toBeNull();
    expect(vi.mocked(generateValidatedChallenge)).toHaveBeenCalledTimes(2);
    // activeSource/focusTopic bleiben über den automatischen Wechsel hinweg erhalten
    expect(vi.mocked(generateValidatedChallenge).mock.calls[1][0].focusTopic).toBe('Kapitel A');
    expect(screen.getByText('Testdokument')).toBeTruthy();
  });

  it('Test B: coverTopics enthält nur tatsächlich gelesene Kapitel, niemals ungelesene', async () => {
    const chapters = [0, 1, 2, 3, 4].map(i => chapter(i, `Kapitel ${i}`));
    vi.mocked(detectChaptersForDoc).mockResolvedValue(chapters);
    vi.mocked(getDoneChapterIndices).mockReturnValue([0, 1]);
    vi.mocked(generateValidatedChallenge).mockResolvedValue({ challenge: makeChallenge('F', 'Kapitel 0'), actualTopic: 'Kapitel 0' });

    renderAR({ initialDoc: testDoc() });

    // Sichtbarer Beleg: Abdeckungs-Pool umfasst nur die 2 gelesenen Kapitel, nicht alle 5
    await screen.findByText('0 von 2 Themen erklärt');

    fireEvent.click(screen.getByText('Runde starten'));
    await waitFor(() => expect(vi.mocked(generateValidatedChallenge)).toHaveBeenCalled());
    const coverTopics = vi.mocked(generateValidatedChallenge).mock.calls[0][0].steering?.coverTopics;
    expect(coverTopics).toEqual(['Kapitel 0', 'Kapitel 1']);
  });

  it('Test C: Lücken im Lesefortschritt werden respektiert (kein Auffüllen bis zum höchsten gelesenen Index)', async () => {
    const chapters = [0, 1, 2, 3, 4].map(i => chapter(i, `Kapitel ${i}`));
    vi.mocked(detectChaptersForDoc).mockResolvedValue(chapters);
    vi.mocked(getDoneChapterIndices).mockReturnValue([0, 2, 4]);
    vi.mocked(generateValidatedChallenge).mockResolvedValue({ challenge: makeChallenge('F', 'Kapitel 0'), actualTopic: 'Kapitel 0' });

    renderAR({ initialDoc: testDoc() });

    await screen.findByText('0 von 3 Themen erklärt');

    fireEvent.click(screen.getByText('Runde starten'));
    await waitFor(() => expect(vi.mocked(generateValidatedChallenge)).toHaveBeenCalled());
    const coverTopics = vi.mocked(generateValidatedChallenge).mock.calls[0][0].steering?.coverTopics;
    expect(coverTopics).toEqual(['Kapitel 0', 'Kapitel 2', 'Kapitel 4']);
    expect(coverTopics).not.toContain('Kapitel 1');
    expect(coverTopics).not.toContain('Kapitel 3');
  });

  it('Test D: ein Tutor-Handoff-Fokus auf ein ungelesenes Kapitel macht dieses nicht förderfähig', async () => {
    const chapters = [chapter(0, 'Kapitel A'), chapter(1, 'Kapitel B'), chapter(2, 'Kapitel C')];
    vi.mocked(detectChaptersForDoc).mockResolvedValue(chapters);
    vi.mocked(getDoneChapterIndices).mockReturnValue([0, 1]); // A und B gelesen, C NICHT
    vi.mocked(generateValidatedChallenge).mockResolvedValue({ challenge: makeChallenge('F', 'Kapitel C'), actualTopic: 'Kapitel C' });

    // Tutor-Handoff-Signal simuliert: Fokus zeigt auf ein NICHT gelesenes Kapitel
    // (manueller Start hier bewusst statt autoStart — der autoStart-spezifische
    // Race-Fall (Reader-Handoff) hat einen eigenen Test, s. Test F)
    renderAR({ initialDoc: testDoc(), initialFocusTopic: 'Kapitel C' });

    await screen.findByText('0 von 2 Themen erklärt');
    fireEvent.click(screen.getByText('Runde starten'));

    await waitFor(() => expect(vi.mocked(generateValidatedChallenge)).toHaveBeenCalled());
    const call = vi.mocked(generateValidatedChallenge).mock.calls[0][0];
    expect(call.focusTopic).toBe('Kapitel C'); // Fokus wird trotzdem an die KI weitergereicht
    expect(call.steering?.coverTopics).toEqual(['Kapitel A', 'Kapitel B']); // aber NICHT als "abgedeckt/förderfähig" gewertet
    expect(call.steering?.coverTopics).not.toContain('Kapitel C');
  });

  it('Test E: mehrere aufeinanderfolgende Drills funktionieren ohne erneute Quellenauswahl', async () => {
    vi.mocked(detectChaptersForDoc).mockResolvedValue([chapter(0, 'Kapitel A'), chapter(1, 'Kapitel B'), chapter(2, 'Kapitel C')]);
    vi.mocked(getDoneChapterIndices).mockReturnValue([0, 1, 2]);
    vi.mocked(generateValidatedChallenge)
      .mockResolvedValueOnce({ challenge: makeChallenge('Runde 1', 'Kapitel A'), actualTopic: 'Kapitel A' })
      .mockResolvedValueOnce({ challenge: makeChallenge('Runde 2', 'Kapitel B'), actualTopic: 'Kapitel B' })
      .mockResolvedValueOnce({ challenge: makeChallenge('Runde 3', 'Kapitel C'), actualTopic: 'Kapitel C' });

    renderAR({ initialDoc: testDoc() });

    fireEvent.click(await screen.findByText('Runde starten'));
    await screen.findByText('Runde 1');
    await answerAndSubmit(baseEvaluation);
    fireEvent.click(screen.getByText('Nächste Runde'));

    await screen.findByText('Runde 2');
    expect(screen.queryByText('Fokus wählen')).toBeNull();
    await answerAndSubmit(baseEvaluation);
    fireEvent.click(screen.getByText('Nächste Runde'));

    await screen.findByText('Runde 3');
    expect(screen.queryByText('Fokus wählen')).toBeNull();
    expect(vi.mocked(generateValidatedChallenge)).toHaveBeenCalledTimes(3);
  });

  it('Test G: der Verlauf bekommt den Quellnamen als docName, nicht das Thema', async () => {
    vi.mocked(detectChaptersForDoc).mockResolvedValue([chapter(0, 'Kapitel A')]);
    vi.mocked(getDoneChapterIndices).mockReturnValue([0]);
    vi.mocked(generateValidatedChallenge).mockResolvedValue({ challenge: makeChallenge('Frage G', 'Kapitel A'), actualTopic: 'Kapitel A' });
    const onComplete = vi.fn();

    renderAR({ initialDoc: testDoc(), onComplete });
    fireEvent.click(await screen.findByText('Runde starten'));
    await screen.findByText('Frage G');
    await answerAndSubmit(baseEvaluation);

    expect(onComplete).toHaveBeenCalledWith(75, 'Kapitel A', ['Detail X'], 'Testdokument');
  });

  it('Test H: "Nochmal versuchen" zeigt die Lücken des letzten Versuchs und danach den Fortschritt', async () => {
    vi.mocked(detectChaptersForDoc).mockResolvedValue([chapter(0, 'Kapitel A')]);
    vi.mocked(getDoneChapterIndices).mockReturnValue([0]);
    vi.mocked(generateValidatedChallenge).mockResolvedValue({ challenge: makeChallenge('Frage H', 'Kapitel A'), actualTopic: 'Kapitel A' });

    renderAR({ initialDoc: testDoc() });
    fireEvent.click(await screen.findByText('Runde starten'));
    await screen.findByText('Frage H');
    await answerAndSubmit({ ...baseEvaluation, score: 40, probeQuestion: 'Warum passiert das?', unexplainedJargon: ['Stimulus'] });

    fireEvent.click(screen.getByText('Nochmal versuchen'));
    await screen.findByText('Das fehlte beim letzten Mal (40%)');
    expect(screen.getByText('Detail X')).toBeTruthy();
    expect(screen.getByText('Erkläre diesmal auch: Stimulus')).toBeTruthy();
    expect(screen.getByText('Beantworte auch die Nachfrage: „Warum passiert das?"')).toBeTruthy();

    await answerAndSubmit({ ...baseEvaluation, score: 80 });
    expect(screen.getByText('Letzter Versuch 40%, jetzt 80%')).toBeTruthy();
    expect(screen.getByText('+40')).toBeTruthy();
  });

  it('Test I: eine angefangene Erklärung übersteht einen Tab-Wechsel', async () => {
    const doc = testDoc();
    vi.mocked(detectChaptersForDoc).mockResolvedValue([]);
    vi.mocked(getDoneChapterIndices).mockReturnValue([]);
    sessionStorage.setItem('studearc_feynman_draft_v1', JSON.stringify({
      challenge: makeChallenge('Gespeicherte Frage', 'Kapitel A'),
      userAnswer: 'Mein halber Gedanke',
      sourceRef: { kind: 'doc', id: doc.id },
      focusTopic: '',
      lastAttempt: null,
    }));

    renderAR({ availableDocuments: [doc] });

    await screen.findByText('Gespeicherte Frage');
    expect((screen.getByPlaceholderText('Formuliere deine Erklärung hier... oder diktiere mit dem Mikrofon →') as HTMLTextAreaElement).value)
      .toBe('Mein halber Gedanke');
    sessionStorage.clear();
  });

  it('Test F: Reader-Handoff (autoStart) wartet auf die Kapitel-Erkennung, bevor die allererste Challenge generiert wird', async () => {
    // Genau der reale Übergabe-Fall: SplitScreenReader -> Feynman-Taste bei
    // fertigem Kapitel (AppContent.tsx: autoStart={!!(pendingActionDoc && pendingTopic)}).
    // Kapitel-Erkennung bewusst manuell auflösbar, um die Race exakt zu treffen:
    // ohne die chaptersReady-Wartesperre würde autoStart schon VOR dem Auflösen
    // feuern und die allererste Challenge bekäme coverTopics=[] (Fix 2 würde für
    // genau den Fall, den er lösen soll, nicht greifen).
    let resolveChapters!: (chapters: Chapter[]) => void;
    vi.mocked(detectChaptersForDoc).mockReturnValue(new Promise(resolve => { resolveChapters = resolve; }));
    vi.mocked(getDoneChapterIndices).mockReturnValue([0]); // nur Kapitel A gelesen
    vi.mocked(generateValidatedChallenge).mockResolvedValue({ challenge: makeChallenge('Auto-Frage', 'Kapitel A'), actualTopic: 'Kapitel A' });

    renderAR({ initialDoc: testDoc(), initialFocusTopic: 'Kapitel B', autoStart: true });

    // Kapitel-Erkennung hängt noch — autoStart darf noch NICHT gefeuert haben
    await new Promise(r => setTimeout(r, 0));
    expect(vi.mocked(generateValidatedChallenge)).not.toHaveBeenCalled();

    resolveChapters([chapter(0, 'Kapitel A'), chapter(1, 'Kapitel B')]);

    await waitFor(() => expect(vi.mocked(generateValidatedChallenge)).toHaveBeenCalledTimes(1));
    const call = vi.mocked(generateValidatedChallenge).mock.calls[0][0];
    expect(call.steering?.coverTopics).toEqual(['Kapitel A']);
    expect(call.steering?.coverTopics).not.toContain('Kapitel B');
  });
});
