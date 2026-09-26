
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
  /** Nur von buildRealTopicMastery gesetzt — aus der chronologischen Antwort-Historie
   *  hergeleitete Bloom-Stufe (services/bloomProgression.ts computeBloomStage). */
  bloomLevel?: BloomLevel;
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
  /** Kognitive Bloom-Stufe — von der KI direkt bei der Generierung self-gelabelt
   *  (kein zweiter Klassifikations-Call wie beim Klausursimulator, s. services/bloomProgression.ts).
   *  Steuert die adaptive Fragenauswahl innerhalb einer Session. */
  bloomLevel?: BloomLevel;
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
  /** Nur bei Multi-Dokument-Quizzes: Ursprungs-Dokument der Frage. Die KI
   *  liefert im Generierungs-Prompt nur die Quellnummer (sourceNumber), der
   *  Client übersetzt sie in ID+Name (services/multiDocSource.ts). Felder fehlen
   *  bewusst bei Single-Doc-/Altsessions — Badge erscheint dann einfach nicht. */
  sourceDocId?: string;
  sourceDocName?: string;
  /** Zwischenwert aus dem Generierungs-Call (1-basiert); nach attachMultiDocSources
   *  nicht mehr benötigt, bleibt aber in gespeicherten Sessions erhalten. */
  sourceNumber?: number;
}

/** Konkrete, einzeln wählbare Fragetypen (Basis + "Weitere Fragetypen"-Bereich in QuizSetup).
 *  Numeric/Szenario bleiben bewusst nur über 'mixed' erreichbar. */
export type ConcreteQuestionType = 'mc' | 'truefalse' | 'open' | 'matching' | 'cloze' | 'ranking';

export interface QuizConfig {
  /** 'mixed' = volle Palette (heutiges Verhalten). Sonst eine nicht-leere Liste
   *  konkreter Typen — auch bei genau einem gewählten Typ ein Array mit 1 Element,
   *  damit Einzel- und Mehrfachauswahl denselben Pfad nutzen. */
  questionType: 'mixed' | ConcreteQuestionType[];
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
  /** Eigene Schlagwörter (services/cardTags.ts). */
  tags?: string[];
  /** Aus der Wiederholung genommen, bis man sie wieder fortsetzt. */
  suspended?: boolean;
  /** Für heute zurückgestellt: erst ab diesem Zeitpunkt wieder fällig. */
  buriedUntil?: number;
  /** Problemkarte (oft vergessen, Anki: "leech"). */
  leech?: boolean;
  /** Bild verdecken (services/occlusion.ts): Bild, Rechtecke, gefragtes Rechteck. */
  occlusion?: import('./services/occlusion').OcclusionData;
  /** Storage-Pfade im Bucket card-images (services/cardImages.ts). */
  frontImage?: string;
  backImage?: string;
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
  /** Löschvermerke: Karten-ID → Zeitpunkt (ms). Verhindert, dass der Abgleich
   *  gelöschte Karten aus der Cloud oder von einem anderen Gerät zurückholt. */
  deletedCardIds?: Record<string, number>;
  /** Nur an Cloud-Zeilen: Stapel wurde gelöscht (Löschvermerk statt Zeile entfernen). */
  deletedAt?: number;
}

export interface ProcessedDocument {
  id: string;
  name: string;
  content: string;        // extrahierter Text (text/docx) oder leer; PDF/Bild liegen in Supabase Storage (storagePath), Base64 nur als Legacy-Fallback alter Nur-lokal-Dokumente
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
  READER = 'READER',
  KNOWLEDGE_GRAPH = 'KNOWLEDGE_GRAPH',
  ADMIN = 'ADMIN'
}

export enum QuizType {
  FAST = 'FAST',
  INTENSIVE = 'INTENSIVE',
  CUSTOM = 'CUSTOM'
}

// --- Onboarding -------------------------------------------------------------

/** Bildungsweg (Onboarding Schritt 2). 'other' = Sonstiges/Freitext. */
export type EducationPath = 'university' | 'school' | 'apprenticeship' | 'continuing_education' | 'self_directed' | 'other';

/**
 * Kontext-Antworten aus Onboarding Schritt 3 — ein einziges flaches, optionales
 * Feld-Set statt eines diskriminierten Unions pro Bildungsweg, damit spätere
 * Auswertung nicht pro Bildungsweg verzweigen muss. Nicht relevante Felder
 * bleiben schlicht undefined. ALLE Felder optional und überspringbar.
 */
