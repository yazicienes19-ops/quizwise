import { supabase } from './supabaseClient';
import type { TopicMetric } from '../types';

export interface CloudLearningData {
  streak: { current: number; best: number; lastDay: string | null };
  exam_terms: any[];
  quiz_history: any[];
  exam_history: any[];
  recall_history: any[];
  mistake_queue: any[];
}

export interface CloudSavedContent {
  saved_quizzes: any[];
  saved_exams: any[];
  lib_meta: Record<string, any>;
  study_events: any[];
  study_templates: any[];
  reading_progress: Record<string, any>;
  reader_log: any[];
}

export interface CloudPreferences {
  theme?: string;
  accent_color?: string;
  font_choice?: string;
  line_height?: string;
  onboarding_done?: boolean;
  feynman_intro_done?: boolean;
  recall_intro_done?: boolean;
  spaced_planning?: boolean;
  language?: string;
}

export interface AllCloudData {
  learning: CloudLearningData | null;
  saved: CloudSavedContent | null;
  preferences: CloudPreferences;
  metrics: TopicMetric[];
}

const EMPTY_LEARNING: CloudLearningData = {
  streak: { current: 0, best: 0, lastDay: null },
  exam_terms: [],
  quiz_history: [],
  exam_history: [],
  recall_history: [],
  mistake_queue: [],
};

const EMPTY_SAVED: CloudSavedContent = {
  saved_quizzes: [],
  saved_exams: [],
  lib_meta: {},
  study_events: [],
  study_templates: [],
  reading_progress: {},
  reader_log: [],
};

async function ensureRows(userId: string): Promise<void> {
  await Promise.all([
    supabase.from('user_learning_data').upsert({ user_id: userId }, { onConflict: 'user_id' }),
    supabase.from('user_saved_content').upsert({ user_id: userId }, { onConflict: 'user_id' }),
  ]);
}

export async function loadAllCloudData(userId: string): Promise<AllCloudData> {
  const [learningRes, savedRes, profileRes, metricsRes] = await Promise.all([
    supabase.from('user_learning_data').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('user_saved_content').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('profiles').select('preferences').eq('id', userId).single(),
    supabase.from('metrics').select('*').eq('user_id', userId),
  ]);

  const metrics: TopicMetric[] = (metricsRes.data || []).map((row: any) => ({
    id: row.id || row.topic,
    topic: row.topic,
    confidence: row.confidence ?? 0,
    lastReviewed: row.last_reviewed ?? Date.now(),
    totalAttempts: row.total_attempts ?? 0,
    correctAttempts: row.correct_attempts ?? 0,
  }));

  return {
    learning: learningRes.data ? {
      streak: learningRes.data.streak ?? EMPTY_LEARNING.streak,
      exam_terms: learningRes.data.exam_terms ?? [],
      quiz_history: learningRes.data.quiz_history ?? [],
      exam_history: learningRes.data.exam_history ?? [],
      recall_history: learningRes.data.recall_history ?? [],
      mistake_queue: learningRes.data.mistake_queue ?? [],
    } : null,
    saved: savedRes.data ? {
      saved_quizzes: savedRes.data.saved_quizzes ?? [],
      saved_exams: savedRes.data.saved_exams ?? [],
      lib_meta: savedRes.data.lib_meta ?? {},
      study_events: savedRes.data.study_events ?? [],
      study_templates: savedRes.data.study_templates ?? [],
      reading_progress: savedRes.data.reading_progress ?? {},
      reader_log: savedRes.data.reader_log ?? [],
    } : null,
    preferences: (profileRes.data?.preferences as CloudPreferences) ?? {},
    metrics,
  };
}

