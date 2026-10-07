import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, RotateCcw, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import type { ProcessedDocument } from '../types';
import { useTranslation } from '../i18n/I18nProvider';
import { toast } from '../services/toast';
import { resolveErrorMessage } from '../services/errorMessages';
import { evaluateSelfCheck, type SelfCheckResult } from '../services/geminiService';
import { citedPages, stripCitations } from '../services/subjectStudio';
import { canReadFullText, readPdfPages } from '../services/pdfFullText';
import type { StudioSourceRef } from '../services/studioStore';

export interface SelfCheckState {
  answer: string;
  result?: SelfCheckResult;
  revealed?: boolean;
}

interface Props {
  question: string;
  /** Musterantwort mit Fußnoten. */
  reference: string;
  sources: StudioSourceRef[];
  documents: ProcessedDocument[];
  state: SelfCheckState | undefined;
  onChange: (next: SelfCheckState) => void;
  /** Markdown mit klickbaren Fußnoten (aus SubjectStudio). */
  renderRich: (markdown: string) => React.ReactNode;
}

/** Höchstens so viele zitierte Seiten gehen als Quellenauszug in die Bewertung. */
const MAX_EXCERPT_PAGES = 4;

/** Text der zitierten Seiten (oder die Zusammenfassung der Quelle), damit die Bewertung nicht nur an der Musterantwort hängt. */
const buildExcerpts = async (reference: string, sources: StudioSourceRef[], documents: ProcessedDocument[]): Promise<string> => {
  const parts: string[] = [];
  let pagesLeft = MAX_EXCERPT_PAGES;
  for (const { n, pages } of citedPages(reference)) {
    const doc = documents.find(d => d.id === sources.find(s => s.n === n)?.docId);
    if (!doc) continue;
    if (pages.length && canReadFullText(doc)) {
      const all = await readPdfPages(doc).catch(() => null);
      for (const p of pages.slice(0, pagesLeft)) {
        const text = all?.[p - 1]?.replace(/\s+/g, ' ').trim();
        if (text) { parts.push(`[${doc.name}, Seite ${p}]\n${text}`); pagesLeft -= 1; }
      }
    } else if (doc.digestStatus === 'ready' && doc.digestText) {
      parts.push(`[${doc.name}]\n${doc.digestText.slice(0, 4000)}`);
    }
    if (pagesLeft <= 0) break;
  }
  return parts.join('\n\n');
};

const VERDICT_STYLE = {
  correct: { icon: CheckCircle2, color: '#059669', bg: 'color-mix(in srgb, #10b981 12%, transparent)' },
  partial: { icon: AlertCircle, color: '#b45309', bg: 'color-mix(in srgb, #f59e0b 14%, transparent)' },
  wrong:   { icon: XCircle,      color: '#e11d48', bg: 'color-mix(in srgb, #f43f5e 12%, transparent)' },
} as const;

const VERDICT_LABEL = {
  correct: 'stu.sc.verdict.correct',
  partial: 'stu.sc.verdict.partial',
  wrong: 'stu.sc.verdict.wrong',
} as const;

/** Eine Verständnisfrage als Selbsttest: eigene Antwort schreiben, prüfen lassen, Musterantwort aufdecken. */
export const StudioSelfCheck: React.FC<Props> = ({ question, reference, sources, documents, state, onChange, renderRich }) => {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const answer = state?.answer ?? '';
  const result = state?.result;
  const revealed = !!state?.revealed || !!result;

  const check = async () => {
    if (!answer.trim()) return;
    setChecking(true);
    try {
      const excerpts = await buildExcerpts(reference, sources, documents);
      const res = await evaluateSelfCheck(question, stripCitations(reference), excerpts, answer);
      onChange({ answer, result: res, revealed: true });
    } catch (e) {
      toast.error(resolveErrorMessage(e));
    } finally {
      setChecking(false);
    }
  };

  const style = result ? VERDICT_STYLE[result.verdict] : null;
  const VerdictIcon = style?.icon;
  const btn = 'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-40';

  return (
    <div className="rounded-2xl p-4 sm:p-5 space-y-3" style={{ background: 'var(--bg-main)', border: `1px solid ${style ? style.color : 'var(--border-color)'}` }}>
      <p className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--text-main)' }}>{question}</p>

      {!result && (
        <textarea
          value={answer}
          onChange={e => onChange({ ...state, answer: e.target.value })}
          placeholder={t('stu.sc.placeholder')}
          rows={3}
          disabled={checking}
          className="w-full px-3.5 py-2.5 rounded-xl text-[14.5px] leading-relaxed outline-none resize-y"
          style={{ background: 'var(--bg-sidebar)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
        />
      )}

      {result && (
        <>
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap rounded-xl px-3.5 py-2.5" style={{ background: 'var(--bg-sidebar)', color: 'var(--text-main)' }}>{answer}</p>
          <div className="rounded-xl px-3.5 py-3 space-y-1.5" style={{ background: style!.bg }}>
            <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: style!.color }}>
              {VerdictIcon && <VerdictIcon className="w-4 h-4" strokeWidth={2.25} />}
              {t(VERDICT_LABEL[result.verdict])} · {result.score} %
            </p>
            <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text-main)' }}>{result.feedback}</p>
            {result.missing.length > 0 && (
              <ul className="text-[13.5px] space-y-0.5 pl-1" style={{ color: 'var(--text-secondary)' }}>
                {result.missing.map((m, i) => <li key={i}>• {m}</li>)}
              </ul>
            )}
          </div>
        </>
      )}

      {revealed && (
        <div className="rounded-xl px-3.5 py-3 text-[14.5px]" style={{ background: 'var(--bg-sidebar)', border: '1px dashed var(--border-color)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: 'var(--text-secondary)' }}>{t('stu.sc.reference')}</p>
          {renderRich(reference)}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!result && (
          <button onClick={check} disabled={!answer.trim() || checking} className={btn} style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
            {checking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {checking ? t('stu.sc.checking') : t('stu.sc.check')}
          </button>
        )}
        {!result && (
          <button onClick={() => onChange({ ...state, answer, revealed: !state?.revealed })} className={btn} style={{ color: 'var(--text-secondary)' }}>
            {state?.revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {state?.revealed ? t('stu.sc.hide') : t('stu.sc.reveal')}
          </button>
        )}
        {result && (
          <button onClick={() => onChange({ answer: '' })} className={btn} style={{ color: 'var(--text-secondary)' }}>
            <RotateCcw className="w-3.5 h-3.5" /> {t('stu.sc.retry')}
          </button>
        )}
      </div>
    </div>
  );
};