export interface OnboardingContext {
  /** Studium: Studiengang / Schule: Klassenstufe / Ausbildung: Berufsbezeichnung / Weiterbildung: Thema / Selbstlerner: Lernfeld */
  subject?: string;
  /** Studium: Semester / Ausbildung: Lehrjahr */
  stage?: string;
  /** Aktuelles Modul/Fach/Lerninhalt */
  currentTopic?: string;
  /** Anstehende Prüfung/Zertifizierung — freier Text, kein erzwungenes Datumsfeld */
  upcomingExamAt?: string;
  /** Selbstlerner: "was erreichen?" */
  goalText?: string;
  /** Nur bei educationPath === 'other': freier Text ersetzt alle obigen Felder */
  freeText?: string;
}

export type OnboardingGoal =
  | 'exam_prep' | 'understand' | 'improve_performance' | 'efficiency'
  | 'retain_long_term' | 'new_skill' | 'unsure';

export type OnboardingChallenge =
  | 'understanding' | 'structure' | 'knowledge_gaps' | 'exam_confidence'
  | 'retention' | 'effectiveness' | 'motivation' | 'unsure';

/**
 * Vollständiges Onboarding-Ergebnis — Startpunkt der Personalisierung, nicht
 * deren Endzustand. `version` erlaubt spätere Schema-Migration; `challenges`
 * ist bewusst ein geordnetes Array (Reihenfolge = Priorität, max. 2), damit
 * eine spätere, hier NICHT gebaute adaptive Neubewertung aus echtem
 * Lernverhalten andocken kann, ohne die Form zu brechen.
 */
export interface OnboardingProfile {
  version: 1;
  educationPath?: EducationPath;
  context?: OnboardingContext;
  goals?: OnboardingGoal[];
  challenges?: OnboardingChallenge[];
  /** = challenges?.[0], denormalisiert für einfachen Zugriff ohne Index. */
  primaryChallenge?: OnboardingChallenge;
  completedAt?: number;
  /** true = Flow bis zur ersten Lernaktivität durchlaufen, false = irgendwo übersprungen/verlassen. */
  completedFully?: boolean;
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
  /** Fach (Collection-ID). Fehlt bei Altbestand, dann Zuordnung über den Namen (services/examTermService.ts). */
  collectionId?: string;
  /** Echte Klausurnote, nach dem Schreiben selbst eingetragen (DE "1.0"–"5.0", TR "AA"–"FF", s. services/gradeScale.ts). */
  grade?: string;
  /** Zeitpunkt der letzten Änderung — Konfliktauflösung beim Cloud-Merge (neuer gewinnt, s. mergeById). */
  updatedAt?: number;
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

/** Feste, wöchentlich wiederkehrende Lernsession (z.B. "jeden Montag Statistik").
 *  Bezieht sich per moduleId auf eine Collection aus der Bibliothek, oder trägt
 *  einen freien Fachnamen (customSubject), falls kein Modul gewählt wurde.
 *  skipDates unterdrückt einzelne Vorkommen, ohne die Regel selbst zu ändern
 *  (punktuelle Überschreibung eines Tages, s. CalendarStudySession). */
export interface RecurringStudySession {
  id: string;
  weekday: number; // 0=So..6=Sa (Date.getDay())
  moduleId?: string;
  customSubject?: string;
  topic: string;
  startTime: string;
  endTime: string;
  skipDates?: string[]; // YYYY-MM-DD
  /** Erstes Datum (YYYY-MM-DD), ab dem die Regel Vorkommen erzeugt — verhindert,
   *  dass eine neu angelegte Regel rückwirkend auch für bereits vergangene
   *  Wochentage Sessions zeigt. Undefined bei Altbestand vor diesem Feld =
   *  keine Einschränkung (bisheriges Verhalten bleibt erhalten). */
  startDate?: string;
}

/** Einmalige, an ein echtes Datum gebundene Lernsession — entweder frei angelegt,
 *  oder als punktuelle Überschreibung eines einzelnen Vorkommens einer
 *  RecurringStudySession (deren Datum dann zusätzlich in deren skipDates steht). */
export interface CalendarStudySession {
  id: string;
  date: string; // YYYY-MM-DD
  moduleId?: string;
  customSubject?: string;
  topic: string;
  startTime: string;
  endTime: string;
  /** Vom Smart-Plan erzeugt: ein neuer Plan ersetzt diese (künftigen) Sessions,
   *  statt sie zu verdoppeln. Fehlt bei manuell angelegten Sessions. */
  fromSmartPlan?: boolean;
}

/** Kognitive Bloom-Taxonomie-Stufe — wird NIE aus difficulty abgeleitet und umgekehrt,
 *  beides sind unabhängige Achsen (services/bloomPresets.ts). */
export type BloomLevel = 'erinnern' | 'verstehen' | 'anwenden' | 'analysieren' | 'bewerten' | 'erschaffen';

/** Klausurtyp-Preset mit eigenem Bloom-Zielprofil (services/bloomPresets.ts EXAM_TYPE_BLOOM_TARGETS). */
export type ExamTypePreset = 'wissensabfrage' | 'universitaetsklausur' | 'transfer' | 'gemischt';

/** Fehlertyp eines Distraktors bei quantitativen MC-Fragen (category "rechnung") —
 *  von Gemini bei der Generierung mitgeschätzt, services/geminiService.ts generateFullExam.
 *  Phase 1: nur generiert & gespeichert (ExamQuestion.distractorErrorTypes), noch NICHT
 *  in services/analysisValidation.ts / die Fehleranalyse verdrahtet. */
export type DistractorErrorType = 'sign_error' | 'calc_error' | 'formula_error' | 'wrong_operation' | 'other';

/** Quantitativer Modus (Klausursimulator, Phase 1 Mathe-Ausbau): weiches Ziel für die
 *  Verteilung der quant-relevanten Fragetypen — analog zu EXAM_TYPE_BLOOM_TARGETS eine
 *  Prompt-Gewichtung, KEINE exakte Vorgabe/Retry-Schleife. Werte sind relative Gewichte,
 *  keine Prozentangaben (wie bei EXAM_TYPE_WEIGHTS in geminiService.ts). */
export interface QuantTypeDistribution {
  mc: number;
  numeric: number;
  expression: number;
  truefalse: number;
  /** Rechenweg/Herleitung (Phase 2) — Schlüssel bewusst identisch zum ExamQuestion['type']-
   *  Token "step_by_step" (wie bei den übrigen 4 Feldern), keine separate Umbenennung. */
  step_by_step: number;
}

/** Konfiguration des "Quantitativ-Modus" im Klausur-Generator (ExamGenerator.tsx) —
 *  rein additiv: ist quantMode nicht gesetzt/aktiv, verhält sich alles wie vorher. */
export interface QuantModeConfig {
  enabled: boolean;
  /** Freitext-Fach, z.B. "Mathematik", "Statistik" — Presets nur Vorschläge, kein starres Enum. */
  subject?: string;
  /** Freitext-Themen, kommagetrennt. Leer/undefined = "aus Dokument erkennen" (bestehender
   *  Dokumentinhalt-Flow entscheidet, keine Themen extra vorgeben). */
  topics?: string;
  typeDistribution?: QuantTypeDistribution;
}

export interface ExamQuestion {
  id: string;
  question: string;
  type: 'mc' | 'open' | 'matching' | 'truefalse' | 'fillblank' | 'ranking' | 'numeric' | 'expression' | 'step_by_step';

