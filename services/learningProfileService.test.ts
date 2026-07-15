import { describe, it, expect, beforeEach } from 'vitest';
import { buildLearningProfile, buildRealTopicMastery, buildDailyPlan, buildMethodCommentary, buildContextMotivation, germanGradeFromPercentage } from './learningProfileService';
import { setLocale } from '../i18n';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';
import type { TopicMetric, FlashcardDeck, QuizQuestion, UserAnswer, LearningFlowResult, TopicSecurity } from '../types';
import { ActiveTab } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

// Die deutschen Assertions unten prüfen die de-Ausgabe; Locale explizit fixieren.
beforeEach(() => setLocale('de'));

const emptyInput = {
  metrics: [] as TopicMetric[],
  quizResults: [] as QuizResult[],
  recallResults: [] as RecallResult[],
  examResults: [] as ExamResult[],
  decks: [] as FlashcardDeck[],
  streak: { current: 0, best: 0 },
};

describe('germanGradeFromPercentage', () => {
  it('mappt Grenzwerte auf die deutsche Notenskala', () => {
    expect(germanGradeFromPercentage(95).grade).toBe('1.0');
    expect(germanGradeFromPercentage(50).grade).toBe('4.0');
    expect(germanGradeFromPercentage(49).grade).toBe('5.0');
    expect(germanGradeFromPercentage(49).label).toBe('Nicht Bestanden');
  });
});

describe('buildLearningProfile — Methodenvergleich', () => {
  it('liefert leere perMethod-Liste ohne Daten', () => {
    const profile = buildLearningProfile(emptyInput);
    expect(profile.perMethod).toEqual([]);
    expect(profile.examPrognosis).toBeNull();
  });

  it('trennt Feynman (recall) und KI-Erklärer (explainer) anhand des method-Felds', () => {
    const recallResults: RecallResult[] = [
      { id: '1', docName: 'A', timestamp: now, score: 80, topic: 'X', missingPoints: [], method: 'recall' },
      { id: '2', docName: 'A', timestamp: now, score: 60, topic: 'X', missingPoints: [], method: 'explainer' },
      // Altdaten ohne method-Feld → müssen als 'recall' gelten
      { id: '3', docName: 'A', timestamp: now, score: 70, topic: 'X', missingPoints: [] },
    ];
    const profile = buildLearningProfile({ ...emptyInput, recallResults });
    const feynman = profile.perMethod.find(m => m.method === 'feynman');
    const explainer = profile.perMethod.find(m => m.method === 'explainer');
    expect(feynman?.sessions).toBe(2);
    expect(feynman?.avgScore).toBe(75); // (80+70)/2
    expect(explainer?.sessions).toBe(1);
    expect(explainer?.avgScore).toBe(60);
  });
});

describe('buildLearningProfile — Themen-Sicherheit', () => {
  it('stuft niedrige Konfidenz + häufige Schwachstellen als kritisch ein', () => {
    const metrics: TopicMetric[] = [
      { id: 'm1', topic: 'Dualismus', confidence: 30, lastReviewed: now, totalAttempts: 3, correctAttempts: 1 },
      { id: 'm2', topic: 'Empirismus', confidence: 90, lastReviewed: now, totalAttempts: 3, correctAttempts: 3 },
    ];
    const quizResults: QuizResult[] = [
      { id: 'q1', docId: 'd1', docName: 'Doc', timestamp: now, score: 40, correctCount: 2, totalCount: 5, weakTopics: ['Dualismus'], questions: [], answers: [] },
      { id: 'q2', docId: 'd1', docName: 'Doc', timestamp: now, score: 40, correctCount: 2, totalCount: 5, weakTopics: ['Dualismus'], questions: [], answers: [] },
      { id: 'q3', docId: 'd1', docName: 'Doc', timestamp: now, score: 40, correctCount: 2, totalCount: 5, weakTopics: ['Dualismus'], questions: [], answers: [] },
    ];
    const profile = buildLearningProfile({ ...emptyInput, metrics, quizResults });
    const dualismus = profile.topicMastery.find(t => t.topic === 'Dualismus');
    const empirismus = profile.topicMastery.find(t => t.topic === 'Empirismus');
    expect(dualismus?.security).toBe('kritisch');
    expect(empirismus?.security).toBe('sicher');
  });
});

