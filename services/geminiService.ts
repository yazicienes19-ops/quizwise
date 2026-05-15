
import { GoogleGenAI, Type } from "@google/genai";
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

export interface GenerationSource {
  text?: string;
  file?: {
    data: string;
    mimeType: string;
  };
}

export const generateRecallChallenge = async (source: GenerationSource): Promise<RecallChallenge> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (source.file) parts.push({ inlineData: { data: source.file.data, mimeType: source.file.mimeType } });
  else if (source.text) parts.push({ text: source.text });

  const prompt = `Erzeuge eine anspruchsvolle Active-Recall-Herausforderung basierend auf dem Material. 
  Stelle eine offene Frage, die den Nutzer zwingt, ein komplexes Konzept zu erklären (Feynman-Technik).
  Liefere zudem eine Liste von Keywords, die in der Antwort vorkommen sollten.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [...parts, { text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          expectedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          conceptContext: { type: Type.STRING }
        },
        required: ["question", "expectedKeywords", "conceptContext"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

export const evaluateRecallResponse = async (challenge: RecallChallenge, userAnswer: string): Promise<RecallEvaluation> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Bewerte folgende Antwort auf die Recall-Frage: "${challenge.question}".
  Kontext des Konzepts: ${challenge.conceptContext}
  Erwartete Begriffe: ${challenge.expectedKeywords.join(', ')}
  Antwort des Nutzers: "${userAnswer}"
  
  Bewerte auf einer Skala von 0-100. Identifiziere vergessene Punkte und Stärken.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          missingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedReview: { type: Type.STRING }
        },
        required: ["score", "feedback", "missingPoints", "strengths", "suggestedReview"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

export const orchestrateLearningFlow = async (
  activity: { type: 'quiz' | 'cards' | 'exam' | 'recall', result: any },
  radarState: TopicMetric[],
  calendarState: { entries: StudyEntry[], exams: ExamTerm[] }
): Promise<LearningFlowResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const context = {
    activity_type: activity.type,
    activity_result: activity.result,
    radar_state: radarState.map(m => ({ topic: m.topic, confidence: m.confidence, last_reviewed: m.lastReviewed })),
    calendar_state: {
      planned_sessions: calendarState.entries.length,
      upcoming_exams: calendarState.exams
    }
  };

  const prompt = `Analysiere folgende Lernaktivität und erzeuge den 'Next Best Actions'-Plan:
  ${JSON.stringify(context)}
  
  FORMATREGELN:
  - max. 3 next_actions.
  - updated_radar für die betroffenen Themen.
  - Falls Lücken vorhanden (>30% Fehler), schlage einen Kalenderblock (calendar_suggestion) vor.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: prompt }],
    config: {
      systemInstruction: ORCHESTRATOR_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          updated_radar: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                status: { type: Type.STRING },
                priority: { type: Type.NUMBER },
                reason: { type: Type.STRING }
              },
              required: ["topic", "status", "priority", "reason"]
            }
          },
          next_actions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                module: { type: Type.STRING },
                timebox_minutes: { type: Type.NUMBER },
                focus_topics: { type: Type.ARRAY, items: { type: Type.STRING } },
                why: { type: Type.STRING }
              },
              required: ["title", "module", "timebox_minutes", "focus_topics", "why"]
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
                    day: { type: Type.STRING },
                    start_time: { type: Type.STRING },
                    duration_minutes: { type: Type.NUMBER },
                    module: { type: Type.STRING },
                    focus_topics: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["day", "start_time", "duration_minutes", "module", "focus_topics"]
                }
              }
            },
            required: ["should_schedule", "suggested_blocks"]
          },
          blocking_questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                needed_field: { type: Type.STRING }
              }
            }
          }
        },
        required: ["updated_radar", "next_actions", "calendar_suggestion", "blocking_questions"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

// ... Rest of the functions stay the same ...
export const searchScholar = async (query: string): Promise<{text: string, results: SearchResult[]}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Führe eine akademische Recherche zu folgendem Thema durch: "${query}".
  
  ANFORDERUNGEN:
  1. Liefere maximal 10 REALE wissenschaftliche Publikationen.
  2. Jedes Ergebnis MUSS eine funktionierende URL oder DOI haben.
  3. Erstelle für jedes Ergebnis eine korrekte APA 7 Zitation.
  4. Extrahiere ein kurzes Abstract (max 400 Zeichen).
  5. Wenn möglich, gib die OpenAlex-ID oder eine vergleichbare akademische ID an.

  FORMATIERUNG:
  Liefere ein JSON-Objekt mit dem Key "results", welches ein Array von Objekten mit diesen Feldern enthält:
  "title", "authors", "year", "journal", "doi", "abstract", "apa_citation", "openalex_id", "doi_url"`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ text: prompt }],
    config: { 
      systemInstruction: SYSTEM_INSTRUCTION, 
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          results: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                authors: { type: Type.STRING },
                year: { type: Type.STRING },
                journal: { type: Type.STRING },
                doi: { type: Type.STRING },
                abstract: { type: Type.STRING },
                apa_citation: { type: Type.STRING },
                openalex_id: { type: Type.STRING },
                doi_url: { type: Type.STRING }
              },
              required: ["title", "authors", "year", "journal", "abstract", "apa_citation"]
            }
          }
        },
        required: ["results"]
      }
    }
  });

  try {
    const parsed = JSON.parse(response.text || '{"results": []}');
    const results: SearchResult[] = parsed.results.map((r: any) => ({
      title: r.title || "Unbekannter Titel",
      authors: r.authors || "Unbekannte Autoren",
      year: r.year || "n.d.",
      journal: r.journal || "Academic Journal",
      url: r.doi_url || (r.doi && r.doi.startsWith('http') ? r.doi : r.doi ? `https://doi.org/${r.doi}` : "#"),
      apaCitation: r.apa_citation || `${r.authors} (${r.year}). ${r.title}.`,
      snippet: r.abstract || "Keine Zusammenfassung verfügbar.",
      abstract: r.abstract,
      doi: r.doi,
      openalex_id: r.openalex_id,
      doi_url: r.doi_url || (r.doi ? `https://doi.org/${r.doi}` : undefined)
    }));

    return { text: "", results };
  } catch (e) {
    console.error("Parsing error in searchScholar", e);
    return { text: "", results: [] };
  }
};

