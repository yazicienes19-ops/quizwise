const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── Tool-Ausführung ──────────────────────────────────────────────────────────

const executeToolCall = async (name, args, context, userId, sb) => {
  switch (name) {
    case 'get_learning_stats': {
      const metrics = context.metrics || [];
      const avg = metrics.length
        ? Math.round(metrics.reduce((s, m) => s + m.confidence, 0) / metrics.length)
        : 0;
      return {
        totalTopics: metrics.length,
        averageConfidence: avg,
        weakTopics: metrics.filter(m => m.confidence < 50).length,
        mediumTopics: metrics.filter(m => m.confidence >= 50 && m.confidence < 70).length,
        strongTopics: metrics.filter(m => m.confidence >= 70).length,
      };
    }
    case 'analyze_weak_topics': {
      const metrics = context.metrics || [];
      const weak = metrics
        .filter(m => m.confidence < 70)
        .sort((a, b) => a.confidence - b.confidence)
        .slice(0, 5)
        .map(m => ({ topic: m.topic, confidence: m.confidence, attempts: m.totalAttempts }));
      return { weakTopics: weak };
    }
    case 'get_upcoming_exams': {
      const exams = context.examTerms || [];
      const now = Date.now();
      const upcoming = exams
        .filter(e => new Date(e.date).getTime() > now)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 5);
      return { upcomingExams: upcoming };
    }
    case 'get_user_documents': {
      const { data } = await sb
        .from('documents')
        .select('id, name, type')
        .eq('user_id', userId)
        .limit(20);
      return { documents: data || [] };
    }
    case 'get_flashcard_decks': {
      const { data } = await sb
        .from('flashcard_decks')
        .select('id, title')
        .eq('user_id', userId)
        .limit(20);
      return { decks: data || [] };
    }
    case 'explain_feature': {
      const FEATURES = {
        quiz: 'Quiz Center: Lade ein Dokument hoch → "Quiz starten". Wähle Schnell (7 Fragen), Intensiv (17 Fragen) oder Custom. Die KI erstellt automatisch verschiedene Fragetypen (MC, Lückentext, Zuordnung usw.).',
        recall: 'Recall Studio: Active-Recall nach der Feynman-Methode. Du beantwortest eine Frage frei mit eigenen Worten — die KI bewertet dein Verständnis und zeigt dir was dir fehlt.',
        karteikarten: 'Karteikarten: KI erstellt Karten aus deinen Dokumenten. Das System nutzt Spaced Repetition — Karten die du nicht weißt, kommen öfter. Täglich ein paar Minuten reicht.',
        studyflow: 'StudyFlow (Planer): Trage deine Prüfungstermine ein und lass die KI einen Wochenplan erstellen. Der Plan priorisiert schwache Themen und berücksichtigt Fristen.',
        erklaerer: 'KI-Erklärer: Gib ein Konzept ein das du nicht verstehst. Die KI erklärt in 3 Stufen: Grundlagen, Vertiefung, Kontext. Du kannst ein eigenes Dokument als Grundlage nutzen.',
        lernanalyse: 'Lern-Analyse (GapRadar): Zeigt deinen Fortschritt pro Thema als Konfidenzwert. Nach jedem Quiz werden die Werte automatisch aktualisiert. Die KI identifiziert Fehlermuster.',
        klausur: 'Klausur-Modus: Realistische Prüfungssimulation mit Zeitlimit, Punktevergabe und Benotung. Lade ein Dokument und optional eine Beispiel-Klausur hoch.',
        hausarbeit: 'Hausarbeit: Hilft beim Schreiben — Gliederung, Zitierung in 4 Stilen (APA, MLA, Harvard, Chicago), akademische Phrasen, Paraphrasieren-Hilfe und eine 23-Punkte-Checkliste.',
        recherche: 'Recherche: KI-gestützte Web- und Literatursuche. Gefundene Quellen lassen sich mit einem Klick sichern und werden automatisch in der Hausarbeit zitiert.',
        bibliothek: 'Bibliothek: Verwalte deine Lernmaterialien. Lade PDFs, Word-Dokumente, Bilder (auch HEIC) oder Text hoch. Kostenlos bis 5 Dokumente, Pro unbegrenzt.',
      };
      const key = (args.feature_name || '').toLowerCase().replace('-', '');
      const desc = FEATURES[key] || FEATURES[args.feature_name] || `"${args.feature_name}" findest du in der linken Seitenleiste.`;
      return { description: desc };
    }
    case 'suggest_next_action': {
      const tab = args.current_tab || context.currentTab || 'DASHBOARD';
      const map = {
        DASHBOARD: 'Lade dein erstes Dokument in der Bibliothek hoch und starte dann einen Quiz — das dauert nur 2 Minuten.',
        LIBRARY: 'Wähle ein Dokument aus → "Quiz starten". Oder öffne den KI-Erklärer für ein bestimmtes Konzept.',
        QUIZ: 'Nach dem Quiz landet dein Ergebnis automatisch in der Lern-Analyse. Schaue dort nach roten Bereichen.',
        CARDS: 'Reviewe täglich deine fälligen Karteikarten — auch 5 Minuten pro Tag reichen bei Spaced Repetition.',
        RECALL: 'Combine: Erst Quiz für breite Abdeckung, dann Recall Studio für die schwierigsten Konzepte.',
        RADAR: 'Siehst du rote Themen? Gehe ins Quiz Center → Custom Quiz → trage das schwache Thema als Schwerpunkt ein.',
        PLANNER: 'Trage zuerst alle Prüfungstermine ein, dann klicke "KI-Plan erstellen" für einen optimierten Wochenplan.',
        EXPLAINER: 'Wähle ein Dokument als Quelle und gib ein Konzept ein das du nicht verstehst.',
        EXAM: 'Lade dein Lernmaterial und optional eine Beispiel-Klausur hoch — die KI passt den Stil dann an.',
        SEARCH: 'Suche nach akademischen Quellen und speichere sie — sie werden automatisch in der Hausarbeit zitiert.',
        PAPER: 'Starte mit dem Gliederung-Tab: Thema + Fragestellung eingeben, KI generiert eine vollständige Struktur.',
      };
      return { suggestion: map[tab] || 'Erkunde die Features in der linken Seitenleiste.' };
    }
    default:
      return { error: `Unbekannte Funktion: ${name}` };
  }
};

