import { Type } from "@google/genai";
import {
  QuizQuestion,
  Flashcard,
  SearchResult,
  PaperOutlineSection,
  AcademicSource,
  CitationStyle,
  StudyEntry,
  TopicMetric,
  LearningAnalysis,
  QuizType,
  FlashcardDeck,
  ExamQuestion,
  MultiStyleCitation,
  ExamTerm,
  LearningFlowResult,
  RecallChallenge,
  RecallEvaluation
} from "../types";

// ─── Backend-Verbindung ──────────────────────────────────────────────────────
import { supabase } from './supabaseClient';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

// Liest den aktuellen Login-Token aus der Supabase-Session
const getAuthHeader = async (): Promise<Record<string, string>> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Bitte zuerst einloggen.');
  return { 'Authorization': `Bearer ${session.access_token}` };
};

const callBackend = async (payload: {
  model?: string;
  parts: any[];
  systemInstruction?: string;
  config?: {
    responseMimeType?: string;
    responseSchema?: any;
    temperature?: number;
    thinkingConfig?: { thinkingBudget: number };
  };
  tools?: any[];
}): Promise<string> => {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${BACKEND_URL}/api/gemini/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unbekannter Server-Fehler' }));
    // Spezieller Fehler wenn Tageslimit erreicht
    if (res.status === 429) throw new Error('LIMIT_REACHED');
    throw new Error(err.error || `Server-Fehler: ${res.status}`);
  }

  const data = await res.json();
  return data.text || '';
};

