
export interface Collection {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export type RecommendedActionType = 'kurze Erklärung' | '3 gezielte Übungsfragen' | 'Erstellung von Karteikarten' | 'Start einer geführten Study-Session';

export interface ErrorPattern {
  pattern: string;
  description: string;
  /** Wird NIE vom Modell übernommen — clientseitig aus sourceErrorIds.length berechnet. */
  count: number;
  concepts: string[];
  probableCause: string;
  /** Deterministische Ursachen-Klassifikation der KI — legt über ein festes Mapping die Handlungsempfehlung fest (nicht die freie Wahl des Modells). */
  causeType: 'concept' | 'application' | 'recall' | 'structure';
  /** IDs der zugrunde liegenden Fehler (aus wrongAnswersCtx) — gegen die echte Fehlerliste geprüft, Grundlage für count und die Mindestschwelle. */
  sourceErrorIds: string[];
  recommendedAction: {
    /** Deterministisch über RECOMMENDED_ACTION_BY_CAUSE aus causeType abgeleitet — nie die freie Modellwahl. */
    type: RecommendedActionType;
    /** Nur gesetzt, wenn das Modell selbst einen anderen Typ vorschlug als das Mapping — Mapping gewinnt für `type`, der Modellvorschlag bleibt hier sichtbar. */
    secondaryType?: RecommendedActionType;
    reasoning: string;
  };
}

export interface LearningAnalysis {
  errorPatterns: ErrorPattern[];
  overallHealth: string;
}

// ─── Lern-Coach (Phase 1) ──────────────────────────────────────────────────────
// Deterministisch berechnetes Lernprofil (services/learningProfileService.ts)
// + KI-Synthese (generateCoachInsights).

export type LearnMethod = 'anki' | 'quiz' | 'feynman' | 'explainer' | 'exam';

export interface MethodStat {
  method: LearnMethod;
  avgScore: number;                       // 0–100
  sessions: number;
  trend: 'up' | 'down' | 'stable';
  improvementPerSession: number;          // Prozentpunkte Verbesserung, normiert auf Sessions (0 wenn zu wenig Daten)
}

export interface TypeMastery {
  type: string;                           // z.B. "mc", "open", "matching"
  label: string;                          // Anzeigename, z.B. "Multiple Choice"
  avgScore: number;                       // 0–100
  weakCount: number;                      // wie oft score < 60
}

export interface TopicSecurity {
  topic: string;
  confidence: number;                     // 0–100
  security: 'sicher' | 'unsicher' | 'kritisch';
  weakCount: number;                      // wie oft als Schwachstelle aufgetaucht
}

export type ExamCategory = 'definition' | 'verstaendnis' | 'transfer' | 'beispiel' | 'rechnung' | 'fachbegriff';

export interface CategoryMastery {
  category: ExamCategory;
  avgScore: number;                       // 0–100, über alle Klausuren gemittelt
  weakCount: number;                      // wie oft score < 60 in einer Klausur
}

export interface ForgettingItem {
  topic: string;
  dueInDays: number;                      // negativ = überfällig
  cardCount: number;
}

export interface TimeOfDayStat {
  part: 'Morgen' | 'Mittag' | 'Abend' | 'Nacht';
  avgScore: number;
  sessions: number;
}

export interface ExamPrognosis {
  grade: string;                          // deutsche Note, z.B. "2.3"
  passProbability: number;                // 0–100
  basis: number;                          // Anzahl Klausuren als Grundlage
}

export interface CauseAnalysisItem {
  cause: string;
  description: string;
}

export interface LongTermTrendItem {
  label: string;
  delta: number;                          // Prozentpunkte, + oder -
}

export interface DayOfWeekStat {
  day: 'Montag' | 'Dienstag' | 'Mittwoch' | 'Donnerstag' | 'Freitag' | 'Samstag' | 'Sonntag';
  avgScore: number;
  sessions: number;
}

export interface LearningProfile {
  perMethod: MethodStat[];
  topicMastery: TopicSecurity[];
  categoryMastery: CategoryMastery[];
  typeMastery: TypeMastery[];
  forgetting: ForgettingItem[];
  timeOfDay: { bestPart: TimeOfDayStat['part'] | null; byPart: TimeOfDayStat[] };
  dayOfWeek: { bestDay: DayOfWeekStat['day'] | null; byDay: DayOfWeekStat[] };
  examPrognosis: ExamPrognosis | null;
  causeAnalysis: CauseAnalysisItem[];
  longTermTrend: LongTermTrendItem[] | null;
  motivationLine: string;
  volume: { streakCurrent: number; streakBest: number; sessionsPerWeek: number; totalSessions: number };
}

export interface CoachInsights {
  synthesis: string[];
  connections: { a: string; b: string; reasoning: string }[];
  prognosis: { grade: string; passProbability: number; reasoning: string };
  forwardPrediction: string;
  methodInsight: string;
  recommendations: {
    action: string;
    tab: 'QUIZ' | 'CARDS' | 'RECALL' | 'EXAM' | 'EXPLAINER';
    reasoning: string;
    priority: 'hoch' | 'mittel' | 'niedrig';
  }[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndices: number[];
  isMultipleChoice: boolean;
  explanation: string;
  distractorExplanations: string[];
  sourceReference: string;
  topic?: string;
  difficulty?: 'leicht' | 'mittel' | 'schwer';
  learningGoal?: string;
  questionType?: 'mc' | 'single' | 'truefalse' | 'open' | 'matching' | 'cloze' | 'ranking' | 'numeric' | 'scenario';
  // Szenario-basiert (Fallbeispiel)
  scenarioText?: string;
  // Matching / Zuordnung
  matchPairs?: { left: string; right: string }[];
  // Lückentext
  clozeText?: string;
  clozeAnswers?: string[];
  // Ranking / Sortieren
  rankingItems?: string[];
  // Numerisch
  numericAnswer?: number;
  numericTolerance?: number;
}

export interface QuizConfig {
  questionType: 'mc' | 'truefalse' | 'open' | 'mixed' | 'matching' | 'cloze' | 'ranking';
  difficulty: 'leicht' | 'mittel' | 'schwer' | 'klausurnah';
  questionCount: number;
  focus: 'all' | 'weak';
  examMode: boolean;
  chapterContent?: string;  // pre-filtered chapter text; if set, overrides full-doc source
  chapterLabel?: string;    // display label for the selected chapters
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  level: number;
  nextReview: number;
  lastInterval?: number;
  srs?: import('./services/spacedRepetition').SrsState;
}

export interface FlashcardDeck {
  id: string;
  title: string;
  cards: Flashcard[];
  sourceDocumentId?: string;
}

export interface ProcessedDocument {
  id: string;
  name: string;
  content: string;        // base64 (PDF/Bild) oder extrahierter Text; leer wenn aus Storage noch nicht geladen
  type: 'pdf' | 'text' | 'docx' | 'image';
  mimeType?: string;      // nur für type='image': 'image/png', 'image/jpeg', 'image/webp'
  uploadDate: number;
  collectionId?: string;
  storagePath?: string;   // gesetzt wenn Datei in Supabase Storage liegt
  digestText?: string;    // KI-generierter Lerndigest — ersetzt Originaldatei für schnelle KI-Aufrufe
  digestStatus?: 'pending' | 'ready' | 'error';
}

export type MetricSource = 'quiz' | 'exam' | 'recall' | 'cards';

export interface TopicMetric {
  id: string;
  topic: string;
  subject?: string;
  /** Gewichtetes Aggregat der subScores (nach n je Quelle) — für Anzeige/Rückwärtskompatibilität. */
  confidence: number;
  lastReviewed: number;
  totalAttempts: number;
  correctAttempts: number;
  /** Pro Lernmethode ein eigener, adaptiv gewichteter Wert (α = 1/(n+1)); `confidence` ist deren gewichtetes Mittel. */
  subScores?: Partial<Record<MetricSource, { value: number; n: number }>>;
}

export enum ActiveTab {
  DASHBOARD = 'DASHBOARD',
  LIBRARY = 'LIBRARY',
  QUIZ = 'QUIZ',
  CARDS = 'CARDS',
  SEARCH = 'SEARCH',
  PLANNER = 'PLANNER',
  PAPER = 'PAPER',
  RADAR = 'RADAR',
  EXPLAINER = 'EXPLAINER',
  EXAM = 'EXAM',
  RECALL = 'RECALL',
  READER = 'READER'
}

export enum QuizType {
  FAST = 'FAST',
  INTENSIVE = 'INTENSIVE',
  CUSTOM = 'CUSTOM'
}

export type AgentType = 'lernCoach' | 'studyFlow' | 'erklaerer' | 'uxHelper';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AgentContext {
  metrics?: TopicMetric[];
  examTerms?: ExamTerm[];
  currentTab?: string;
}

export interface UserAnswer {
  questionIndex: number;
  selectedOptionIndices: number[];
  isCorrect: boolean;
  textAnswer?: string;
  matchAnswer?: Record<number, string>;  // leftIndex → gewählter right-Text
  clozeAnswer?: string[];
  numericAnswer?: number;
  rankingAnswer?: string[];
  /** Metakognitive Kalibrierung: Selbsteinschätzung vor Aufdeckung der Lösung (MC-artige Fragen, v1). */
  confidence?: 'sicher' | 'unsicher';
}

export interface SearchResult {
  title: string;
  authors: string;
  year: string;
  url: string;
  apaCitation: string;
  snippet: string;
  journal?: string;
  doi?: string;
  abstract?: string;
  openalex_id?: string;
  doi_url?: string;
  isWeb?: boolean;
}

export interface PaperOutlineSection {
  number: string;
  title: string;
  description: string;
  wordCount?: number;
  keyPoints?: string[];
  subsections?: { number: string; title: string; description: string }[];
}

export interface PaperFramework {
  fragestellung: string;
  thesis: string;
  outline: PaperOutlineSection[];
}

export interface AcademicSource extends SearchResult {
  id: string;
  type: 'article' | 'book' | 'other';
}

export type CitationStyle = 'APA' | 'MLA' | 'Harvard' | 'Chicago';

export interface MultiStyleCitation {
  apa: { entry: string; inTextKlammer: string; inTextNarrativ: string };
  mla: { entry: string; inText: string };
  harvard: { entry: string; inText: string; direct: string };
  chicago: { fullNote: string; shortNote: string; bibliography: string };
}

export interface StudyEntry {
  id: string;
  day: string;
  subject: string;
  topic: string;
  startTime: string;
  endTime: string;
  completed: boolean;
  color?: string;
  isAutoGenerated?: boolean;
}

export interface ExamTerm {
  id: string;
  title: string;
  date: string;
  topics: string[];
}

/** Datierter Kalender-Eintrag (localStorage 'study_events', cloud-synchronisiert).
 *  type 'review' + isAutoGenerated = automatisch geplante Spaced-Repetition-Session. */
export interface StudyEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (lokale Zeitzone)
  type: 'study' | 'reminder' | 'review';
  description?: string;
  isAutoGenerated?: boolean;
  sourceKind?: 'topic' | 'exam' | 'due';
  intervalStep?: number; // 1 | 3 | 7 (nur sourceKind 'topic')
}

export interface ExamQuestion {
  id: string;
  question: string;
  type: 'mc' | 'open' | 'matching' | 'truefalse' | 'fillblank' | 'ranking' | 'numeric';