// ─── Agent-Konfigurationen ────────────────────────────────────────────────────

const AGENTS = {
  lernCoach: {
    systemInstruction: `Du bist der persönliche Lern-Coach in QuizWise. Du analysierst den Lernfortschritt und gibst motivierende, konkrete Empfehlungen.
Regeln:
- Nutze zuerst die Tools um Daten zu laden, dann antworte
- Sei direkt — keine langen Einleitungen
- Empfehlungen müssen spezifisch sein: welches Thema, welche Methode (Quiz/Recall/Karten), wie lange
- Maximal 3 konkrete Empfehlungen pro Antwort
- Antworte auf Deutsch`,
    tools: [{
      functionDeclarations: [
        {
          name: 'get_learning_stats',
          description: 'Ruft allgemeine Lernstatistiken ab: Durchschnittskonfidenz, Anzahl Themen, Verteilung stark/mittel/schwach',
          parameters: { type: 'OBJECT', properties: {}, required: [] }
        },
        {
          name: 'analyze_weak_topics',
          description: 'Identifiziert die schwächsten Lernthemen (Konfidenz < 70%)',
          parameters: { type: 'OBJECT', properties: {}, required: [] }
        },
        {
          name: 'get_upcoming_exams',
          description: 'Ruft anstehende Prüfungstermine des Nutzers ab',
          parameters: { type: 'OBJECT', properties: {}, required: [] }
        },
        {
          name: 'get_user_documents',
          description: 'Listet die Dokumente in der Bibliothek des Nutzers auf',
          parameters: { type: 'OBJECT', properties: {}, required: [] }
        },
      ]
    }]
  },

  studyFlow: {
    systemInstruction: `Du bist der StudyFlow-Agent in QuizWise — Experte für Lernplanung und Zeitmanagement.
Deine Aufgabe: realistische, machbare Lernpläne auf Basis echter Nutzerdaten erstellen.
Regeln:
- Analysiere immer zuerst den Lernstand und Prüfungstermine
- Plane konkret: Thema, Methode (Quiz/Recall/Karten), Dauer
- Prüfungsfristen immer priorisieren
- Pläne sollen motivierend und erreichbar sein, nicht überwältigend
- Antworte auf Deutsch`,
    tools: [{
      functionDeclarations: [
        {
          name: 'get_learning_stats',
          description: 'Ruft allgemeine Lernstatistiken ab',
          parameters: { type: 'OBJECT', properties: {}, required: [] }
        },
        {
          name: 'analyze_weak_topics',
          description: 'Identifiziert schwache Lernthemen',
          parameters: { type: 'OBJECT', properties: {}, required: [] }
        },
        {
          name: 'get_upcoming_exams',
          description: 'Ruft anstehende Prüfungstermine ab',
          parameters: { type: 'OBJECT', properties: {}, required: [] }
        },
        {
          name: 'get_flashcard_decks',
          description: 'Listet Karteikarten-Decks des Nutzers auf',
          parameters: { type: 'OBJECT', properties: {}, required: [] }
        },
      ]
    }]
  },

  erklaerer: {
    systemInstruction: `Du bist der interaktive Lern-Erklärer in QuizWise.
Deine Aufgabe: Konzepte so erklären dass Studenten sie wirklich verstehen — nicht nur auswendig lernen.
Regeln:
- Erkläre schrittweise: erst Grundlagen, dann Vertiefung, dann Anwendung/Beispiel
- Nutze Analogien aus dem Alltag
- Stelle nach jeder Erklärung eine Verständnisfrage zum Selbsttest
- Wenn ein Dokument im Kontext ist, beziehe dich darauf
- Frage nach wenn dir Kontext fehlt
- Antworte auf Deutsch`,
    tools: [{
      functionDeclarations: [
        {
          name: 'get_user_documents',
          description: 'Listet verfügbare Dokumente als Quellengrundlage für Erklärungen',
          parameters: { type: 'OBJECT', properties: {}, required: [] }
        },
      ]
    }]
  },

  uxHelper: {
    systemInstruction: `Du bist der QuizWise App-Assistent. Du hilfst Nutzern die App optimal zu nutzen.
Deine Aufgabe: Features erklären, Navigation helfen, Tipps für effektiveres Lernen geben.
Regeln:
- Sei freundlich und präzise
- Gib immer konkrete Navigationshinweise (z.B. "Seitenleiste → Lern-Analyse")
- Nutze die Tools bevor du antwortest
- Antworte auf Deutsch`,
    tools: [{
      functionDeclarations: [
        {
          name: 'explain_feature',
          description: 'Erklärt ein bestimmtes App-Feature im Detail',
          parameters: {
            type: 'OBJECT',
            properties: {
              feature_name: {
                type: 'STRING',
                description: 'Name des Features: quiz, recall, karteikarten, studyflow, erklaerer, lernanalyse, klausur, hausarbeit, recherche, bibliothek'
              }
            },
            required: ['feature_name']
          }
        },
        {
          name: 'suggest_next_action',
          description: 'Schlägt die sinnvollste nächste Aktion für die aktuelle Seite vor',
          parameters: {
            type: 'OBJECT',
            properties: {
              current_tab: { type: 'STRING', description: 'Aktuelle Seite: DASHBOARD, LIBRARY, QUIZ, CARDS, RECALL, RADAR, PLANNER, EXPLAINER, EXAM, SEARCH, PAPER' }
            },
            required: []
          }
        },
      ]
    }]
  },
};