describe('buildLearningProfile — Vergessensanalyse', () => {
  it('erkennt Decks mit demnächst fälligen, bereits gelernten Karten', () => {
    const decks: FlashcardDeck[] = [{
      id: 'd1', title: 'Kapitel 6',
      cards: [
        { id: 'c1', front: 'F', back: 'B', level: 1, nextReview: now + 2 * DAY_MS, srs: { ease: 2.5, interval: 6, repetitions: 2, nextReview: now + 2 * DAY_MS, lastReview: now } },
        { id: 'c2', front: 'F2', back: 'B2', level: 0, nextReview: now, srs: { ease: 2.5, interval: 0, repetitions: 0, nextReview: now, lastReview: null } }, // noch nie gelernt → zählt nicht
      ],
    }];
    const profile = buildLearningProfile({ ...emptyInput, decks });
    expect(profile.forgetting).toHaveLength(1);
    expect(profile.forgetting[0]).toMatchObject({ topic: 'Kapitel 6', dueInDays: 2, cardCount: 1 });
  });

  it('ignoriert Decks ohne bald fällige Karten', () => {
    const decks: FlashcardDeck[] = [{
      id: 'd1', title: 'Kapitel 1',
      cards: [{ id: 'c1', front: 'F', back: 'B', level: 3, nextReview: now + 30 * DAY_MS, srs: { ease: 2.8, interval: 30, repetitions: 5, nextReview: now + 30 * DAY_MS, lastReview: now } }],
    }];
    const profile = buildLearningProfile({ ...emptyInput, decks });
    expect(profile.forgetting).toEqual([]);
  });
});

describe('buildLearningProfile — Kategorie-Sicherheit', () => {
  it('mittelt Scores pro Kategorie über mehrere Klausuren und zählt Schwachstellen', () => {
    const examResults: ExamResult[] = [
      { id: 'e1', docName: 'K1', timestamp: now, score: 70, passed: true, totalPoints: 100, achievedPoints: 70, weakTopics: [], categoryBreakdown: [{ category: 'transfer', score: 30 }, { category: 'definition', score: 90 }] },
      { id: 'e2', docName: 'K2', timestamp: now - DAY_MS, score: 60, passed: true, totalPoints: 100, achievedPoints: 60, weakTopics: [], categoryBreakdown: [{ category: 'transfer', score: 50 }, { category: 'definition', score: 85 }] },
    ];
    const profile = buildLearningProfile({ ...emptyInput, examResults });
    const transfer = profile.categoryMastery.find(c => c.category === 'transfer');
    const definition = profile.categoryMastery.find(c => c.category === 'definition');
    expect(transfer).toMatchObject({ avgScore: 40, weakCount: 2 });
    expect(definition).toMatchObject({ avgScore: 88, weakCount: 0 });
    // schwächste Kategorie zuerst
    expect(profile.categoryMastery[0].category).toBe('transfer');
  });

  it('liefert leere categoryMastery ohne Kategorie-Daten', () => {
    const examResults: ExamResult[] = [
      { id: 'e1', docName: 'K1', timestamp: now, score: 70, passed: true, totalPoints: 100, achievedPoints: 70, weakTopics: [] },
    ];
    const profile = buildLearningProfile({ ...emptyInput, examResults });
    expect(profile.categoryMastery).toEqual([]);
  });
});