export const generateSmartStudyPlan = async (metrics: TopicMetric[], decks: FlashcardDeck[], exams: ExamTerm[]): Promise<StudyEntry[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const context = {
    knowledgeGaps: metrics.filter(m => m.confidence < 70).map(m => ({ topic: m.topic, confidence: m.confidence })),
    flashcardStatus: decks.map(d => ({ title: d.title, dueCards: d.cards.filter(c => c.nextReview <= Date.now() || c.level === 0).length })),
    upcomingExams: exams
  };

  const prompt = `Erstelle einen intelligenten Wochen-Lernplan (Montag bis Sonntag) basierend auf diesen Daten:
  ${JSON.stringify(context)}

  ANFORDERUNGEN:
  1. Plane täglich 2-3 Sessions zwischen 08:00 und 20:00 Uhr ein.
  2. Priorisiere Themen mit niedriger 'confidence' (Wissenslücken).
  3. Integriere tägliche Flashcard-Reviews für Decks mit vielen fälligen Karten.
  4. Berücksichtige die Prüfungstermine: Intensiviere das Lernen 2-3 Tage vor einer Klausur.
  5. Weise jeder Session eine Farbe zu (emerald, blue, purple, rose).
  6. Sessions sollten 60 bis 120 Minuten dauern.
  
  GIB NUR DAS JSON-ARRAY ZURÜCK.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            day: { type: Type.STRING, description: "Montag, Dienstag, etc." },
            subject: { type: Type.STRING },
            topic: { type: Type.STRING },
            startTime: { type: Type.STRING, description: "HH:MM" },
            endTime: { type: Type.STRING, description: "HH:MM" },
            color: { type: Type.STRING },
            completed: { type: Type.BOOLEAN }
          },
          required: ["id", "day", "subject", "topic", "startTime", "endTime", "color", "completed"]
        }
      }
    }
  });

  return JSON.parse(response.text || "[]").map((entry: any) => ({ ...entry, isAutoGenerated: true }));
};

export const generateQuizFromDocument = async (source: GenerationSource, quizType: QuizType = QuizType.FAST, options?: any): Promise<QuizQuestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (source.file) parts.push({ inlineData: { data: source.file.data, mimeType: source.file.mimeType } });
  else if (source.text) parts.push({ text: source.text });

  const prompt = `Erstelle ein Quiz basierend auf dem Material. Modus: ${quizType}.
  Zu jeder Frage liefere: die Liste der korrekten Antwort-Indizes (Array!), ein Boolean ob es Multiple-Choice ist, eine Erklärung, Textbezug, Thema und Schwierigkeitsgrad.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [...parts, { text: prompt }] }],
    config: { 
      responseMimeType: "application/json",
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
            distractorExplanations: { type: Type.ARRAY, items: { type: Type.STRING } },
            sourceReference: { type: Type.STRING },
            topic: { type: Type.STRING },
            difficulty: { type: Type.STRING }
          },
          required: ["question", "options", "correctAnswerIndices", "isMultipleChoice", "explanation", "sourceReference"]
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
};