// Profil + Nutzungsdaten vom Backend laden
export const fetchUserProfile = async () => {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${BACKEND_URL}/api/user/profile`, {
    headers: { ...authHeader },
  });
  if (!res.ok) return null;
  return res.json();
};

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────
export const getApiKey = (): string => localStorage.getItem('gemini_api_key') || '';
export const hasApiKey = (): boolean => true; // Key lebt jetzt auf dem Server

export interface GenerationSource {
  text?: string;
  file?: { data: string; mimeType: string; };
  storagePath?: string;  // Supabase Storage Pfad — Backend lädt die Datei direkt
  mimeType?: string;     // Benötigt wenn storagePath gesetzt: 'application/pdf', 'image/png' etc.
}

// Wandelt eine GenerationSource in ein Gemini-Part um
const sourceTopart = (source: GenerationSource): any => {
  if (source.file) return { inlineData: { data: source.file.data, mimeType: source.file.mimeType } };
  if (source.text) return { text: source.text };
  if (source.storagePath) return { storageRef: { path: source.storagePath, mimeType: source.mimeType || 'application/pdf' } };
  throw new Error('Kein Inhalt in der Quelle — weder Datei noch Text noch storagePath.');
};

// ─── System-Prompts ──────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `Du bist ein hochqualifizierter akademischer Lernassistent.
DEINE STRENGSTE REGEL: Erfinde NIEMALS Quellen, DOIs, Autoren oder Veröffentlichungsdaten.
Nutze für die Recherche ausschließlich reale Daten, die du über das Grounding Tool (Google Search) verifizieren kannst.
Wenn du keine 10 Ergebnisse findest, gib nur die real existierenden zurück.
Antworte bei Recherchen ausschließlich im vorgegebenen JSON-Format.`;

const ORCHESTRATOR_INSTRUCTION = `Du bist der Lernfluss-Orchestrator von QuizWise.
Ziel: Verbinde die Module so, dass nach jeder Nutzeraktion automatisch die sinnvollsten nächsten Schritte entstehen.
Priorisiere Active Recall + Spaced Repetition + Fehleranalyse.
Nutze ausschließlich bereitgestellte Daten.
GIB IMMER NUR STRIKTES JSON ZURÜCK.`;

// ─── Feature-Funktionen ──────────────────────────────────────────────────────

export const generateRecallChallenge = async (source: GenerationSource): Promise<RecallChallenge> => {
  const parts: any[] = [sourceTopart(source)];

  parts.push({ text: `Erzeuge eine Active-Recall-Herausforderung nach der Feynman-Technik.

STRENGE REGEL: Verwende AUSSCHLIESSLICH Inhalte aus dem oben bereitgestellten Dokument. Kein Allgemeinwissen, keine Ergänzungen aus dem Internet, keine Erfindungen. Wenn das Dokument zu einem Thema schweigt, stelle keine Frage dazu.

Die Frage soll tiefes Verständnis prüfen — Zusammenhänge, Ursachen und Bedeutung, nicht bloßes Faktenwissen.

Liefere:
- question: Eine Erklärungsfrage die nur mit dem Dokument beantwortet werden kann
- expectedKeywords: Die 6-10 zentralen Begriffe aus dem Dokument die in einer vollständigen Antwort vorkommen sollten
- conceptContext: 4-6 Sätze was eine vollständige Antwort laut Dokument enthalten muss — Kernaussagen, Zusammenhänge, Beispiele aus dem Material` });

  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts,
    config: {
      temperature: 0.5,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          expectedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          conceptContext: { type: Type.STRING }
        },
        required: ['question', 'expectedKeywords', 'conceptContext']
      }
    }
  });
  return JSON.parse(text || '{}');
};

export const evaluateRecallResponse = async (challenge: RecallChallenge, userAnswer: string, source: GenerationSource): Promise<RecallEvaluation> => {
  const parts: any[] = [sourceTopart(source)];

  parts.push({ text: `Bewerte diese Feynman-Antwort präzise und direkt. Auf Deutsch.

Das obige Dokument ist die einzige Quelle der Wahrheit — prüfe die Nutzerantwort direkt dagegen.
Frage: "${challenge.question}"
Kernbegriffe: ${challenge.expectedKeywords.join(', ')}
Nutzerantwort: "${userAnswer}"

Regeln: Synonyme und eigene Formulierungen zählen voll. Prüfe Verständnis (Zusammenhänge, Ursachen), nicht nur Faktenwissen. Kurze präzise Antwort > lange vage Antwort.
Score: 0–30 kaum Verständnis | 31–60 Grundverständnis | 61–85 gut | 86–100 exzellent
feedback: 2 Sätze spezifisch — was genau gut, was genau fehlt. Keine Phrasen wie "Gut gemacht".
missingPoints: Nur Punkte die laut Dokument wirklich fehlen — keine Punkte die anders formuliert vorhanden sind.
strengths: Spezifisch was verstanden wurde.
suggestedReview: Welches Teilkonzept wiederholen und warum.` });

  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts,
    config: {
      temperature: 0.3,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          missingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedReview: { type: Type.STRING }
        },
        required: ['score', 'feedback', 'missingPoints', 'strengths', 'suggestedReview']
      }
    }
  });
  return JSON.parse(text || '{}');
};

export const orchestrateLearningFlow = async (
  activity: { type: 'quiz' | 'cards' | 'exam' | 'recall', result: any },
  radarState: TopicMetric[],
  calendarState: { entries: StudyEntry[], exams: ExamTerm[] }
): Promise<LearningFlowResult> => {
  const context = {
    activity_type: activity.type,
    activity_result: activity.result,
    radar_state: radarState.map(m => ({ topic: m.topic, confidence: m.confidence, last_reviewed: m.lastReviewed })),
    calendar_state: { planned_sessions: calendarState.entries.length, upcoming_exams: calendarState.exams }
  };

  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts: [{ text: `Analysiere folgende Lernaktivität und erzeuge den 'Next Best Actions'-Plan:
  ${JSON.stringify(context)}
  FORMATREGELN: max. 3 next_actions. Falls Lücken vorhanden (>30% Fehler), schlage einen Kalenderblock vor.` }],
    systemInstruction: ORCHESTRATOR_INSTRUCTION,
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          updated_radar: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING }, status: { type: Type.STRING },
                priority: { type: Type.NUMBER }, reason: { type: Type.STRING }
              },
              required: ['topic', 'status', 'priority', 'reason']
            }
          },
          next_actions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING }, module: { type: Type.STRING },
                timebox_minutes: { type: Type.NUMBER },
                focus_topics: { type: Type.ARRAY, items: { type: Type.STRING } },
                why: { type: Type.STRING }
              },
              required: ['title', 'module', 'timebox_minutes', 'focus_topics', 'why']
            }
          },
          calendar_suggestion: {
            type: Type.OBJECT,
            properties: {
              should_schedule: { type: Type.BOOLEAN },
              suggested_blocks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: { type: Type.STRING }, start_time: { type: Type.STRING },
                    duration_minutes: { type: Type.NUMBER }, module: { type: Type.STRING },
                    focus_topics: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ['day', 'start_time', 'duration_minutes', 'module', 'focus_topics']
                }
              }
            },
            required: ['should_schedule', 'suggested_blocks']
          },
          blocking_questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { question: { type: Type.STRING }, needed_field: { type: Type.STRING } }
            }
          }
        },
        required: ['updated_radar', 'next_actions', 'calendar_suggestion', 'blocking_questions']
      }
    }
  });
  return JSON.parse(text || '{}');
};

export const searchWeb = async (query: string): Promise<{ results: SearchResult[] }> => {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${BACKEND_URL}/api/search/web?query=${encodeURIComponent(query)}`, {
    headers: { ...authHeader },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Suchfehler' }));
    throw new Error(err.error || `Suchfehler: ${res.status}`);
  }
  const data = await res.json();
  return { results: data.results || [] };
};