  // MC & Szenario-MC
  options?: string[];
  correctIndices?: number[];
  scenarioText?: string;
  /** Quantitativer Modus (services/mathValidation.ts): pro Distraktor-Option (parallel
   *  zu options[], Länge/Reihenfolge identisch, korrekte Option(en) = null) ein von
   *  Gemini bei der Generierung mitgeschätzter Fehlertyp — Phase 2: wird jetzt bei
   *  falscher Antwort in ExamSystem.tsx autoEvaluate zu selectedDistractorErrorType
   *  aufgelöst und in die Fehleranalyse eingespeist (services/errorPool.ts fromExam). */
  distractorErrorTypes?: (DistractorErrorType | null)[];
  /** Phase 2: bei falscher MC-"Rechnung"-Antwort aus distractorErrorTypes[gewählterIndex]
   *  aufgelöst (ExamSystem.tsx autoEvaluate) — überlebt in ExamResult/History wie
   *  achievedPoints/feedback, Grundlage für das Fehlertyp-Label im Ergebnis-Modus
   *  (ExamView.tsx) und den Kontext-Hinweis in analyzeLearningProgress. */
  selectedDistractorErrorType?: DistractorErrorType | null;

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

  // Ausdruck / Term (Quantitativer Modus, type="expression") — Musterausdruck als
  // mathjs-parsbarer String (z.B. "3x^2+4x-5"), Bewertung per numerischem Sampling
  // statt Stringvergleich (services/mathValidation.ts checkExpressionEquivalence).
  /** Korrekter Ausdruck laut Musterlösung. */
  expressionAnswer?: string;
  /** Variablen, die beim Äquivalenz-Check substituiert werden — optional, wird sonst
   *  automatisch aus expressionAnswer/der Nutzereingabe erkannt (detectVariables). */
  expressionVariables?: string[];