describe('buildLearningProfile — Klausurprognose', () => {
  it('gewichtet neuere Klausuren stärker und berechnet eine Note', () => {
    const examResults: ExamResult[] = [
      // Speicherreihenfolge: neueste zuerst (siehe examHistoryService.saveExamResult)
      { id: 'e1', docName: 'Klausur 3', timestamp: now, score: 90, passed: true, totalPoints: 100, achievedPoints: 90, weakTopics: [] },
      { id: 'e2', docName: 'Klausur 2', timestamp: now - DAY_MS, score: 50, passed: true, totalPoints: 100, achievedPoints: 50, weakTopics: [] },
      { id: 'e3', docName: 'Klausur 1', timestamp: now - 2 * DAY_MS, score: 40, passed: false, totalPoints: 100, achievedPoints: 40, weakTopics: [] },
    ];
    const profile = buildLearningProfile({ ...emptyInput, examResults });
    expect(profile.examPrognosis).not.toBeNull();
    expect(profile.examPrognosis!.basis).toBe(3);
    // gewichteter Score liegt näher an 90 (neueste, höchstes Gewicht) als am ungewichteten Mittel 60
    expect(profile.examPrognosis!.grade).not.toBe('5.0');
  });

  it('liefert null ohne Klausur-Historie', () => {
    const profile = buildLearningProfile(emptyInput);
    expect(profile.examPrognosis).toBeNull();
  });
});

describe('buildLearningProfile — Lerngewinn pro Methode', () => {
  it('berechnet improvementPerSession aus erster vs. letzter 3 Sessions', () => {
    // Speicherreihenfolge neueste zuerst: 90,85,80 (neu) ... 40,35,30 (alt) → klare Verbesserung
    const quizResults: QuizResult[] = [90, 85, 80, 60, 40, 35, 30].map((score, i) => ({
      id: `q${i}`, docId: 'd', docName: 'Doc', timestamp: now - i * DAY_MS, score,
      correctCount: 1, totalCount: 1, weakTopics: [], questions: [], answers: [],
    }));
    const profile = buildLearningProfile({ ...emptyInput, quizResults });
    const quiz = profile.perMethod.find(m => m.method === 'quiz');
    expect(quiz?.improvementPerSession).toBeGreaterThan(0);
  });

  it('liefert 0 unter der Mindestmenge von 4 Sessions', () => {
    const quizResults: QuizResult[] = [90, 40].map((score, i) => ({
      id: `q${i}`, docId: 'd', docName: 'Doc', timestamp: now - i * DAY_MS, score,
      correctCount: 1, totalCount: 1, weakTopics: [], questions: [], answers: [],
    }));
    const profile = buildLearningProfile({ ...emptyInput, quizResults });
    expect(profile.perMethod.find(m => m.method === 'quiz')?.improvementPerSession).toBe(0);
  });
});

describe('buildLearningProfile — Wissensprofil (Fragetyp)', () => {
  it('kombiniert Klausur-typeBreakdown und Quiz-Antworten unter gemeinsamem Label', () => {
    const examResults: ExamResult[] = [
      { id: 'e1', docName: 'K1', timestamp: now, score: 70, passed: true, totalPoints: 100, achievedPoints: 70, weakTopics: [], typeBreakdown: [{ type: 'fillblank', score: 40 }] },
    ];
    const questions: QuizQuestion[] = [
      { question: 'Q1', options: [], correctAnswerIndices: [0], isMultipleChoice: false, explanation: '', distractorExplanations: [], sourceReference: '', questionType: 'cloze' },
      { question: 'Q2', options: [], correctAnswerIndices: [0], isMultipleChoice: false, explanation: '', distractorExplanations: [], sourceReference: '', questionType: 'cloze' },
    ];
    const answers: UserAnswer[] = [
      { questionIndex: 0, selectedOptionIndices: [], isCorrect: true },
      { questionIndex: 1, selectedOptionIndices: [], isCorrect: false },
    ];
    const quizResults: QuizResult[] = [
      { id: 'q1', docId: 'd', docName: 'Doc', timestamp: now, score: 50, correctCount: 1, totalCount: 2, weakTopics: [], questions, answers },
    ];
    const profile = buildLearningProfile({ ...emptyInput, examResults, quizResults });
    // "fillblank" (Exam) und "cloze" (Quiz) müssen unter "Lückentext" zusammengeführt werden
    const lueckentext = profile.typeMastery.find(t => t.label === 'Lückentext');
    expect(lueckentext).toBeDefined();
    expect(lueckentext!.avgScore).toBe(Math.round((40 + 50) / 2));
  });
});