export const searchScholar = async (query: string): Promise<{ text: string, results: SearchResult[] }> => {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${BACKEND_URL}/api/search/scholar?query=${encodeURIComponent(query)}`, {
    headers: { ...authHeader },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Suchfehler' }));
    throw new Error(err.error || `Suchfehler: ${res.status}`);
  }
  const data = await res.json();
  return { text: '', results: data.results || [] };
};

export const generateSmartStudyPlan = async (metrics: TopicMetric[], decks: FlashcardDeck[], exams: ExamTerm[]): Promise<StudyEntry[]> => {
  const context = {
    knowledgeGaps: metrics.filter(m => m.confidence < 70).map(m => ({ topic: m.topic, confidence: m.confidence })),
    flashcardStatus: decks.map(d => ({ title: d.title, dueCards: d.cards.filter(c => c.nextReview <= Date.now() || c.level === 0).length })),
    upcomingExams: exams
  };

  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts: [{ text: `Erstelle einen intelligenten Wochen-Lernplan (Montag bis Sonntag) basierend auf diesen Daten:
  ${JSON.stringify(context)}
  ANFORDERUNGEN:
  1. Plane täglich 2-3 Sessions zwischen 08:00 und 20:00 Uhr.
  2. Priorisiere Themen mit niedriger confidence (Wissenslücken).
  3. Berücksichtige die Prüfungstermine.
  4. Weise jeder Session eine Farbe zu (emerald, blue, purple, rose).
  5. Sessions: 60 bis 120 Minuten.
  GIB NUR DAS JSON-ARRAY ZURÜCK.` }],
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING }, day: { type: Type.STRING },
            subject: { type: Type.STRING }, topic: { type: Type.STRING },
            startTime: { type: Type.STRING }, endTime: { type: Type.STRING },
            color: { type: Type.STRING }, completed: { type: Type.BOOLEAN }
          },
          required: ['id', 'day', 'subject', 'topic', 'startTime', 'endTime', 'color', 'completed']
        }
      }
    }
  });
  return JSON.parse(text || '[]').map((entry: any) => ({ ...entry, isAutoGenerated: true }));
};

export const generateQuizFromDocument = async (
  source: GenerationSource,
  quizType: QuizType = QuizType.FAST,
  options?: {
    customCount?: number;
    customDifficulty?: string;
    customFocus?: string;
    questionType?: 'mc' | 'truefalse' | 'open' | 'mixed';
    excludeTopics?: string[];
  }
): Promise<QuizQuestion[]> => {
  const parts: any[] = [sourceTopart(source)];

  let count: number;
  let difficulty: string;
  let focusLine = '';

  if (quizType === QuizType.CUSTOM && options) {
    count = options.customCount ?? 10;
    difficulty = options.customDifficulty ?? 'mittel';
    focusLine = options.customFocus ? `\nSchwerpunkt: ${options.customFocus}` : '';
  } else if (quizType === QuizType.INTENSIVE) {
    count = 17;
    difficulty = 'mittel bis schwer';
  } else {
    count = 7;
    difficulty = 'leicht bis mittel';
  }

  const qt = options?.questionType ?? 'mixed';
  let typeInstruction: string;
  if (qt === 'mc') {
    typeInstruction = 'FRAGETYP: Erstelle AUSSCHLIESSLICH Multiple-Choice-Fragen (isMultipleChoice: true, 2-3 korrekte Antworten aus 4 Optionen).';
  } else if (qt === 'truefalse') {
    typeInstruction = 'FRAGETYP: Erstelle NUR Wahr/Falsch-Fragen. options MUSS genau ["Wahr", "Falsch"] sein. isMultipleChoice: false. correctAnswerIndices: [0] für wahr, [1] für falsch. questionType: "truefalse".';
  } else if (qt === 'open') {
    typeInstruction = 'FRAGETYP: Erstelle AUSSCHLIESSLICH offene Fragen. options: [] (leeres Array). correctAnswerIndices: []. isMultipleChoice: false. Die vollständige Musterantwort steht in explanation. questionType: "open".';
  } else {
    typeInstruction = 'FRAGETYP: Gemischt — ca. 60% Multiple-Choice (mehrere korrekte Antworten), 25% Single-Choice, 15% Wahr/Falsch.';
  }

  const quizSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctAnswerIndices: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        isMultipleChoice: { type: Type.BOOLEAN },
        explanation: { type: Type.STRING },
        distractorExplanations: { type: Type.ARRAY, items: { type: Type.STRING } },
        sourceReference: { type: Type.STRING },
        topic: { type: Type.STRING },
        difficulty: { type: Type.STRING },
        questionType: { type: Type.STRING }
      },
      required: ['question', 'options', 'correctAnswerIndices', 'isMultipleChoice', 'explanation', 'sourceReference']
    }
  };

  const excludeTopics = options?.excludeTopics ?? [];
  const excludeLine = excludeTopics.length > 0
    ? `\nBEREITS ABGEFRAGT — diese Themen NICHT nochmal verwenden (wähle andere Aspekte des Materials):\n${excludeTopics.slice(-40).join(' | ')}\n`
    : '';

  const BLOOM_VERBS = ['Definiere', 'Erkläre', 'Vergleiche', 'Unterscheide', 'Wende an', 'Analysiere', 'Bewerte', 'Nenne', 'Warum', 'Wie unterscheidet sich'];

  const buildRequest = (batchCount: number, seedSuffix: string, focusHint: string) => {
    const batchParts: any[] = [sourceTopart(source)];
    batchParts.push({ text: `Erstelle ein Quiz mit genau ${batchCount} Fragen basierend auf dem Material.
Schwierigkeit: ${difficulty}.${focusLine}
Seed: ${seedSuffix}
${focusHint}${excludeLine}
${typeInstruction}

STRENGE DIVERSITÄTS-REGELN (zwingend einhalten):
1. Jede Frage MUSS ein komplett anderes Unterthema abdecken — kein Thema darf auch nur ähnlich zweimal vorkommen
2. Verteile die Fragen auf ALLE Abschnitte/Kapitel des Materials, nicht nur die Hauptthemen
3. Starte jede Frage mit einem anderen Verb aus dieser Liste: ${BLOOM_VERBS.join(', ')}
4. Wechsle die kognitive Ebene pro Frage: Wissen → Verstehen → Anwenden → Analysieren → Bewerten → wieder von vorne
5. Fragen die logisch ähnlich oder Umformulierungen voneinander sind, sind verboten

ANTWORTOPTIONEN-REGELN (zwingend einhalten):
6. Alle 4 Antwortoptionen MÜSSEN gleich lang sein — gleiche Anzahl Wörter (±3 Wörter Toleranz)
7. Die richtige Antwort darf sich nicht durch Länge, Stil oder Formulierungsmuster von den falschen unterscheiden
8. Keine offensichtlich falschen Distraktoren — alle Optionen müssen plausibel klingen

Zu jeder Frage: korrekte Antwort-Indices (Array), Boolean ob Multiple-Choice, Erklärung, Textbezug, Thema und Schwierigkeitsgrad.` });
    return callBackend({
      model: 'gemini-2.5-flash',
      parts: batchParts,
      config: { temperature: 1.0, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json', responseSchema: quizSchema }
    });
  };

  // Intensive: 2 parallele Requests (9+8) für ~halbe Wartezeit
  if (quizType === QuizType.INTENSIVE) {
    const seed1 = Math.random().toString(36).slice(2, 8);
    const seed2 = Math.random().toString(36).slice(2, 8);
    const [text1, text2] = await Promise.all([
      buildRequest(9, seed1, 'Fokus: erste Hälfte und Grundlagen des Materials.'),
      buildRequest(8, seed2, 'Fokus: zweite Hälfte und Vertiefungsthemen des Materials.'),
    ]);
    const q1: QuizQuestion[] = JSON.parse(text1 || '[]');
    const q2: QuizQuestion[] = JSON.parse(text2 || '[]');
    return [...q1, ...q2];
  }

  const text = await buildRequest(count, Math.random().toString(36).slice(2, 8), '');
  return JSON.parse(text || '[]');
};

export const generateFlashcardsFromDocument = async (source: GenerationSource, count: number = 15, excludeTerms: string[] = []): Promise<Partial<Flashcard>[]> => {
  const parts: any[] = [sourceTopart(source)];
  const excludeLine = excludeTerms.length > 0
    ? `\nBEREITS ERSTELLT — diese Begriffe/Konzepte NICHT nochmal verwenden: ${excludeTerms.slice(-30).join(' | ')}\n`
    : '';
  parts.push({ text: `Erstelle ${count} hochwertige Karteikarten basierend auf dem Material.
${excludeLine}
STRENGE DIVERSITÄTS-REGELN:
1. Jede Karte deckt einen ANDEREN Begriff, ein anderes Konzept oder eine andere Theorie ab
2. Verteile die Karten gleichmäßig über ALLE Abschnitte/Kapitel — nicht nur die prominentesten Themen
3. Mische Kartentypen: Definition, Unterschied (A vs B), Anwendung, Ursache/Wirkung, Aufzählung
4. Vorderseite: präzise Frage oder Begriff — Rückseite: vollständige prägnante Antwort (2-4 Sätze)
5. Vermeide Karten die dasselbe Thema nur anders formulieren` });

  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts,
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING },
            back: { type: Type.STRING }
          },
          required: ['front', 'back']
        }
      }
    }
  });
  return JSON.parse(text || '[]');
};

export const generateQuizFromFlashcards = async (deck: FlashcardDeck): Promise<QuizQuestion[]> => {
  const cardsJson = JSON.stringify(deck.cards.map(c => ({ q: c.front, a: c.back })));

  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts: [{ text: `Erstelle ein Quiz aus diesen Karteikarten: ${cardsJson}` }],
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswerIndices: { type: Type.ARRAY, items: { type: Type.INTEGER } },
            isMultipleChoice: { type: Type.BOOLEAN },
            explanation: { type: Type.STRING },
            sourceReference: { type: Type.STRING }
          },
          required: ['question', 'options', 'correctAnswerIndices', 'isMultipleChoice', 'explanation', 'sourceReference']
        }
      }
    }
  });
  return JSON.parse(text || '[]');
};

export const generatePaperOutline = async (topic: string, focus: string, sources: GenerationSource[]): Promise<PaperOutlineSection[]> => {
  const parts: any[] = [];
  sources.forEach(s => parts.push(sourceTopart(s)));
  parts.push({ text: `Erstelle eine wissenschaftliche Gliederung für eine Hausarbeit zum Thema: "${topic}". Fokus: "${focus}". Basierend auf den bereitgestellten Quellen.` });

  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts,
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ['title', 'description']
        }
      }
    }
  });
  return JSON.parse(text || '[]');
};

export const formatCitation = async (source: AcademicSource, style: CitationStyle): Promise<string> => {
  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts: [{ text: `Formatiere folgende Quelle im ${style}-Stil:
  Titel: ${source.title}, Autoren: ${source.authors}, Jahr: ${source.year}, Journal: ${source.journal}, URL/DOI: ${source.url}
  Gib ausschließlich den formatierten Zitations-String zurück.` }]
  });
  return text;
};

export const magicFormatCitation = async (input: string): Promise<MultiStyleCitation> => {
  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts: [{ text: `Extrahiere bibliographische Informationen aus diesem Textfragment und erstelle Zitationen in verschiedenen Stilen: "${input}"` }],
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          apa: {
            type: Type.OBJECT,
            properties: { entry: { type: Type.STRING }, inTextKlammer: { type: Type.STRING }, inTextNarrativ: { type: Type.STRING } },
            required: ['entry', 'inTextKlammer', 'inTextNarrativ']
          },
          mla: {
            type: Type.OBJECT,
            properties: { entry: { type: Type.STRING }, inText: { type: Type.STRING } },
            required: ['entry', 'inText']
          },
          harvard: {
            type: Type.OBJECT,
            properties: { entry: { type: Type.STRING }, inText: { type: Type.STRING }, direct: { type: Type.STRING } },
            required: ['entry', 'inText', 'direct']
          },
          chicago: {
            type: Type.OBJECT,
            properties: { fullNote: { type: Type.STRING }, shortNote: { type: Type.STRING }, bibliography: { type: Type.STRING } },
            required: ['fullNote', 'shortNote', 'bibliography']
          }
        },
        required: ['apa', 'mla', 'harvard', 'chicago']
      }
    }
  });
  return JSON.parse(text || '{}');
};

export interface WrongAnswerContext {
  question: string;
  topic?: string;
  explanation: string;
  docName: string;
}

export const analyzeLearningProgress = async (
  metrics: TopicMetric[],
  wrongAnswers: WrongAnswerContext[] = []
): Promise<LearningAnalysis> => {
  const metricsText = JSON.stringify(
    metrics.map(m => ({ thema: m.topic, konfidenz: m.confidence + '%', versuche: m.totalAttempts }))
  );
  const wrongText = wrongAnswers.length > 0
    ? `\n\nFalsch beantwortete Fragen (${wrongAnswers.length} Stück, wichtig für Fehlermuster):\n` +
      wrongAnswers.map((w, i) =>
        `${i + 1}. [${w.topic || 'Allgemein'}] "${w.question}"\n   Richtige Erklärung: ${w.explanation}`
      ).join('\n\n')
    : '';

  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts: [{ text: `Analysiere den Lernfortschritt eines Studenten auf Deutsch.\n\nThemen-Konfidenz: ${metricsText}${wrongText}\n\nIdentifiziere konkrete Fehlermuster aus den echten Fragen (z.B. "Begriffsverwechslungen", "Konzeptuelle Lücken"), gib gezielte Lernempfehlungen und eine psychologische Gesamteinschätzung.` }],
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallHealth: { type: Type.STRING },
          errorPatterns: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pattern: { type: Type.STRING }, description: { type: Type.STRING },
                count: { type: Type.NUMBER }, concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                probableCause: { type: Type.STRING },
                recommendedAction: {
                  type: Type.OBJECT,
                  properties: { type: { type: Type.STRING }, reasoning: { type: Type.STRING } },
                  required: ['type', 'reasoning']
                }
              },
              required: ['pattern', 'description', 'count', 'concepts', 'probableCause', 'recommendedAction']
            }
          },
          topThreeTypes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { pattern: { type: Type.STRING }, description: { type: Type.STRING } }
            }
          }
        },
        required: ['overallHealth', 'errorPatterns', 'topThreeTypes']
      }
    }
  });
  return JSON.parse(text || '{}');
};

export const generateExplanation = async (
  source: GenerationSource | null,
  concept: string,
  useExternalKnowledge: boolean
): Promise<string> => {
  if (!useExternalKnowledge && !source?.file && !source?.text && !source?.storagePath) {
    throw new Error('Kein Dokument übergeben — externe Quellen sind deaktiviert.');
  }

  const parts: any[] = [];
  if (source) parts.push(sourceTopart(source));

  if (!useExternalKnowledge) {
    parts.push({ text: `Erkläre das Konzept "${concept}" ausschließlich basierend auf dem oben bereitgestellten Dokument.
STRENGE REGEL: Verwende NUR Inhalte aus dem Dokument. Kein Allgemeinwissen, keine externen Quellen, keine Erfindungen. Wenn das Dokument zu "${concept}" nichts enthält, sage das klar.
Strukturiere in 3 Stufen: Grundlagen, Vertiefung und Kontext. Antworte auf Deutsch.` });
  } else if (source) {
    parts.push({ text: `Erkläre das Konzept "${concept}".
Nutze das oben bereitgestellte Dokument als primäre Quelle. Ergänze mit deinem Allgemeinwissen wo das Dokument lückenhaft ist — kennzeichne solche Ergänzungen mit "Allgemeinwissen:".
Strukturiere in 3 Stufen: Grundlagen, Vertiefung und Kontext. Antworte auf Deutsch.` });
  } else {
    parts.push({ text: `Erkläre das Konzept "${concept}" umfassend aus deinem Allgemeinwissen.
Strukturiere in 3 Stufen: Grundlagen, Vertiefung und Kontext. Antworte auf Deutsch.` });
  }

  return callBackend({
    model: 'gemini-2.5-flash',
    parts,
    config: { temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
  });
};

export const generateFullExam = async (content: GenerationSource, style?: GenerationSource, options?: { count: number, difficulty: string }): Promise<ExamQuestion[]> => {
  const parts: any[] = [sourceTopart(content)];

  if (style) {
    if (style.text) parts.push({ text: `Nutze diesen STIL für die Prüfung: ${style.text}` });
    else parts.push(sourceTopart(style));
  }

  const count      = options?.count || 10;
  const difficulty = options?.difficulty || 'mittel';

  const mcCount      = Math.max(1, Math.round(count * 0.30));
  const matchCount   = Math.max(1, Math.round(count * 0.20));
  const tfCount      = Math.max(1, Math.round(count * 0.20));
  const fillCount    = Math.max(0, Math.round(count * 0.10));
  const openCount    = Math.max(1, count - mcCount - matchCount - tfCount - fillCount);

  const seed = Math.random().toString(36).slice(2, 8);

  parts.push({ text: `Erstelle eine akademische Klausur mit genau ${count} Aufgaben auf Niveau "${difficulty}".
Zufalls-Seed: ${seed}

FRAGETYPEN-VERTEILUNG (zwingend einhalten, Summe = ${count}):
- ${mcCount} MC / Szenario-MC (type "mc"): Entweder klassische Faktenabfrage ODER Fallbeispiel im Fragetext (Situation beschreiben, dann Frage). options[]: genau 4 Antworten. correctIndices[]: Indizes der richtigen Antworten (1-3 korrekte). solution: kurze Begründung. Punkte: 2-4.
- ${matchCount} Zuordnung (type "matching"): matchLeft[] + matchRight[] je 4 Einträge (Paare). matchCorrect[]: Für jedes matchLeft[i] der Index in matchRight (0-3). Beispiel Psychologie: Konzepte ↔ Definitionen, Forscher ↔ Theorien. options[]: leer. solution: korrekte Zuordnungen als Text. Punkte: 4-6.
- ${tfCount} Wahr/Falsch (type "truefalse"): tfCorrect: true oder false. tfReasonOptions[]: genau 3 Antwortoptionen warum die Aussage wahr/falsch ist. tfCorrectReasonIndex: Index (0-2) der richtigen Begründung. options[]: leer. solution: Erklärung. Punkte: 2-3.
- ${fillCount} Lückentext (type "fillblank"): blankText: Satz/Formel mit [LÜCKE] als Platzhalter (max. 4 Lücken). blanks[]: korrekte Füllwörter in gleicher Reihenfolge. options[]: leer. solution: kompletter Text. Punkte: 3-5.
- ${openCount} Freitext/Kurzantwort (type "open"): Transfer oder 2-3-Satz-Erklärung unter Zeitdruck. options[]: leer. solution: Musterantwort mit Kernbegriffen. Punkte: 5-10.

ALLGEMEINE REGELN:
- Jede Aufgabe deckt einen ANDEREN Aspekt des Materials ab
- id: fortlaufend "q1", "q2", ...
- Alle Arrays die nicht für den Typ relevant sind: als leeres Array [] angeben
- Nicht relevante Felder (z.B. tfCorrect bei MC): weglassen oder 0/false als Default` });

  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts,
    config: {
      temperature: 1.0,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id:                   { type: Type.STRING },
            question:             { type: Type.STRING },
            type:                 { type: Type.STRING },
            options:              { type: Type.ARRAY, items: { type: Type.STRING } },
            correctIndices:       { type: Type.ARRAY, items: { type: Type.NUMBER } },
            tfCorrect:            { type: Type.BOOLEAN },
            tfReasonOptions:      { type: Type.ARRAY, items: { type: Type.STRING } },
            tfCorrectReasonIndex: { type: Type.NUMBER },
            matchLeft:            { type: Type.ARRAY, items: { type: Type.STRING } },
            matchRight:           { type: Type.ARRAY, items: { type: Type.STRING } },
            matchCorrect:         { type: Type.ARRAY, items: { type: Type.NUMBER } },
            blankText:            { type: Type.STRING },
            blanks:               { type: Type.ARRAY, items: { type: Type.STRING } },
            solution:             { type: Type.STRING },
            points:               { type: Type.NUMBER },
          },
          required: ['id', 'question', 'type', 'solution', 'points']
        }
      }
    }
  });
  return JSON.parse(text || '[]');
};

// Nur für type="open" — alle anderen werden clientseitig ausgewertet
export const evaluateExamAnswers = async (questions: ExamQuestion[]): Promise<ExamQuestion[]> => {
  const text = await callBackend({
    model: 'gemini-2.5-flash',
    parts: [{ text: `Bewerte die folgenden Klausurantworten als fairer Hochschulprüfer.

BEWERTUNGSREGELN — STRENGER HOCHSCHULMASSSTAB:
- type "mc": Volle Punkte NUR wenn ALLE korrekten Optionen gewählt und KEINE falschen. 0 Punkte wenn falsche Optionen dabei sind. Halbe Punkte nur wenn alle richtigen gewählt aber keine falschen fehlen teilweise.
- type "open" (Transfer/Schreiben): Bewerte inhaltlich streng — fehlende Fachbegriffe, oberflächliche Argumentation, falsche Konzepte = Punktabzug. Teilpunkte nur für Antworten die inhaltlich korrekte Kernaussagen enthalten. Allgemeinplätze ohne Substanz geben keine Punkte.
- Punktevergabe: Volle Punkte nur bei vollständiger, präziser Antwort. 75% bei guter aber unvollständiger Antwort. 50% bei richtiger Kernaussage ohne Tiefe. 25% bei schwacher Teilantwort. 0% bei falschem oder leerem Inhalt.
- feedback: Direkt und klar. Benenne konkret was fehlte oder falsch war. Kein unnötiges Loben bei schlechten Antworten. Max. 3 Sätze.
- achievedPoints: nie negativ, nie größer als points.
- Wenn userAnswer leer/fehlt: achievedPoints = 0, feedback = "Keine Antwort gegeben."

Daten: ${JSON.stringify(questions)}` }],
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING }, question: { type: Type.STRING },
            type: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } },
            solution: { type: Type.STRING }, points: { type: Type.NUMBER },
            userAnswer: { type: Type.STRING }, feedback: { type: Type.STRING },
            achievedPoints: { type: Type.NUMBER }
          },
          required: ['id', 'feedback', 'achievedPoints']
        }
      }
    }
  });
  return JSON.parse(text || '[]');
};
