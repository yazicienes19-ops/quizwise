
export interface Collection {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface ErrorPattern {
  pattern: string;
  description: string;
  count: number;
  concepts: string[];
  probableCause: string;
  textReference: string;
  recommendedAction: {
    type: 'kurze Erklärung' | '3 gezielte Übungsfragen' | 'Erstellung von Karteikarten' | 'Start einer geführten Study-Session';
    reasoning: string;
  };
}

export interface LearningAnalysis {
  errorPatterns: ErrorPattern[];
  topThreeTypes: ErrorPattern[];
  overallHealth: string;
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

export interface TopicMetric {
  id: string;
  topic: string;
  subject?: string;
  confidence: number;
  lastReviewed: number;
  totalAttempts: number;
  correctAttempts: number;
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
  RECALL = 'RECALL'
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
  userAnswer?: any;
  feedback?: string;
  achievedPoints?: number;

  // Rubrik-Bewertung (für type="open")
  criterionScores?: CriterionScore[];
  evaluationConfidence?: number;     // 0–100
  questionFeedback?: QuestionFeedbackType;
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
}

export interface ExplanationEvaluation {
  score: number;       // 0–100
  correct: string[];   // Was richtig erklärt wurde
  missing: string[];   // Was gefehlt hat
  wrong: string[];     // Was falsch war
  feedback: string;    // Gesamtfeedback (2–3 Sätze)
  nextSteps: string;   // Empfehlung was als nächstes gelernt werden sollte
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