describe('buildLearningProfile — Ursachenanalyse', () => {
  it('meldet nur wirklich ausgelöste Ursachen, keine Platzhalter', () => {
    const examResults: ExamResult[] = [
      { id: 'e1', docName: 'K1', timestamp: now, score: 50, passed: false, totalPoints: 100, achievedPoints: 50, weakTopics: [], categoryBreakdown: [{ category: 'transfer', score: 30 }] },
    ];
    const profile = buildLearningProfile({ ...emptyInput, examResults });
    expect(profile.causeAnalysis.some(c => c.cause === 'Transferprobleme')).toBe(true);
    expect(profile.causeAnalysis.some(c => c.cause === 'Definitionsprobleme')).toBe(false);
  });

  it('erkennt Konzentrationsabfall erst ab zwei betroffenen Klausuren', () => {
    const examResults: ExamResult[] = [
      { id: 'e1', docName: 'K1', timestamp: now, score: 60, passed: true, totalPoints: 100, achievedPoints: 60, weakTopics: [], fatigue: { earlyScore: 80, lateScore: 40 } },
      { id: 'e2', docName: 'K2', timestamp: now - DAY_MS, score: 60, passed: true, totalPoints: 100, achievedPoints: 60, weakTopics: [], fatigue: { earlyScore: 85, lateScore: 50 } },
    ];
    const profile = buildLearningProfile({ ...emptyInput, examResults });
    expect(profile.causeAnalysis.some(c => c.cause.includes('Konzentrationsabfall'))).toBe(true);
  });

  it('liefert leere Liste ohne jeden Trigger', () => {
    const profile = buildLearningProfile(emptyInput);
    expect(profile.causeAnalysis).toEqual([]);
  });
});

describe('buildLearningProfile — Langzeit-Entwicklung', () => {
  it('liefert null unter 4 Klausuren', () => {
    const examResults: ExamResult[] = [1, 2, 3].map(i => ({
      id: `e${i}`, docName: `K${i}`, timestamp: now - i * DAY_MS, score: 50, passed: true, totalPoints: 100, achievedPoints: 50, weakTopics: [],
    }));
    const profile = buildLearningProfile({ ...emptyInput, examResults });
    expect(profile.longTermTrend).toBeNull();
  });

  it('vergleicht früheste vs. neueste Hälfte bei genug Klausuren', () => {
    // Speicherreihenfolge neueste zuerst: 90,85 (neu) ... 40,35 (alt)
    const examResults: ExamResult[] = [90, 85, 40, 35].map((score, i) => ({
      id: `e${i}`, docName: `K${i}`, timestamp: now - i * DAY_MS, score, passed: true, totalPoints: 100, achievedPoints: score, weakTopics: [],
    }));
    const profile = buildLearningProfile({ ...emptyInput, examResults });
    expect(profile.longTermTrend).not.toBeNull();
    const overall = profile.longTermTrend!.find(t => t.label === 'Klausurergebnisse');
    expect(overall?.delta).toBeGreaterThan(0);
  });
});

describe('buildLearningProfile — Motivations-Banner', () => {
  it('liefert immer einen nicht-leeren Satz, auch ohne Daten', () => {
    const profile = buildLearningProfile(emptyInput);
    expect(profile.motivationLine.length).toBeGreaterThan(0);
  });

  it('erkennt Verbesserung gegenüber vor zwei Wochen', () => {
    const quizResults: QuizResult[] = [
      { id: 'q1', docId: 'd', docName: 'Doc', timestamp: now - 1 * DAY_MS, score: 90, correctCount: 1, totalCount: 1, weakTopics: [], questions: [], answers: [] },
      { id: 'q2', docId: 'd', docName: 'Doc', timestamp: now - 2 * DAY_MS, score: 85, correctCount: 1, totalCount: 1, weakTopics: [], questions: [], answers: [] },
      { id: 'q3', docId: 'd', docName: 'Doc', timestamp: now - 15 * DAY_MS, score: 40, correctCount: 1, totalCount: 1, weakTopics: [], questions: [], answers: [] },
      { id: 'q4', docId: 'd', docName: 'Doc', timestamp: now - 18 * DAY_MS, score: 35, correctCount: 1, totalCount: 1, weakTopics: [], questions: [], answers: [] },
    ];
    const profile = buildLearningProfile({ ...emptyInput, quizResults });
    expect(profile.motivationLine).toBe('Du bist heute besser vorbereitet als vor zwei Wochen.');
  });
});