export const generateFlashcardsFromDocument = async (source: GenerationSource, count: number = 15): Promise<Partial<Flashcard>[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (source.file) parts.push({ inlineData: { data: source.file.data, mimeType: source.file.mimeType } });
  else if (source.text) parts.push({ text: source.text });
  parts.push({ text: `Erstelle ${count} hochwertige Karteikarten.` });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts }],
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING },
            back: { type: Type.STRING }
          },
          required: ["front", "back"]
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
};

export const generateQuizFromFlashcards = async (deck: FlashcardDeck, options?: any): Promise<QuizQuestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const cardsJson = JSON.stringify(deck.cards.map(c => ({ q: c.front, a: c.back })));
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: `Erstelle ein Quiz aus diesen Karteikarten: ${cardsJson}` }],
    config: { 
      responseMimeType: "application/json",
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
          required: ["question", "options", "correctAnswerIndices", "isMultipleChoice", "explanation", "sourceReference"]
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
};

export const generatePaperOutline = async (topic: string, focus: string, sources: GenerationSource[]): Promise<PaperOutlineSection[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  sources.forEach(s => {
    if (s.file) parts.push({ inlineData: { data: s.file.data, mimeType: s.file.mimeType } });
    else if (s.text) parts.push({ text: s.text });
  });

  const prompt = `Erstelle eine wissenschaftliche Gliederung für eine Hausarbeit zum Thema: "${topic}".
  Fokus/Forschungsfrage: "${focus}".
  Basierend auf den bereitgestellten Quellen. Liefere eine detaillierte Struktur.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ parts: [...parts, { text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["title", "description"]
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
};

export const formatCitation = async (source: AcademicSource, style: CitationStyle): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Formatiere folgende Quelle im ${style}-Stil:
  Titel: ${source.title}
  Autoren: ${source.authors}
  Jahr: ${source.year}
  Journal: ${source.journal}
  URL/DOI: ${source.url}
  
  Gib ausschließlich den formatierten Zitations-String zurück, ohne weiteren Text.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: prompt }]
  });
  return response.text || "";
};

export const magicFormatCitation = async (input: string): Promise<MultiStyleCitation> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Extrahiere bibliographische Informationen aus diesem Textfragment und erstelle Zitationen in verschiedenen Stilen: "${input}"`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          apa: {
            type: Type.OBJECT,
            properties: {
              entry: { type: Type.STRING },
              inTextKlammer: { type: Type.STRING },
              inTextNarrativ: { type: Type.STRING }
            },
            required: ["entry", "inTextKlammer", "inTextNarrativ"]
          },
          mla: {
            type: Type.OBJECT,
            properties: {
              entry: { type: Type.STRING },
              inText: { type: Type.STRING }
            },
            required: ["entry", "inText"]
          },
          harvard: {
            type: Type.OBJECT,
            properties: {
              entry: { type: Type.STRING },
              inText: { type: Type.STRING },
              direct: { type: Type.STRING }
            },
            required: ["entry", "inText", "direct"]
          },
          chicago: {
            type: Type.OBJECT,
            properties: {
              fullNote: { type: Type.STRING },
              shortNote: { type: Type.STRING },
              bibliography: { type: Type.STRING }
            },
            required: ["fullNote", "shortNote", "bibliography"]
          }
        },
        required: ["apa", "mla", "harvard", "chicago"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

export const analyzeLearningProgress = async (metrics: TopicMetric[]): Promise<LearningAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Analysiere den Lernfortschritt basierend auf diesen Daten: ${JSON.stringify(metrics)}.
  Identifiziere Fehlermuster, gib Empfehlungen und eine Gesamteinschätzung ab.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallHealth: { type: Type.STRING },
          errorPatterns: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pattern: { type: Type.STRING },
                description: { type: Type.STRING },
                count: { type: Type.NUMBER },
                concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                probableCause: { type: Type.STRING },
                textReference: { type: Type.STRING },
                recommendedAction: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    reasoning: { type: Type.STRING }
                  },
                  required: ["type", "reasoning"]
                }
              },
              required: ["pattern", "description", "count", "concepts", "probableCause", "recommendedAction"]
            }
          },
          topThreeTypes: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                  pattern: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
            }
          }
        },
        required: ["overallHealth", "errorPatterns", "topThreeTypes"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

export const suggestConceptsForMindMap = async (source: GenerationSource, existingLabels: string[]): Promise<any[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (source.file) parts.push({ inlineData: { data: source.file.data, mimeType: source.file.mimeType } });
  else if (source.text) parts.push({ text: source.text });

  const prompt = `Schlage 5-8 relevante Konzepte für eine Mindmap basierend auf dem Material vor.
  Vermeide Duplikate mit: ${existingLabels.join(", ")}.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [...parts, { text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            category: { type: Type.STRING, description: "core, definition, process, or example" },
            summary: { type: Type.STRING }
          },
          required: ["label", "category", "summary"]
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
};

export const generateExplanation = async (source: GenerationSource, concept: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (source.file) parts.push({ inlineData: { data: source.file.data, mimeType: source.file.mimeType } });
  else if (source.text) parts.push({ text: source.text });

  const prompt = `Erkläre das Konzept "${concept}" basierend auf dem bereitgestellten Material.
  Strukturiere die Erklärung in 3 Stufen: Grundlagen, Vertiefung und Kontext. Antworte in Markdown.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [...parts, { text: prompt }] }]
  });
  return response.text || "";
};