  // MC & Szenario-MC
  options?: string[];
  correctIndices?: number[];
  scenarioText?: string;

  // Wahr/Falsch
  tfCorrect?: boolean;
  tfReasonOptions?: string[];
  tfCorrectReasonIndex?: number;

  // Zuordnung
  matchLeft?: string[];
  matchRight?: string[];
  matchCorrect?: number[];

  // Lückentext
  blankText?: string;
  blanks?: string[];

  // Ranking / Sortieren
  rankingItems?: string[];

  // Numerisch
  numericAnswer?: number;
  numericTolerance?: number;

  solution: string;
  points: number;
  /** Fachliches Thema der Aufgabe (1-3 Worte) — Grundlage für weakTopics & spätere adaptive Klausur */
  topic?: string;
  /** Fachliche Kategorie — Grundlage für die Kategorie-Aufschlüsselung nach der Klausur */
  category?: 'definition' | 'verstaendnis' | 'transfer' | 'beispiel' | 'rechnung' | 'fachbegriff';
  userAnswer?: any;
  feedback?: string;
  achievedPoints?: number;

  // Rubrik-Bewertung (für type="open")
  /** Erwartungshorizont: bei der Generierung festgelegte Kriterien — die Korrektur bewertet exakt dagegen statt ad hoc. */
  rubricCriteria?: { name: string; maxPoints: number }[];
  criterionScores?: CriterionScore[];
  evaluationConfidence?: number;     // 0–100
  questionFeedback?: QuestionFeedbackType;