describe('buildLearningProfile — Wochentag-Insight', () => {
  it('liefert null ohne genug Sessions an einem Wochentag', () => {
    const profile = buildLearningProfile(emptyInput);
    expect(profile.dayOfWeek.bestDay).toBeNull();
    expect(profile.dayOfWeek.byDay).toEqual([]);
  });
});

describe('buildRealTopicMastery — echte Themen statt Dokumentnamen', () => {
  const mkQuestion = (topic?: string): QuizQuestion => ({
    question: `Frage zu ${topic ?? '?'}`, options: ['A', 'B'], correctAnswerIndices: [0],
    isMultipleChoice: false, explanation: '', distractorExplanations: [], sourceReference: '', topic,
  });
  const mkAnswer = (questionIndex: number, isCorrect: boolean): UserAnswer =>
    ({ questionIndex, selectedOptionIndices: [0], isCorrect });
  const mkQuiz = (id: string, pairs: { topic?: string; correct: boolean }[], weakTopics: string[] = []): QuizResult => ({
    id, docId: 'd1', docName: 'LERNSKRIPT überarbeitet.pdf', timestamp: now, score: 50,
    correctCount: pairs.filter(p => p.correct).length, totalCount: pairs.length, weakTopics,
    questions: pairs.map(p => mkQuestion(p.topic)),
    answers: pairs.map((p, i) => mkAnswer(i, p.correct)),
  });

  it('mittelt die Genauigkeit pro Thema aus Fragen und Antworten', () => {
    const quiz = mkQuiz('q1', [
      { topic: 'Konditionierung', correct: true },
      { topic: 'Konditionierung', correct: false },
      { topic: 'Gedächtnis', correct: true },
      { topic: 'Gedächtnis', correct: true },
    ]);
    const topics = buildRealTopicMastery([quiz], [], []);
    expect(topics.find(t => t.topic === 'Konditionierung')?.confidence).toBe(50);
    expect(topics.find(t => t.topic === 'Gedächtnis')?.confidence).toBe(100);
  });

  it('Dokumentnamen tauchen nie als Thema auf', () => {
    const quiz = mkQuiz('q1', [
      { topic: 'Motivation', correct: true },
      { topic: 'Motivation', correct: true },
    ]);
    const topics = buildRealTopicMastery([quiz], [], []);
    expect(topics.map(t => t.topic)).not.toContain('LERNSKRIPT überarbeitet.pdf');
  });

  it('Mindestschwelle: einzelne Frage ohne weitere Signale wird ignoriert', () => {
    const quiz = mkQuiz('q1', [{ topic: 'Randthema', correct: true }]);
    expect(buildRealTopicMastery([quiz], [], [])).toEqual([]);
  });

  it('weakTopics aus Klausuren verschärfen die Einstufung', () => {
    const quiz = mkQuiz('q1', [
      { topic: 'Neurotransmitter', correct: true },
      { topic: 'Neurotransmitter', correct: false },
    ]);
    const exams: ExamResult[] = [
      { id: 'e1', docName: 'Doc', timestamp: now, score: 40, passed: false, totalPoints: 10, achievedPoints: 4, weakTopics: ['Neurotransmitter', 'Neurotransmitter-Zusatz'] } as ExamResult,
    ];
    const topics = buildRealTopicMastery([quiz], exams, []);
    const nt = topics.find(t => t.topic === 'Neurotransmitter');
    expect(nt?.weakCount).toBe(1);
    expect(nt?.security).toBe('unsicher');
    // Nur über weakTopics bekannt → confidence 0
    expect(topics.find(t => t.topic === 'Neurotransmitter-Zusatz')?.confidence).toBe(0);
  });

  it('Recall-Scores fließen nur in bereits bekannte Themen ein', () => {
    const quiz = mkQuiz('q1', [
      { topic: 'Wahrnehmung', correct: true },
      { topic: 'Wahrnehmung', correct: true },
    ]);
    const recalls: RecallResult[] = [
      { id: 'r1', docName: 'Wahrnehmung', timestamp: now, score: 50, topic: 'Wahrnehmung', missingPoints: [] },
      { id: 'r2', docName: 'Skript.pdf', timestamp: now, score: 90, topic: 'Skript.pdf', missingPoints: [] },
    ];
    const topics = buildRealTopicMastery([quiz], [], recalls);
    expect(topics.find(t => t.topic === 'Wahrnehmung')?.confidence).toBe(75); // (100 + 50) / 2
    expect(topics.map(t => t.topic)).not.toContain('Skript.pdf');
  });

  it('Altdaten ohne questions/answers/topic crashen nicht', () => {
    const legacy = { id: 'q1', docId: 'd1', docName: 'Doc', timestamp: now, score: 50, correctCount: 1, totalCount: 2, weakTopics: [] } as unknown as QuizResult;
    expect(buildRealTopicMastery([legacy], [], [])).toEqual([]);
  });

  it('sortiert worst-first', () => {
    const quiz = mkQuiz('q1', [
      { topic: 'Stark', correct: true }, { topic: 'Stark', correct: true },
      { topic: 'Schwach', correct: false }, { topic: 'Schwach', correct: false },
    ]);
    const topics = buildRealTopicMastery([quiz], [], []);
    expect(topics[0].topic).toBe('Schwach');
  });
});