  // Rechenweg / Herleitung (Quantitativer Modus Phase 2, type="step_by_step") — mehrschrittige
  // Herleitung/Rechnung, bewertet über MEHR als nur das Endergebnis: Ansatz, einzelne
  // Umformungsschritte, Fehler in konkreten Schritten, fehlende Schritte. Bewertung über
  // services/geminiService.ts evaluateStepByStep (gebatchter KI-Call, analog zu
  // evaluateWithRubric für type="open"), NICHT deterministisch in examScoring.ts.
  /** Musterlösung als Herleitung, EIN String pro Schritt — von Gemini bei der
   *  Generierung mitgeliefert (parallel zur Frage, nicht nachträglich erzeugt). */
  expectedSteps?: string[];
  /** Pro Schritt der (client-seitig aus userAnswer per Zeilenumbruch gesplitteten)
   *  Nutzereingabe ein Bewertungsurteil — vom evaluateStepByStep-Call geliefert, NUR
   *  im Ergebnis-Modus gerendert (ExamView.tsx), nie während mode="solve". errorType
   *  nutzt bewusst dieselben 5 Tokens wie distractorErrorTypes statt einer zweiten,
   *  parallelen Fehlertaxonomie. */
  stepFeedback?: { stepIndex: number; verdict: 'correct' | 'error' | 'missing'; note?: string; errorType?: DistractorErrorType }[];
  /** Ob der grundsätzliche Lösungsansatz/die Methode stimmte, unabhängig vom Endergebnis
   *  — von evaluateStepByStep geliefert (Gesamturteil, ergänzt die Pro-Schritt-Details). */
  correctApproach?: boolean;
  /** Ob das Endergebnis (letzte nicht-leere Zeile der Nutzereingabe) mit der Musterlösung
   *  übereinstimmt — von evaluateStepByStep geliefert, deterministisch vor-geprüft per
   *  checkNumericEquivalence/checkExpressionEquivalence als Hinweis an das Modell, wo
   *  möglich (services/mathValidation.ts), letztlich aber vom Modell zurückgegeben. */
  finalResultCorrect?: boolean;

  solution: string;
  points: number;
  /** Fachliches Thema der Aufgabe (1-3 Worte) — Grundlage für weakTopics & spätere adaptive Klausur */
  topic?: string;
  /** Fachliche Kategorie — Grundlage für die Kategorie-Aufschlüsselung nach der Klausur */
  category?: 'definition' | 'verstaendnis' | 'transfer' | 'beispiel' | 'rechnung' | 'fachbegriff';
  /** Tatsächliche Schwierigkeit DIESER Aufgabe — unabhängig vom Exam-weiten Ziel-Niveau,
   *  von der KI direkt bei der Generierung vergeben (generateFullExam). */
  difficulty?: 'leicht' | 'mittel' | 'schwer';
  /** Kognitive Bloom-Stufe — NICHT bei der Generierung vergeben, sondern erst danach über
   *  einen zweiten, unabhängigen Klassifikations-Call (geminiService.classifyBloomLevels),
   *  damit die KI sich nicht selbst beim Einordnen der eigenen Fragen überschätzt. */
  bloomLevel?: BloomLevel;
  userAnswer?: any;
  feedback?: string;
  achievedPoints?: number;

  // Rubrik-Bewertung (für type="open")
  /** Erwartungshorizont: bei der Generierung festgelegte Kriterien — die Korrektur bewertet exakt dagegen statt ad hoc.
   *  sourceReference: kurzer Beleg aus dem Material, der dieses Kriterium stützt (Phase 3 Klausursimulator 2.0) —
   *  optional, da nicht jedes Material eine saubere Textstelle für jedes Kriterium hergibt. */
  rubricCriteria?: { name: string; maxPoints: number; sourceReference?: string }[];
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

/** Wem die Feynman-Erklärung gilt; steuert, wie Verständlichkeit bewertet wird. */
export type FeynmanAudience = 'child' | 'peer' | 'exam';

export interface RecallEvaluation {
  score: number; // 0-100, nur inhaltliches Verständnis
  feedback: string;
  missingPoints: string[];
  strengths: string[];
  suggestedReview: string;
  /** Verständlichkeit für die gewählte Zielgruppe (0-100). */
  clarity?: number;
  /** Fachbegriffe, die für die Zielgruppe hätten erklärt werden müssen. */
  unexplainedJargon?: string[];
  usedExample?: boolean;
  /** Teilmenge von RecallChallenge.expectedKeywords, die abgedeckt wurde (auch per Synonym). */
  coveredKeywords?: string[];
  /** Nachfrage an der schwächsten Stelle; leer, wenn nichts offen ist. */
  probeQuestion?: string;
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

