// 100-Punkte-Rubriken je Funktion. Jedes Kriterium hat eine Quelle:
//   det   = deterministische Prüfung der Ausgabe
//   gold  = Abgleich mit dem Goldstandard des Testfalls
//   judge = Inhaltsprüfer (Checkliste gegen die Quelle, blind)
//   mix   = Anteil aus det/gold und judge (siehe weight)
//   runs  = über die Wiederholungen eines Testfalls (Konsistenz)
import type { Feature } from '../features.ts';

export interface Criterion {
  key: string;
  label: string;
  max: number;
  source: 'det' | 'gold' | 'judge' | 'mix' | 'runs';
  /** Bei mix: Anteil des Prüfers (Rest det/gold). */
  judgeShare?: number;
  /** Anweisung an den Prüfer (nur judge/mix). */
  judgeHint?: string;
}

export const RUBRICS: Record<Feature, Criterion[]> = {
  quiz: [
    { key: 'korrektheit', label: 'Faktische Korrektheit', max: 30, source: 'judge', judgeHint: 'Anteil der Fragen, deren als richtig markierte Lösung (correctAnswerIndices, clozeAnswers, matchPairs, rankingItems, numericAnswer, Musterantwort) laut Quelle stimmt.' },
    { key: 'quelltreue', label: 'Quelltreue / Grounding', max: 25, source: 'mix', judgeShare: 0.7, judgeHint: 'Anteil der Fragen, deren Inhalt vollständig aus der Quelle stammt (nichts hinzuerfunden).' },
    { key: 'fragetyp', label: 'Einhaltung des Fragetyps', max: 20, source: 'det' },
    { key: 'relevanz', label: 'Inhaltliche Relevanz', max: 15, source: 'judge', judgeHint: 'Fragen prüfen zentrale, lernrelevante Inhalte statt Nebensächlichkeiten (Foliendatum, Aktivitätsaufforderungen).' },
    { key: 'klarheit', label: 'Klarheit', max: 10, source: 'judge', judgeHint: 'Eindeutig formuliert, genau eine vertretbare Lösung, keine Fangfragen durch Mehrdeutigkeit.' },
  ],
  karten: [
    { key: 'korrektheit', label: 'Faktische Korrektheit', max: 35, source: 'judge', judgeHint: 'Anteil der Karten, deren Rückseite laut Quelle korrekt ist.' },
    { key: 'quelltreue', label: 'Quelltreue', max: 25, source: 'judge', judgeHint: 'Anteil der Karten ohne hinzuerfundene Information.' },
    { key: 'atomar', label: 'Lernbare / atomare Information', max: 15, source: 'mix', judgeShare: 0.5, judgeHint: 'Eine Karte = ein abfragbarer Gedanke; Vorderseite fragt eindeutig, Rückseite beantwortet genau das.' },
    { key: 'abdeckung', label: 'Abdeckung relevanter Inhalte', max: 15, source: 'gold' },
    { key: 'klarheit', label: 'Klarheit', max: 10, source: 'judge', judgeHint: 'Verständlich und knapp formuliert.' },
  ],
  tutor: [
    { key: 'korrektheit', label: 'Faktische Korrektheit', max: 30, source: 'mix', judgeShare: 0.5, judgeHint: 'Alle Sachaussagen stimmen mit der Quelle überein.' },
    { key: 'grounding', label: 'Quelltreue / Grounding', max: 30, source: 'judge', judgeHint: 'Keine Aussage geht über die Quelle hinaus, ohne das kenntlich zu machen. Erfundene Fakten streng bestrafen.' },
    { key: 'paedagogik', label: 'Pädagogische Qualität', max: 20, source: 'judge', judgeHint: 'Erklärt verständlich für Studierende, baut auf der Frage auf, sinnvolle Struktur/Beispiele aus der Quelle.' },
    { key: 'unsicherheit', label: 'Umgang mit Unsicherheit', max: 10, source: 'gold' },
    { key: 'klarheit', label: 'Klarheit / Direktheit', max: 10, source: 'judge', judgeHint: 'Beantwortet die Frage direkt, ohne Umschweife.' },
  ],
  feynman_frage: [
    { key: 'quelltreue', label: 'Quelltreue', max: 30, source: 'judge', judgeHint: 'Frage und conceptContext stützen sich vollständig auf die Quelle.' },
    { key: 'kernthema', label: 'Trifft ein Kernthema', max: 25, source: 'mix', judgeShare: 0.5, judgeHint: 'Die Frage zielt auf ein zentrales Konzept der Quelle (bzw. den gewünschten Fokus), nicht auf ein Detail.' },
    { key: 'kernbegriffe', label: 'Kernbegriffe stimmen und sind prüfbar', max: 20, source: 'det' },
    { key: 'beantwortbar', label: 'Mit der Quelle erklärbar', max: 15, source: 'judge', judgeHint: 'Ein Studierender kann die Frage allein mit der Quelle vollständig erklären.' },
    { key: 'format', label: 'Format', max: 10, source: 'det' },
  ],
  feynman_bewertung: [
    { key: 'fehlererkennung', label: 'Erkennung tatsächlicher Fehler', max: 35, source: 'gold' },
    { key: 'vollstaendigkeit', label: 'Vollständigkeit', max: 25, source: 'mix', judgeShare: 0.5, judgeHint: 'Das Feedback benennt die fehlenden Kernpunkte der Erklärung vollständig.' },
    { key: 'missverstaendnisse', label: 'Erkennung von Missverständnissen', max: 20, source: 'judge', judgeHint: 'Erkennt und erklärt Fehlvorstellungen korrekt UND erfindet keine Fehler, die die Erklärung gar nicht enthält.' },
    { key: 'quelltreue', label: 'Quelltreue', max: 10, source: 'judge', judgeHint: 'Korrekturen und Hinweise stimmen mit der Quelle überein.' },
    { key: 'erklaerung', label: 'Qualität der Erklärung', max: 10, source: 'judge', judgeHint: 'Feedback ist verständlich, konkret und hilft beim Verbessern.' },
  ],
  klausur: [
    { key: 'korrektheit', label: 'Korrektheit', max: 30, source: 'judge', judgeHint: 'Anteil der Aufgaben mit korrekter Lösung/Musterlösung laut Quelle.' },
    { key: 'quelltreue', label: 'Quelltreue', max: 20, source: 'judge', judgeHint: 'Anteil der Aufgaben ohne hinzuerfundene Inhalte.' },
    { key: 'typ_anzahl', label: 'Typ-Mix und Anzahl', max: 20, source: 'det' },
    { key: 'musterloesung', label: 'Musterlösung / Erwartungshorizont brauchbar', max: 20, source: 'judge', judgeHint: 'Musterlösungen und Bewertungskriterien erlauben eine faire, eindeutige Korrektur.' },
    { key: 'schwierigkeit', label: 'Schwierigkeit passend', max: 10, source: 'judge', judgeHint: 'Schwierigkeit entspricht der angeforderten Stufe und Klausurniveau.' },
  ],
  korrektur: [
    { key: 'fachlich', label: 'Fachliche Korrektheit (Punkte im Goldbereich)', max: 30, source: 'gold' },
    { key: 'konsistenz', label: 'Bewertungskonsistenz', max: 25, source: 'runs' },
    { key: 'begruendung', label: 'Begründung anhand des Inhalts', max: 20, source: 'judge', judgeHint: 'Jeder Punktabzug ist konkret mit fehlendem/falschem Inhalt begründet; keine willkürlichen Abzüge.' },
    { key: 'nuetzlichkeit', label: 'Nützlichkeit des Feedbacks', max: 15, source: 'judge', judgeHint: 'Feedback sagt konkret, was fehlt und wie die Antwort besser wird.' },
    { key: 'fairness', label: 'Fairness / Angemessenheit', max: 10, source: 'gold' },
  ],
  rechenweg: [
    { key: 'fehlerschritt', label: 'Richtigen Fehlerschritt erkannt', max: 35, source: 'gold' },
    { key: 'punkte', label: 'Punkte im Goldbereich', max: 30, source: 'gold' },
    { key: 'endergebnis', label: 'Endergebnis richtig beurteilt', max: 15, source: 'gold' },
    { key: 'keine_erfundenen', label: 'Keine erfundenen Fehler', max: 10, source: 'gold' },
    { key: 'feedback', label: 'Feedback', max: 10, source: 'judge', judgeHint: 'Notizen zu Fehlschritten erklären den Fehler korrekt und knapp.' },
  ],
  leser: [
    { key: 'korrektheit', label: 'Korrektheit', max: 30, source: 'judge', judgeHint: 'Die Erklärung ist sachlich richtig laut Quelle; bei found=false: keine erfundene Erklärung.' },
    { key: 'zitat', label: 'Zitat steht in der Quelle / found korrekt', max: 30, source: 'det' },
    { key: 'bezug', label: 'Erklärt die markierte Stelle', max: 20, source: 'mix', judgeShare: 0.5, judgeHint: 'Erklärt genau die markierte Stelle im Kontext der Quelle statt allgemein.' },
    { key: 'klarheit', label: 'Länge und Klarheit', max: 20, source: 'judge', judgeHint: 'Kurz, klar, für Studierende verständlich.' },
  ],
  studio: [
    { key: 'korrektheit', label: 'Korrektheit', max: 30, source: 'judge', judgeHint: 'Alle Sachaussagen stimmen mit der Quelle.' },
    { key: 'quelltreue', label: 'Quelltreue', max: 25, source: 'mix', judgeShare: 0.6, judgeHint: 'Nichts hinzuerfunden; Jahreszahlen, Namen und Zahlen nur aus der Quelle.' },
    { key: 'abdeckung', label: 'Abdeckung der Kernpunkte', max: 25, source: 'gold' },
    { key: 'format', label: 'Format eingehalten', max: 10, source: 'judge', judgeHint: 'Entspricht dem verlangten Format (Zusammenfassung, Leitfaden, FAQ, Glossar, Zeitstrahl) inkl. Fußnoten [1].' },
    { key: 'klarheit', label: 'Klarheit', max: 10, source: 'judge', judgeHint: 'Gut lesbar und lernfreundlich strukturiert.' },
  ],
  selbsttest: [
    { key: 'urteil', label: 'Urteil wie Gold', max: 40, source: 'gold' },
    { key: 'punkte', label: 'Punkte im Goldbereich', max: 25, source: 'gold' },
    { key: 'fehlend', label: 'Fehlende Punkte richtig benannt', max: 25, source: 'judge', judgeHint: 'missing nennt genau das, was gegenüber der Musterantwort fehlt; nichts, was die Antwort schon enthält.' },
    { key: 'feedback', label: 'Feedback', max: 10, source: 'judge', judgeHint: 'Feedback ist korrekt, freundlich und konkret.' },
  ],
};