describe('buildDailyPlan — Heute solltest du', () => {
  const emptyProfile = buildLearningProfile(emptyInput);
  const base = { flowResult: null, realTopics: [] as TopicSecurity[], decks: [] as FlashcardDeck[], profile: emptyProfile };

  it('nutzt flowResult.next_actions als Primärquelle inkl. Dauer', () => {
    const flowResult = {
      next_actions: [
        { title: 'Quiz zu Motivation', module: 'quiz', timebox_minutes: 15, focus_topics: ['Motivation'], why: 'Schwaches Thema' },
        { title: 'Karten wiederholen', module: 'cards', timebox_minutes: 10, focus_topics: [], why: '' },
        { title: 'Klausur üben', module: 'exam', timebox_minutes: 25, focus_topics: [], why: '' },
        { title: 'Vierte Aktion', module: 'quiz', timebox_minutes: 5, focus_topics: [], why: '' },
      ],
    } as unknown as LearningFlowResult;
    const plan = buildDailyPlan({ ...base, flowResult });
    expect(plan).toHaveLength(3);
    expect(plan[0].minutes).toBe(15);
    expect(plan[0].target).toEqual({ kind: 'action', topic: 'Motivation', mode: 'quiz' });
    expect(plan[2].target).toEqual({ kind: 'tab', tab: ActiveTab.EXAM });
  });

  it('kaputtes flowResult (ohne next_actions) → deterministischer Fallback', () => {
    const broken = {} as LearningFlowResult;
    const plan = buildDailyPlan({ ...base, flowResult: broken });
    expect(plan.length).toBeGreaterThanOrEqual(1);
  });

  it('Fallback: fällige Karten kommen zuerst', () => {
    const decks: FlashcardDeck[] = [{
      id: 'd1', title: 'Deck',
      cards: [{ id: 'c1', front: 'F', back: 'B', level: 0, nextReview: 0 }], // ohne srs = fällig
    }];
    const plan = buildDailyPlan({ ...base, decks });
    expect(plan[0].title).toContain('fällige Karte');
    expect(plan[0].target).toEqual({ kind: 'tab', tab: ActiveTab.CARDS });
    expect(plan[0].minutes).toBeGreaterThanOrEqual(5);
  });

  it('Fallback: schwächstes echtes Thema als Quiz-Action', () => {
    const realTopics: TopicSecurity[] = [
      { topic: 'Konditionierung', confidence: 30, security: 'kritisch', weakCount: 2 },
    ];
    const plan = buildDailyPlan({ ...base, realTopics });
    const quizStep = plan.find(s => s.target.kind === 'action');
    expect(quizStep?.target).toEqual({ kind: 'action', topic: 'Konditionierung', mode: 'quiz' });
  });

  it('komplett leer → genau ein generischer Schritt', () => {
    const plan = buildDailyPlan(base);
    expect(plan.filter(s => s.title.includes('Klausursimulation')).length + plan.filter(s => s.title.includes('Quiz')).length).toBeGreaterThanOrEqual(1);
    expect(plan.length).toBeLessThanOrEqual(3);
    expect(plan.every(s => s.minutes > 0)).toBe(true);
  });
});