export function syncLearningField(userId: string, field: keyof CloudLearningData, value: any): void {
  supabase
    .from('user_learning_data')
    .upsert({ user_id: userId, [field]: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .then(({ error }) => { if (error) console.error('syncLearningField:', error.message); });
}

export function syncSavedField(userId: string, field: keyof CloudSavedContent, value: any): void {
  supabase
    .from('user_saved_content')
    .upsert({ user_id: userId, [field]: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .then(({ error }) => { if (error) console.error('syncSavedField:', error.message); });
}

export function syncPreferences(userId: string, prefs: Partial<CloudPreferences>): void {
  supabase
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .single()
    .then(({ data }) => {
      const merged = { ...(data?.preferences || {}), ...prefs };
      supabase.from('profiles').update({ preferences: merged }).eq('id', userId)
        .then(({ error }) => { if (error) console.error('syncPreferences:', error.message); });
    });
}

export function syncMetrics(userId: string, metrics: TopicMetric[]): void {
  if (!metrics.length) return;
  const rows = metrics.map(m => ({
    id: m.id,
    user_id: userId,
    topic: m.topic,
    confidence: m.confidence,
    last_reviewed: m.lastReviewed,
    total_attempts: m.totalAttempts,
    correct_attempts: m.correctAttempts,
  }));
  supabase.from('metrics').upsert(rows, { onConflict: 'user_id,topic' })
    .then(({ error }) => { if (error) console.error('syncMetrics:', error.message); });
}

export async function migrateLocalToCloud(userId: string): Promise<void> {
  await ensureRows(userId);

  const readLocal = (key: string) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  };

  const streak = readLocal('quizwise_streak');
  const examTerms = readLocal('quizwise_exam_terms');
  const quizHistory = readLocal('quizwise_quiz_history');
  const examHistory = readLocal('quizwise_exam_history');
  const recallHistory = readLocal('quizwise_recall_history');
  const mistakeQueue = readLocal('quizwise_mistake_queue');

  if (streak || examTerms || quizHistory || examHistory || recallHistory || mistakeQueue) {
    await supabase.from('user_learning_data').update({
      ...(streak ? { streak } : {}),
      ...(examTerms ? { exam_terms: examTerms } : {}),
      ...(quizHistory ? { quiz_history: quizHistory } : {}),
      ...(examHistory ? { exam_history: examHistory } : {}),
      ...(recallHistory ? { recall_history: recallHistory } : {}),
      ...(mistakeQueue ? { mistake_queue: mistakeQueue } : {}),
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
  }

  const savedQuizzes = readLocal('quizwise_saved_quizzes');
  const savedExams = readLocal('quizwise_saved_exams');
  const libMeta = readLocal('quizwise_lib_meta');
  const studyEvents = readLocal('study_events');
  const studyTemplates = readLocal('study_templates');
  const readingProgress = readLocal('quizwise_reading_progress');
  const readerLog = readLocal('quizwise_reader_log');

  if (savedQuizzes || savedExams || libMeta || studyEvents || studyTemplates || readingProgress || readerLog) {
    await supabase.from('user_saved_content').update({
      ...(savedQuizzes ? { saved_quizzes: savedQuizzes } : {}),
      ...(savedExams ? { saved_exams: savedExams } : {}),
      ...(libMeta ? { lib_meta: libMeta } : {}),
      ...(studyEvents ? { study_events: studyEvents } : {}),
      ...(studyTemplates ? { study_templates: studyTemplates } : {}),
      ...(readingProgress ? { reading_progress: readingProgress } : {}),
      ...(readerLog ? { reader_log: readerLog } : {}),
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
  }

  const localMetrics: TopicMetric[] = readLocal('quizwise_metrics') || [];
  if (localMetrics.length) syncMetrics(userId, localMetrics);

  const prefs: CloudPreferences = {};
  const theme = localStorage.getItem('theme');
  const accent = localStorage.getItem('accent_color');
  const font = localStorage.getItem('font_choice');
  const lh = localStorage.getItem('line_height');
  if (theme) prefs.theme = theme;
  if (accent) prefs.accent_color = accent;
  if (font) prefs.font_choice = font;
  if (lh) prefs.line_height = lh;
  const lang = localStorage.getItem('quizwise_language');
  if (lang) prefs.language = lang;
  if (localStorage.getItem('quizwise_onboarding_done')) prefs.onboarding_done = true;
  if (localStorage.getItem('quizwise_feynman_intro_v1')) prefs.feynman_intro_done = true;
  if (localStorage.getItem('quizwise_feynman_intro_done')) prefs.recall_intro_done = true;

  if (Object.keys(prefs).length) syncPreferences(userId, prefs);
}
