/**
 * recallChallengeGuard.ts — Validierung + Orchestrierung für Feynman-Challenges.
 *
 * Zwei Live-Funde vom Browser-Test (2026-08-22), die dieser Guard adressiert:
 *
 * BUG 1 — Fokus-Thema wurde vom Modell ignoriert (Fokus "Extinktion",
 * Frage daraufhin allgemein zum Behaviorismus). Prompt-Anweisungen allein
 * sind keine Produktgarantie: Deshalb wird die Antwort deterministisch
 * geprüft (topic-Feld + Fragetext gegen das Fokus-Thema) und bei Abweichung
 * EINMAL mit verschärfter Korrektur-Anweisung regeneriert. Bleibt die zweite
 * Antwort daneben, sauberer Fehler statt falscher Frage (keine Endlosschleife,
 * max. 2 Gemini-Calls).
 *
 * BUG 2 — Als Topic wurde der GEWÜNSCHTE Fokus gespeichert, nicht das TATSÄCH-
 * LICH abgefragte Thema (usedTopic-Priorität war focusTopic > challenge.topic).
 * Folge: Cooldown/Ausschluss kannten das echte Thema nicht → nahezu doppelte
 * Frage direkt danach. resolveActualTopic dreht die Priorität um: Das
 * strukturierte topic-Feld der KI-Antwort IST das abgefragte Thema; der
 * Fokus ist nur noch Fallback.
 */
import type { RecallChallenge } from '../types';
import type { GenerationSource } from './geminiService';
import { isQuestionTooSimilar } from './recallQuestionDedup';

/** Maximal Gemini-Calls pro Challenge (Erstversuch + eine Regeneration). */
export const MAX_GENERATION_ATTEMPTS = 2;

export type ChallengeGuardError = 'focus' | 'duplicate';

export interface GenerateRecallChallengeFn {
  (
    source: GenerationSource,
    focusTopic?: string,
    steering?: { excludeTopics?: string[]; preferTopics?: string[]; coverTopics?: string[] },
    extra?: { avoidQuestions?: string[]; retryHint?: string },
  ): Promise<RecallChallenge>;
}

export interface ValidatedChallenge {
  challenge: RecallChallenge;
  /** Das tatsächlich abgefragte Thema (für History/Coverage/Lernprofil). */
  actualTopic: string;
}

const norm = (s: string): string => s.trim().toLowerCase();