export const generateFullExam = async (content: GenerationSource, style?: GenerationSource, options?: { count: number, difficulty: string }): Promise<ExamQuestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (content.file) parts.push({ inlineData: { data: content.file.data, mimeType: content.file.mimeType } });
  else if (content.text) parts.push({ text: content.text });

  if (style) {
    if (style.file) parts.push({ text: "Nutze diesen STIL für die Prüfung:", inlineData: { data: style.file.data, mimeType: style.file.mimeType } });
    else if (style.text) parts.push({ text: `Nutze diesen STIL für die Prüfung: ${style.text}` });
  }

  const prompt = `Erstelle eine akademische Klausur mit ${options?.count || 10} Fragen auf Niveau "${options?.difficulty || 'mittel'}".
  Mische MC-Fragen (mc) und offene Fragen (open). Gib für jede Frage die Punktzahl und die Musterlösung an.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ parts: [...parts, { text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            question: { type: Type.STRING },
            type: { type: Type.STRING, description: "mc or open" },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            solution: { type: Type.STRING },
            points: { type: Type.NUMBER }
          },
          required: ["id", "question", "type", "solution", "points"]
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
};

export const evaluateExamAnswers = async (questions: ExamQuestion[]): Promise<ExamQuestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Bewerte die folgenden Klausurantworten. Vergleiche 'userAnswer' mit 'solution'.
  Vergib 'achievedPoints' und erstelle ein konstruktives 'feedback' pro Aufgabe.
  Hier sind die Daten: ${JSON.stringify(questions)}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            question: { type: Type.STRING },
            type: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            solution: { type: Type.STRING },
            points: { type: Type.NUMBER },
            userAnswer: { type: Type.STRING },
            feedback: { type: Type.STRING },
            achievedPoints: { type: Type.NUMBER }
          },
          required: ["id", "feedback", "achievedPoints"]
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
};

export const generateImage = async (prompt: string, aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" = "1:1"): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{ text: `Generate a stylized, high-quality, academic and modern illustration for: ${prompt}. Avoid realistic photos. Use a clean, professional aesthetic with a focused color palette.` }],
    config: {
      imageConfig: {
        aspectRatio
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
};