/** Kritische Fehlerklassen, die der Prüfer melden soll (je Funktion). */
export const CRITICAL_TYPES: Record<Feature, string[]> = {
  quiz: ['falsche_loesung', 'erfundene_information', 'widerspricht_quelle', 'falscher_fragetyp', 'nicht_beantwortbar'],
  karten: ['falsche_information', 'halluzination', 'wesentliches_ignoriert', 'logisch_unbrauchbar'],
  tutor: ['falsche_information', 'halluzination', 'widerspricht_quelle'],
  feynman_frage: ['erfundene_information', 'nicht_beantwortbar'],
  feynman_bewertung: ['tatsaechlichen_fehler_uebersehen', 'fehler_erfunden', 'falsche_korrektur'],
  klausur: ['falsche_loesung', 'erfundene_information', 'widerspricht_quelle', 'nicht_beantwortbar'],
  korrektur: ['willkuerlicher_abzug', 'falsche_inhaltliche_begruendung'],
  rechenweg: ['falscher_fehler_gemeldet', 'fehler_uebersehen'],
  leser: ['halluzination', 'widerspricht_quelle'],
  studio: ['falsche_information', 'halluzination', 'widerspricht_quelle'],
  selbsttest: ['falsche_korrektur', 'fehler_erfunden'],
};
