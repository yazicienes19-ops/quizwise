import type { QuestionFeedbackType } from '../types';

interface FeedbackEntry {
  questionHash: string;
  type: QuestionFeedbackType;
  timestamp: number;
}

const KEY = 'quizwise_question_feedback';
const MAX_ENTRIES = 1000;

function hash(question: string): string {
  return question.slice(0, 120).replace(/\s+/g, '').toLowerCase();
}

function load(): FeedbackEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveQuestionFeedback(question: string, type: QuestionFeedbackType): void {
  const all = load();
  all.push({ questionHash: hash(question), type, timestamp: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_ENTRIES)));
}

interface FeedbackSummary {
  total: number;
  tooStrict: number;
  tooLenient: number;
  unrealistic: number;
}

export function getQuestionFeedbackSummary(question: string): FeedbackSummary | null {
  const qh = hash(question);
  const relevant = load().filter(e => e.questionHash === qh);
  if (relevant.length < 2) return null;
  return {
    total: relevant.length,
    tooStrict: relevant.filter(e => e.type === 'too_strict').length,
    tooLenient: relevant.filter(e => e.type === 'too_lenient').length,
    unrealistic: relevant.filter(e => e.type === 'unrealistic').length,
  };
}

export function formatFeedbackContext(question: string): string {
  const s = getQuestionFeedbackSummary(question);
  if (!s) return '';
  const parts: string[] = [];
  if (s.tooStrict / s.total > 0.3)
    parts.push('Frühere Bewertungen wurden häufig als zu streng empfunden — vergib Teilpunkte etwas großzügiger');
  if (s.tooLenient / s.total > 0.3)
    parts.push('Frühere Bewertungen wurden häufig als zu locker empfunden — sei etwas kritischer');
  if (s.unrealistic / s.total > 0.3)
    parts.push('Diese Frage wurde als prüfungsuntypisch bewertet — erwähne dies optional in deinem Feedback');
  return parts.length ? `FEEDBACK-KONTEXT: ${parts.join('. ')}.` : '';
}