  /** Pro Lücke (type="fillblank"): ob exakt, mit Tippfehler-Toleranz oder gar
   *  nicht getroffen — services/examScoring.ts scoreFillblank(). */
  blankMatchResults?: ('exact' | 'tolerant' | 'none')[];
}

// --- Rubrik & Bewertungsprofil ---

export interface CriterionScore {
  criterionId: string;
  criterionName: string;
  pointsAwarded: number;
  maxPoints: number;
  explanation: string;
  status: 'full' | 'partial' | 'none';
}

export type ScoringMode = 'strict' | 'standard' | 'lenient';

export interface ScoringProfile {
  mode: ScoringMode;
  emphases: ('terms' | 'understanding' | 'examples' | 'definitions')[];
}

export type QuestionFeedbackType =
  | 'correct'
  | 'too_strict'
  | 'too_lenient'
  | 'incomplete_solution'
  | 'unrealistic'
  | 'too_easy'
  | 'too_hard';

export interface ExamAnalysis {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  topicPerformance: { topic: string; score: number }[];
}

// --- Recall Types ---
export interface RecallChallenge {
  question: string;
  expectedKeywords: string[];
  conceptContext: string;
  /** Das abgefragte Thema in wenigen Worten — für History/Ausschlussliste. Fehlt bei Altdaten. */
  topic?: string;
}

export interface RecallEvaluation {
  score: number; // 0-100
  feedback: string;
  missingPoints: string[];
  strengths: string[];
  suggestedReview: string;
}

// --- Orchestrator Types ---

export interface NextAction {
  title: string;
  module: 'analyse' | 'quiz' | 'cards' | 'explain' | 'calendar' | 'exam';
  timebox_minutes: 5 | 10 | 15 | 25 | 45;
  focus_topics: string[];
  why: string;
}

export interface CalendarSuggestion {
  should_schedule: boolean;
  suggested_blocks: {
    day: string;
    start_time: string;
    duration_minutes: number;
    module: string;
    focus_topics: string[];
  }[];
}

export interface LearningFlowResult {
  updated_radar: {
    topic: string;
    status: 'schwach' | 'mittel' | 'stabil';
    priority: number;
    reason: string;
  }[];
  next_actions: NextAction[];
  calendar_suggestion: CalendarSuggestion;
  blocking_questions: { question: string; needed_field: string }[];
}