function tokenOverlap(a: string, b: string): number {
  const sa = new Set(norm(a).split(/[\s,;.]+/).filter(Boolean));
  const sb = new Set(norm(b).split(/[\s,;.]+/).filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / Math.min(sa.size, sb.size);
}

/**
 * Gehört die Challenge nachweisbar zum Fokus-Thema? Deterministisch.
 * Live-Fund der 2. Runde (2026-08-23): Das Modell gehorcht der Prompt-Zeile
 * "topic muss exakt dem Fokus entsprechen", ignoriert sie aber für den
 * FRAGETEXT — topic="Extinktion" bei einer Behaviorismus-Frage. Ein
 * topic-Treffer allein ist also TAUSCHBAR. Deshalb UND-Verknüpfung:
 *
 *   match = (topic ≈ Fokus) UND (Fragetext erwähnt Fokus)
 *
 * Fragetext-Erwähnung = Token-Überdeckung ≥ 0.5 ODER Fokus als Teilstring
 * (mehrwörtige Fokustheme). Paraphrasen ohne jeden Fokus-Begriff gelten
 * bewusst NICHT als Treffer — das Modell kann den Begriff in die Frage
 * schreiben (der Retry-Hinweis verlangt es explizit); kann es das nicht,
 * folgt der saubere Fokus-Fehler statt einer falschen Frage.
 */
export function questionMatchesFocus(challenge: Pick<RecallChallenge, 'question' | 'topic'>, focusTopic: string): boolean {
  const focus = focusTopic.trim();
  if (!focus) return true;
  const topic = (challenge.topic ?? '').trim();
  const normFocus = norm(focus);

  const topicMatches = (() => {
    if (!topic) return false;
    if (norm(topic) === normFocus) return true;
    if (norm(topic).includes(normFocus) || normFocus.includes(norm(topic))) return true;
    return tokenOverlap(topic, focus) >= 0.5;
  })();

  const questionMentionsFocus = challenge.question.toLowerCase().includes(normFocus)
    || tokenOverlap(challenge.question, focus) >= 0.5;

  return topicMatches && questionMentionsFocus;
}

/**
 * BUG-2-Fix: Das gespeicherte Topic ist das TATSÄCHLICH abgefragte Thema.
 * Priorität: strukturiertes topic-Feld der KI-Antwort > angeforderter Fokus >
 * Quellname > neutraler Fallback. Länge gekappt, Whitespace getrimmt.
 */
export function resolveActualTopic(
  challenge: Pick<RecallChallenge, 'topic'>,
  focusTopic: string | undefined,
  fallback: string,
): string {
  const fromAi = (challenge.topic ?? '').trim();
  if (fromAi) return fromAi.slice(0, 80);
  const fromFocus = (focusTopic ?? '').trim();
  if (fromFocus) return fromFocus.slice(0, 80);
  return fallback || 'Recall Session';
}

export interface GuardOptions {
  source: GenerationSource;
  focusTopic?: string;
  steering?: { excludeTopics?: string[]; preferTopics?: string[]; coverTopics?: string[] };
  /** Zuletzt ausgelieferte Fragen (Dedup — wird vorbeugend in jeden Prompt gegeben). */
  recentQuestions: string[];
  generate: GenerateRecallChallengeFn;
}

/**
 * Orchestriert Generierung + Validierung:
 * - Versuch 1: normaler Prompt (+ avoidQuestions zur Vorbeugung)
 * - Versuch 2 (nur bei Fokus-/Duplikat-Verstoß): verschärfter retryHint,
 *   die misslungene Frage kommt zusätzlich auf avoidQuestions
 * - danach: sauberer Fehler ({ error }) — keine falsche Frage, keine Schleife
 */
export async function generateValidatedChallenge(opts: GuardOptions): Promise<ValidatedChallenge | { error: ChallengeGuardError }> {
  const { source, focusTopic, steering, recentQuestions, generate } = opts;
  const focus = focusTopic?.trim() ?? '';

  let avoid = [...recentQuestions];
  let retryHint: string | undefined;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const challenge = await generate(source, focus || undefined, steering, {
      avoidQuestions: avoid.slice(0, 8),
      retryHint,
    });
    if (!challenge || !challenge.question) {
      if (attempt >= MAX_GENERATION_ATTEMPTS) return { error: 'focus' };
      retryHint = 'KORREKTUR: Die letzte Antwort enthielt keine brauchbare Frage. Liefere question, topic, expectedKeywords und conceptContext vollständig.';
      continue;
    }

    const focusOk = focus ? questionMatchesFocus(challenge, focus) : true;
    const duplicate = isQuestionTooSimilar(challenge.question, recentQuestions);

    if (focusOk && !duplicate) {
      return { challenge, actualTopic: resolveActualTopic(challenge, focus, '') || focus };
    }

    if (attempt >= MAX_GENERATION_ATTEMPTS) {
      return { error: focusOk ? 'duplicate' : 'focus' };
    }

    avoid = [challenge.question, ...avoid];
    retryHint = !focusOk
      ? `KORREKTUR: Die letzte generierte Frage behandelte "${(challenge.topic ?? '').trim() || 'ein anderes Thema'}" statt des geforderten Fokus "${focus}". Die neue Frage muss sich zwingend auf "${focus}" beziehen, den Begriff "${focus}" im Fragetext enthalten, und topic muss exakt "${focus}" sein.`
      : 'KORREKTUR: Die letzte generierte Frage war zu ähnlich zu einer bereits gestellten Frage. Stelle eine inhaltlich ANDERE Frage zu einem anderen Aspekt des Dokuments.';
  }
  return { error: 'focus' };
}
