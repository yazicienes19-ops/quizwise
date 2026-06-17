-- QuizWise Cloud-Sync Migration
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Erstellt Tabellen für localStorage → Cloud-Sync

-- 1. Lern-Daten (Streak, Exam-Termine, History)
CREATE TABLE IF NOT EXISTS public.user_learning_data (
  user_id        uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  streak         jsonb NOT NULL DEFAULT '{"current":0,"best":0,"lastDay":null}',
  exam_terms     jsonb NOT NULL DEFAULT '[]',
  quiz_history   jsonb NOT NULL DEFAULT '[]',
  exam_history   jsonb NOT NULL DEFAULT '[]',
  recall_history jsonb NOT NULL DEFAULT '[]',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_learning_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigene Lerndaten lesen" ON public.user_learning_data
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Eigene Lerndaten einfügen" ON public.user_learning_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Eigene Lerndaten aktualisieren" ON public.user_learning_data
  FOR UPDATE USING (auth.uid() = user_id);

-- 2. Gespeicherte Inhalte (Quizze, Klausuren, Bibliotheks-Meta, Planer)
CREATE TABLE IF NOT EXISTS public.user_saved_content (
  user_id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  saved_quizzes   jsonb NOT NULL DEFAULT '[]',
  saved_exams     jsonb NOT NULL DEFAULT '[]',
  lib_meta        jsonb NOT NULL DEFAULT '{}',
  study_events    jsonb NOT NULL DEFAULT '[]',
  study_templates jsonb NOT NULL DEFAULT '[]',
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_saved_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigene gespeicherte Inhalte lesen" ON public.user_saved_content
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Eigene gespeicherte Inhalte einfügen" ON public.user_saved_content
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Eigene gespeicherte Inhalte aktualisieren" ON public.user_saved_content
  FOR UPDATE USING (auth.uid() = user_id);

-- 3. Preferences-Spalte in profiles (Theme, Akzentfarbe, Font, Onboarding-Flags)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}';
