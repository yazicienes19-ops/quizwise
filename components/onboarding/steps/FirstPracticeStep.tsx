import React, { useEffect, useRef, useState } from 'react';
import { QuizType, type Flashcard, type FlashcardDeck, type ProcessedDocument, type QuizQuestion } from '../../../types';
import { useTranslation } from '../../../i18n/I18nProvider';
import { generateQuizFromDocument, generateFlashcardsFromDocument, type GenerationSource } from '../../../services/geminiService';
import { createSrsState } from '../../../services/spacedRepetition';
import { gradeFromPercentage } from '../../../services/learningProfileService';
import { resolveErrorMessage } from '../../../services/errorMessages';
import type { FirstMomentPlan } from '../../../services/onboardingFirstMoment';

export interface PracticeFooter {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Abschluss-Screen: "Überspringen" wäre dort sinnlos. */
  hideSkip?: boolean;
}

interface FirstPracticeStepProps {
  /** null, solange das hochgeladene Dokument noch nicht im documents-State steht. */
  doc: ProcessedDocument | null;
  getDocumentSource: (doc: ProcessedDocument) => GenerationSource;
  plan: FirstMomentPlan;
  /** Karten-Modus: der fertige Stapel landet sofort in den Karteikarten des Nutzers. */
  onDeckCreated: (deck: FlashcardDeck) => void;
  /** Die Karte im Onboarding hat nur EINEN Hauptknopf, dieser Schritt steuert ihn. */
  setFooter: (footer: PracticeFooter) => void;
  onFinish: () => void;
}

type Generated = { kind: 'questions'; questions: QuizQuestion[] } | { kind: 'cards'; deck: FlashcardDeck };

const newId = () => Math.random().toString(36).slice(2, 9);

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every(x => b.includes(x));

const isUsable = (q: QuizQuestion) => Array.isArray(q.options) && q.options.length >= 2
  && Array.isArray(q.correctAnswerIndices) && q.correctAnswerIndices.length >= 1
  && q.correctAnswerIndices.every(i => i >= 0 && i < q.options.length);

const QUIZ_FOCUS = 'Bevorzuge Single-Choice mit genau einer richtigen Antwort aus 4 Optionen. Jede Frage prüft eine zentrale Aussage des Materials und ist klar erkennbar daraus entnommen. sourceReference nennt die konkrete Stelle (Kapitel, Abschnitt oder Folie).';

const generate = async (doc: ProcessedDocument, source: GenerationSource, plan: FirstMomentPlan): Promise<Generated> => {
  if (plan.mode === 'cards') {
    const raw = await generateFlashcardsFromDocument(source, plan.count);
    const cards: Flashcard[] = raw
      .filter(c => c.front && c.back)
      .map(c => ({ id: newId(), front: c.front!, back: c.back!, level: 0, nextReview: Date.now(), srs: createSrsState() }));
    if (cards.length === 0) throw new Error('empty');
    return { kind: 'cards', deck: { id: newId(), title: doc.name.replace(/\.[a-z0-9]+$/i, ''), cards, sourceDocumentId: doc.id } };
  }
  // Etwas mehr anfordern als gebraucht: Fragen ohne auswählbare Antwort fallen raus.
  const raw = await generateQuizFromDocument(source, QuizType.CUSTOM, {
    customCount: plan.count + 2,
    customDifficulty: plan.mode === 'exam' ? 'mittel' : 'leicht bis mittel',
    customFocus: QUIZ_FOCUS,
    questionType: ['mc', 'truefalse'],
  });
  const questions = raw.filter(isUsable).slice(0, plan.count);
  if (questions.length === 0) throw new Error('empty');
  return { kind: 'questions', questions };
};

/**
 * Der erste Moment nach dem Upload ist echtes Lernen: Fragen oder Karten aus
 * genau dem Skript, das der Nutzer gerade hochgeladen hat. Die Generierung
 * läuft pro Dokument nur einmal (Ref-Cache), auch wenn React den Effekt im
 * Entwicklungsmodus doppelt ausführt, damit kein zweiter teurer Aufruf entsteht.
 */