describe('buildMethodCommentary — deterministischer Methodenkommentar', () => {
  const mk = (method: string, avgScore: number, trend: 'up' | 'down' | 'stable' = 'stable') =>
    ({ method, avgScore, sessions: 5, trend, improvementPerSession: 0 }) as import('../types').MethodStat;

  it('null bei 0 Methoden', () => {
    expect(buildMethodCommentary([])).toBeNull();
  });

  it('eigener Satz bei nur einer Methode', () => {
    const c = buildMethodCommentary([mk('quiz', 80)]);
    expect(c).toContain('Quiz');
    expect(c).toContain('zweite Methode');
  });

  it('benennt die stärkste Methode und bleibt bei max. 2 Sätzen', () => {
    const c = buildMethodCommentary([mk('feynman', 85), mk('anki', 60)])!;
    expect(c).toContain('Feynman');
    expect(c).toContain('Anki'); // Abstand >= 15 → Übe-Empfehlung
    expect(c.split('. ').length).toBeLessThanOrEqual(2 + 1);
  });

  it('kleiner Abstand → "liegen nah beieinander"', () => {
    const c = buildMethodCommentary([mk('quiz', 72), mk('exam', 70)])!;
    expect(c).toContain('nah beieinander');
  });

  it('Trend-Satz wenn stärkste Methode aufwärts zeigt', () => {
    const c = buildMethodCommentary([mk('exam', 75, 'up'), mk('quiz', 70)])!;
    expect(c).toContain('Trend');
  });
});

describe('buildContextMotivation — datenbasierte Motivation', () => {
  const emptyProfile = buildLearningProfile(emptyInput);

  it('Inaktivität > 3 Tage hat höchste Priorität', () => {
    const c = buildContextMotivation(emptyProfile, now - 4 * DAY_MS);
    expect(c).toContain('Lernrhythmus');
  });

  it('positiver Trend → Trend-Satz', () => {
    const profile = { ...emptyProfile, perMethod: [{ method: 'quiz', avgScore: 80, sessions: 5, trend: 'up', improvementPerSession: 2 }] } as typeof emptyProfile;
    expect(buildContextMotivation(profile, now)).toContain('positiven Trend');
  });

  it('>= 3 kritische Themen → Fokus-Empfehlung', () => {
    const kritisch = { topic: 'X', confidence: 20, security: 'kritisch', weakCount: 3 } as const;
    const profile = { ...emptyProfile, topicMastery: [{ ...kritisch, topic: 'A' }, { ...kritisch, topic: 'B' }, { ...kritisch, topic: 'C' }] } as typeof emptyProfile;
    expect(buildContextMotivation(profile, now)).toContain('ein Thema');
  });

  it('gute Prognose → richtige Richtung', () => {
    const profile = { ...emptyProfile, examPrognosis: { grade: '2.0', passProbability: 82, basis: 3 } } as typeof emptyProfile;
    expect(buildContextMotivation(profile, now)).toContain('richtige Richtung');
  });

  it('Fallback ohne Signale, keine Erfolgsversprechen', () => {
    const c = buildContextMotivation(emptyProfile, now);
    expect(c.length).toBeGreaterThan(10);
    expect(c.toLowerCase()).not.toContain('bestehst');
    expect(c.toLowerCase()).not.toContain('garantiert');
  });
});