// ─── Agent Chat Loop ──────────────────────────────────────────────────────────

// POST /api/agents/chat
// body: { agentType, userMessage, history: [{role, content}][], context }
router.post('/chat', async (req, res, next) => {
  try {
    const { agentType, userMessage, history = [], context = {} } = req.body;
    const userId = req.user.id;

    if (!agentType || !AGENTS[agentType]) {
      return res.status(400).json({ error: `Unbekannter Agent-Typ: ${agentType}` });
    }
    if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
      return res.status(400).json({ error: 'userMessage erforderlich' });
    }
    if (userMessage.length > 5000) {
      return res.status(400).json({ error: 'Nachricht zu lang (max. 5000 Zeichen).' });
    }

    const agent = AGENTS[agentType];

    // Einfaches Modell für alle Agents (light reicht hier)
    const model = 'gemini-2.5-flash-lite';

    // Konversationshistorie in Gemini-Format konvertieren
    const contents = [
      ...history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    let currentContents = contents;
    let finalText = '';
    const MAX_STEPS = 6;

    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await ai.models.generateContent({
        model,
        contents: currentContents,
        config: {
          systemInstruction: agent.systemInstruction,
          temperature: 0.7,
        },
        tools: agent.tools,
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      const functionCallPart = parts.find(p => p.functionCall);
      const textPart = parts.find(p => p.text);

      if (textPart) {
        finalText = textPart.text;
        break;
      }

      if (functionCallPart) {
        const fc = functionCallPart.functionCall;
        const toolResult = await executeToolCall(fc.name, fc.args || {}, context, userId, req.supabase);

        const fnResponse = { name: fc.name, response: toolResult };
        if (fc.id) fnResponse.id = fc.id;

        currentContents = [
          ...currentContents,
          { role: 'model', parts: [{ functionCall: fc }] },
          { role: 'user', parts: [{ functionResponse: fnResponse }] },
        ];
      } else {
        break;
      }
    }

    res.json({ text: finalText });

  } catch (err) {
    console.error('Agent Fehler:', err.message);
    next(err);
  }
});

module.exports = router;