export const FirstPracticeStep: React.FC<FirstPracticeStepProps> = ({ doc, getDocumentSource, plan, onDeckCreated, setFooter, onFinish }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<Generated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const job = useRef<{ key: string; promise: Promise<Generated> } | null>(null);

  // Gemeinsamer Fortschritt für alle drei Modi.
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<number[][]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!doc) return;
    const key = `${doc.id}:${plan.mode}:${attempt}`;
    if (job.current?.key !== key) {
      let source: GenerationSource;
      try {
        source = getDocumentSource(doc);
      } catch (err) {
        setError(resolveErrorMessage(err));
        return;
      }
      const promise = generate(doc, source, plan).then(result => {
        if (result.kind === 'cards') onDeckCreated(result.deck);
        return result;
      });
      job.current = { key, promise };
    }
    let cancelled = false;
    job.current.promise
      .then(result => { if (!cancelled) setData(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error && err.message === 'empty' ? t('onboarding.v2.practice.empty') : resolveErrorMessage(err)); });
    return () => { cancelled = true; };
    // onDeckCreated/getDocumentSource bewusst nicht als Abhängigkeit: neue
    // Funktions-Identitäten dürfen keine zweite Generierung auslösen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, plan.mode, attempt]);

  const questions = data?.kind === 'questions' ? data.questions : [];
  const cards = data?.kind === 'cards' ? data.deck.cards : [];
  const total = data?.kind === 'cards' ? cards.length : questions.length;
  const isLast = index === total - 1;

  const goNext = () => {
    if (isLast) { setFinished(true); return; }
    setIndex(i => i + 1);
    setSelected([]);
    setRevealed(false);
  };

  // Hauptknopf der Onboarding-Karte je nach Zustand.
  useEffect(() => {
    if (error) { setFooter({ label: t('onboarding.v2.practice.continueWithout'), onClick: onFinish }); return; }
    if (!data) { setFooter({ label: t('onboarding.v2.practice.loadingCta'), onClick: () => {}, disabled: true }); return; }
    if (finished) { setFooter({ label: t('onboarding.v2.practice.finishCta'), onClick: onFinish, hideSkip: true }); return; }

    if (data.kind === 'cards') {
      setFooter(revealed
        ? { label: isLast ? t('onboarding.v2.practice.cards.done') : t('onboarding.v2.practice.cards.next'), onClick: goNext }
        : { label: t('onboarding.v2.practice.cards.flip'), onClick: () => setRevealed(true) });
      return;
    }

    if (plan.mode === 'exam') {
      setFooter({
        label: isLast ? t('onboarding.v2.practice.exam.submit') : t('onboarding.v2.practice.exam.next'),
        disabled: selected.length === 0,
        onClick: () => { setAnswers(a => [...a, selected]); goNext(); },
      });
      return;
    }

    setFooter(revealed
      ? { label: isLast ? t('onboarding.v2.practice.quiz.result') : t('onboarding.v2.practice.quiz.next'), onClick: goNext }
      : { label: t('onboarding.v2.practice.quiz.check'), disabled: selected.length === 0, onClick: () => { setAnswers(a => [...a, selected]); setRevealed(true); } });
    // goNext/onFinish/setFooter ändern sich pro Render, der Zustand oben ist die echte Quelle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, error, finished, revealed, selected, index, plan.mode, t]);

  const docName = (doc?.name ?? '').replace(/\.(txt|md|pdf|docx)$/i, '');

  if (error) {
    return (
      <>
        <h2 className="text-lg font-semibold tracking-tight mb-2" style={{ color: 'var(--text-main)' }}>
          {t('onboarding.v2.practice.errorTitle')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => { setError(null); setData(null); setAttempt(a => a + 1); }}
          className="px-4 py-2.5 rounded-[14px] text-[13px] font-semibold transition-colors"
          style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1.5px solid var(--border-color)' }}
        >
          {t('onboarding.v2.practice.retry')}
        </button>
      </>
    );
  }

  if (!data) {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto mb-5 w-10 h-10 rounded-full border-[3px] animate-spin" style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--primary)' }} />
        <h2 className="text-lg font-semibold tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
          {t(plan.mode === 'cards' ? 'onboarding.v2.practice.loadingCards' : plan.mode === 'exam' ? 'onboarding.v2.practice.loadingExam' : 'onboarding.v2.practice.loadingQuiz')}
        </h2>
        {docName && <p className="text-sm text-slate-500 dark:text-slate-400">{t('onboarding.v2.practice.fromDoc', { name: docName })}</p>}
      </div>
    );
  }

  // ── Abschluss ───────────────────────────────────────────────────────────
  if (finished) {
    if (data.kind === 'cards') {
      return (
        <div className="text-center py-2">
          <div className="text-4xl mb-3">🗂️</div>
          <h2 className="text-lg font-semibold tracking-tight mb-2" style={{ color: 'var(--text-main)' }}>
            {t('onboarding.v2.practice.cards.summaryTitle', { n: cards.length })}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('onboarding.v2.practice.cards.summaryBody')}</p>
        </div>
      );
    }
    const correct = questions.filter((q, i) => sameSet(answers[i] ?? [], q.correctAnswerIndices)).length;
    if (plan.mode === 'exam') {
      const grade = gradeFromPercentage(Math.round((correct / questions.length) * 100));
      return (
        <>
          <div className="text-center rounded-[20px] py-6 mb-4" style={{ background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-main))' }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1">{t('onboarding.v2.practice.exam.gradeLabel')}</p>
            <p className="text-5xl font-semibold tabular-nums" style={{ color: 'var(--primary)' }}>{grade.grade.replace('.', ',')}</p>
            <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text-main)' }}>{grade.label}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('onboarding.v2.practice.scoreLine', { correct, total: questions.length })}</p>
          </div>
          <ul className="space-y-2 mb-3">
            {questions.map((q, i) => {
              const ok = sameSet(answers[i] ?? [], q.correctAnswerIndices);
              return (
                <li key={i} className="text-sm px-3 py-2.5 rounded-[12px]" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
                  <p className="font-semibold">{ok ? '✓' : '✗'} {q.question}</p>
                  {!ok && <p className="text-xs mt-1 text-emerald-700 dark:text-emerald-400">{t('onboarding.v2.practice.correctWas', { answer: q.correctAnswerIndices.map(c => q.options[c]).join(', ') })}</p>}
                  {q.sourceReference && <p className="text-[11px] mt-1 text-slate-400">📄 {q.sourceReference}</p>}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{t('onboarding.v2.practice.allFromDoc', { name: docName })}</p>
        </>
      );
    }
    return (
      <div className="text-center py-2">
        <div className="text-4xl mb-3">{correct === questions.length ? '🎉' : '💪'}</div>
        <h2 className="text-lg font-semibold tracking-tight mb-2" style={{ color: 'var(--text-main)' }}>
          {t('onboarding.v2.practice.scoreLine', { correct, total: questions.length })}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('onboarding.v2.practice.allFromDoc', { name: docName })}</p>
      </div>
    );
  }

  const progress = (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-2">
      {t(data.kind === 'cards' ? 'onboarding.v2.practice.cards.progress' : plan.mode === 'exam' ? 'onboarding.v2.practice.exam.progress' : 'onboarding.v2.practice.quiz.progress', { n: index + 1, total })}
    </p>
  );

  // ── Karteikarten ────────────────────────────────────────────────────────
  if (data.kind === 'cards') {
    const card = cards[index];
    return (
      <>
        {progress}
        <button
          type="button"
          onClick={() => setRevealed(r => !r)}
          className="w-full min-h-[180px] rounded-[20px] p-6 text-left flex flex-col justify-center transition-all active:scale-[0.99]"
          style={{ background: revealed ? 'color-mix(in srgb, var(--primary) 8%, var(--bg-main))' : 'var(--bg-main)', border: '2px solid var(--border-color)' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-2">
            {revealed ? t('onboarding.v2.practice.cards.back') : t('onboarding.v2.practice.cards.front')}
          </p>
          <p key={revealed ? 'b' : 'f'} className="text-base font-semibold leading-relaxed whitespace-pre-line animate-in fade-in duration-200" style={{ color: 'var(--text-main)' }}>
            {revealed ? card.back : card.front}
          </p>
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 text-center">{t('onboarding.v2.practice.fromDoc', { name: docName })}</p>
      </>
    );
  }

  // ── Fragen (Quiz mit sofortiger Rückmeldung oder Mini-Klausur) ──────────
  const q = questions[index];
  const multi = q.correctAnswerIndices.length > 1;
  const showResult = plan.mode === 'quiz' && revealed;
  const toggle = (i: number) => {
    if (showResult) return;
    setSelected(s => multi ? (s.includes(i) ? s.filter(x => x !== i) : [...s, i]) : [i]);
  };
  const isCorrect = sameSet(selected, q.correctAnswerIndices);

  return (
    <>
      {progress}
      <h2 className="text-base font-semibold leading-relaxed mb-1" style={{ color: 'var(--text-main)' }}>{q.question}</h2>
      {multi && <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('onboarding.v2.practice.multiHint')}</p>}
      <div className="space-y-2 mt-3">
        {q.options.map((opt, i) => {
          const chosen = selected.includes(i);
          const right = q.correctAnswerIndices.includes(i);
          let style: React.CSSProperties = chosen
            ? { background: 'color-mix(in srgb, var(--primary) 14%, var(--bg-main))', border: '2px solid var(--primary)', color: 'var(--text-main)' }
            : { background: 'var(--bg-main)', border: '2px solid var(--border-color)', color: 'var(--text-main)' };
          if (showResult && right) style = { background: 'color-mix(in srgb, #10b981 14%, var(--bg-main))', border: '2px solid #10b981', color: 'var(--text-main)' };
          else if (showResult && chosen) style = { background: 'color-mix(in srgb, #f43f5e 12%, var(--bg-main))', border: '2px solid #f43f5e', color: 'var(--text-main)' };
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className="w-full text-left px-4 py-3 rounded-[14px] text-sm font-medium min-h-[48px] transition-all active:scale-[0.99]"
              style={style}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {showResult && (
        <div className="mt-4 rounded-[14px] p-4 animate-in fade-in duration-200" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
          <p className={`text-sm font-semibold mb-1 ${isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {isCorrect ? t('onboarding.v2.practice.right') : t('onboarding.v2.practice.wrong')}
          </p>
          {q.explanation && <p className="text-sm leading-relaxed" style={{ color: 'var(--text-main)' }}>{q.explanation}</p>}
          {q.sourceReference && (
            <p className="text-xs mt-2 font-semibold" style={{ color: 'var(--primary)' }}>
              📄 {t('onboarding.v2.practice.sourceRef', { ref: q.sourceReference })}
            </p>
          )}
        </div>
      )}
    </>
  );
};
