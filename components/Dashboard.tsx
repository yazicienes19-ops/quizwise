
import React, { useState, useMemo } from 'react';
import { ActiveTab, LearningFlowResult, StudyEntry, ProcessedDocument } from '../types';
import { toast } from '../services/toast';
import { ArrowRight } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface DashboardProps {
  onTabChange: (tab: ActiveTab) => void;
  flowResult: LearningFlowResult | null;
  onAcceptFlow: (res: LearningFlowResult) => void;
  user?: User | null;
  documents?: ProcessedDocument[];
}

interface AgendaItem {
  time: string;
  dur: string;
  title: string;
  kind: 'recall' | 'cards' | 'quiz' | 'exam' | 'thesis' | 'library' | 'planner';
  tab: ActiveTab;
}

const KIND_LABEL: Record<AgendaItem['kind'], string> = {
  recall:  'Aktives Erinnern',
  cards:   'Wiederholung',
  quiz:    'Wissensprüfung',
  exam:    'Klausur-Simulation',
  thesis:  'Hausarbeit',
  library: 'Bibliothek',
  planner: 'Lernplaner',
};

const DEMO_AGENDA: AgendaItem[] = [
  { time: '09:00', dur: '45m', title: 'Recall · Erste Sitzung',      kind: 'recall',  tab: ActiveTab.RECALL },
  { time: '10:00', dur: '30m', title: 'Karteikarten · Grundlagen',   kind: 'cards',   tab: ActiveTab.CARDS },
  { time: '11:00', dur: '60m', title: 'Quiz · 15 Fragen',            kind: 'quiz',    tab: ActiveTab.QUIZ },
  { time: '14:00', dur: '90m', title: 'Klausur-Simulation',          kind: 'exam',    tab: ActiveTab.EXAM },
  { time: '16:30', dur: '45m', title: 'Hausarbeit · Kapitel 2',      kind: 'thesis',  tab: ActiveTab.PAPER },
];

interface ModuleDef {
  id: ActiveTab;
  num: string;
  title: string;
  kicker: string;
  desc: string;
}

const MODULES: ModuleDef[] = [
  { id: ActiveTab.RECALL,    num: '01', title: 'Recall Studio',  kicker: 'Active Recall',      desc: 'Themen mit der Feynman-Methode durcharbeiten.' },
  { id: ActiveTab.LIBRARY,   num: '02', title: 'Bibliothek',     kicker: 'Quellenarchiv',       desc: 'PDFs und Notizen verwalten und durchsuchen.' },
  { id: ActiveTab.QUIZ,      num: '03', title: 'Quiz Center',    kicker: 'Wissensprüfung',      desc: 'KI-generierte Tests aus eigenen Unterlagen.' },
  { id: ActiveTab.EXAM,      num: '04', title: 'Klausur-Modus',  kicker: 'Prüfungssimulation',  desc: 'Zeitgesteuerte Simulation echter Prüfungen.' },
  { id: ActiveTab.CARDS,     num: '05', title: 'Karteikarten',   kicker: 'Spaced Repetition',   desc: 'Anki-Kartentraining mit Selbsteinschätzung.' },
  { id: ActiveTab.RADAR,     num: '06', title: 'Lern-Analyse',   kicker: 'Lückenradar',         desc: 'Blinde Flecken erkennen, Lernzeit priorisieren.' },
];

function getWeekNumber(): number {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Guten Morgen';
  if (h < 17) return 'Guten Tag';
  return 'Guten Abend';
}

function getFirstName(user?: User | null): string {
  if (!user) return 'Student';
  const full = user.user_metadata?.full_name || user.email || '';
  return full.split(/[\s@]/)[0] || 'Student';
}

function getTodayAgenda(): AgendaItem[] {
  try {
    const plan: StudyEntry[] = JSON.parse(localStorage.getItem('study_plan') || '[]');
    const today = new Date().toLocaleDateString('de-DE', { weekday: 'long' });
    const todayItems = plan
      .filter(e => !e.completed && e.day === today)
      .slice(0, 5)
      .map(e => ({
        time: e.startTime,
        dur:  e.endTime ? `${Math.max(0, (new Date(`1970-01-01T${e.endTime}`).getTime() - new Date(`1970-01-01T${e.startTime}`).getTime()) / 60000)}m` : '–',
        title: `${e.subject} · ${e.topic}`,
        kind: 'planner' as AgendaItem['kind'],
        tab: ActiveTab.PLANNER,
      }));
    return todayItems.length > 0 ? todayItems : DEMO_AGENDA;
  } catch {
    return DEMO_AGENDA;
  }
}

function formatFileDate(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tagen`;
}

// Section header: serif title + right meta + full-width ink rule below
const SectionHeader = ({ title, meta }: { title: string; meta: string }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1.5px solid var(--ink)', paddingBottom: 8, marginBottom: 0 }}>
    <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
      {title}
    </h2>
    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--mute)', whiteSpace: 'nowrap' }}>{meta}</span>
  </div>
);

// Stat block below a hairline rule
const StatBlock = ({ label, value, unit, note }: { label: string; value: string; unit: string; note: string }) => (
  <div style={{ padding: '14px 0', borderTop: '1px solid var(--border-color)' }}>
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--mute)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
      {label}
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 38, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--mute)', fontStyle: 'italic' }}>{unit}</span>
    </div>
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--mute)', marginTop: 6 }}>{note}</div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ onTabChange, flowResult, user, documents = [] }) => {
  const agenda = useMemo(getTodayAgenda, []);
  const week = getWeekNumber();
  const greeting = getGreeting();
  const firstName = getFirstName(user);

  // Count pending agenda items
  const pendingCount = useMemo(() => {
    try {
      const plan: StudyEntry[] = JSON.parse(localStorage.getItem('study_plan') || '[]');
      const today = new Date().toLocaleDateString('de-DE', { weekday: 'long' });
      return plan.filter(e => !e.completed && e.day === today).length || agenda.length;
    } catch { return agenda.length; }
  }, [agenda.length]);

  // Recent documents for the library table
  const recentDocs = useMemo(() =>
    [...documents]
      .sort((a, b) => (b.uploadDate || 0) - (a.uploadDate || 0))
      .slice(0, 5),
    [documents]
  );

  // KI suggestions (flowResult)
  const hasSuggestions = flowResult && flowResult.next_actions.length > 0;

  return (
    <div className="animate-in fade-in duration-500">

      {/* ── Masthead ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--mute)', letterSpacing: '0.22em', textTransform: 'uppercase', lineHeight: 1.6 }}>
          Heute<br />Woche&nbsp;{week}
        </div>
        <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--mute)' }}>
          <span>Vol. IV</span><span>·</span><span>№&nbsp;{week * 7 + new Date().getDay()}</span>
        </div>
      </div>

      {/* ── Headline ── */}
      <h1 style={{
        fontFamily: 'var(--font-serif)', fontSize: 'clamp(42px, 5.5vw, 64px)',
        fontWeight: 400, lineHeight: 0.98,
        letterSpacing: '-0.025em', color: 'var(--ink)', margin: '0 0 10px',
      }}>
        {greeting}, {firstName}.
        <br />
        <span style={{ fontStyle: 'italic', color: 'var(--primary)', fontFamily: 'var(--font-hand)', fontSize: 'clamp(38px, 5vw, 60px)' }}>
          {hasSuggestions ? `${flowResult!.next_actions.length} Themen` : 'QuizWise'}
        </span>
        {' '}
        <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'normal' }}>
          {hasSuggestions ? 'warten heute auf dich.' : 'ist bereit.'}
        </span>
      </h1>

      <p style={{
        fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--ink2)',
        lineHeight: 1.55, maxWidth: 680, margin: '0 0 32px', fontStyle: 'italic',
      }}>
        {hasSuggestions
          ? `"${flowResult!.next_actions[0].why}"`
          : 'Lade dein erstes Dokument hoch und starte eine Lernsession — in weniger als einer Minute.'
        }
      </p>

      {/* ── Two-column: Agenda + Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 40, marginBottom: 48 }}
        className="block lg:grid">

        {/* Left: Heute fortsetzen */}
        <section>
          <SectionHeader title="Heute fortsetzen" meta={`${pendingCount} anstehend`} />
          {agenda.map((item, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 20, alignItems: 'center',
              padding: '14px 0', borderBottom: '1px solid var(--border-soft)',
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink)', letterSpacing: '0.04em' }}>{item.time}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>{item.dur}</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--ink)', marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--mute)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {KIND_LABEL[item.kind]}
                </div>
              </div>
              <button
                onClick={() => onTabChange(item.tab)}
                style={{
                  border: '1px solid var(--ink)', borderRadius: 2, cursor: 'pointer',
                  padding: '6px 14px', fontFamily: 'var(--font-sans)', fontSize: 12,
                  fontWeight: 500, letterSpacing: '0.04em',
                  background: i === 0 ? 'var(--ink)' : 'transparent',
                  color: i === 0 ? 'var(--bg-main)' : 'var(--ink)',
                  whiteSpace: 'nowrap',
                }}
              >
                {i === 0 ? 'Beginnen' : 'Öffnen'}
              </button>
            </div>
          ))}
        </section>

        {/* Right: Diese Woche stats */}
        <aside className="mt-8 lg:mt-0">
          <SectionHeader title="Diese Woche" meta="17 Tage Serie" />
          <StatBlock label="Recall-Serie"      value="17"  unit="Tage"    note="länger als 92 % der Kohorte" />
          <StatBlock label="Karten gemeistert" value="482" unit="von 614" note="+ 24 in den letzten 24 Std." />
          <StatBlock label="Genauigkeit"       value="87"  unit="%"       note="+ 4 % gegenüber Vorwoche" />
          <StatBlock label="Offene Lücken"     value={String(Math.max(0, documents.length * 2 || 6))} unit="Themen" note="zwei davon prüfungsrelevant" />
        </aside>
      </div>

      {/* ── Module Index ── */}
      <section style={{ marginBottom: 48 }}>
        <SectionHeader title="Index" meta="Sechs Module" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 20 }}
          className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod, i) => (
            <button key={mod.id} onClick={() => onTabChange(mod.id)}
              style={{
                background: 'var(--card)', border: '1px solid var(--border-color)',
                borderRadius: 4, padding: '20px 22px 22px',
                textAlign: 'left', cursor: 'pointer',
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)', letterSpacing: '0.06em' }}>{mod.num}</span>
                <span style={{
                  fontFamily: 'var(--font-sans)', fontSize: 10, color: i === 0 ? 'var(--primary)' : 'var(--mute)',
                  letterSpacing: '0.16em', textTransform: 'uppercase',
                  fontWeight: i === 0 ? 600 : 400,
                }}>
                  {i === 0 ? 'Empfehlung' : mod.kicker}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, lineHeight: 1.08, color: 'var(--ink)', letterSpacing: '-0.015em', marginBottom: 8 }}>
                {mod.title}
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
                {mod.desc}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 18, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>
                Öffnen <ArrowRight style={{ width: 13, height: 13 }} strokeWidth={2} />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Zuletzt aus der Bibliothek ── */}
      <section style={{ marginBottom: 48 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1.5px solid var(--ink)', paddingBottom: 8, marginBottom: 0 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Zuletzt aus der Bibliothek
          </h2>
          <button onClick={() => onTabChange(ActiveTab.LIBRARY)} style={{
            fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--primary)',
            cursor: 'pointer', background: 'none', border: 'none',
          }}>
            Alle anzeigen →
          </button>
        </div>

        {recentDocs.length === 0 ? (
          <div style={{ padding: '32px 0', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--mute)' }}>
            Noch keine Dokumente in der Bibliothek.{' '}
            <button onClick={() => onTabChange(ActiveTab.LIBRARY)} style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontStyle: 'italic', fontSize: 16, fontFamily: 'var(--font-serif)' }}>
              Erstes Dokument hochladen →
            </button>
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--font-sans)' }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '36px 2fr 1.4fr 120px',
              gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border-soft)',
              fontSize: 10, color: 'var(--mute)', letterSpacing: '0.16em', textTransform: 'uppercase',
            }}>
              <span>№</span><span>Titel</span><span>Typ</span><span>Hinzugefügt</span>
            </div>
            {recentDocs.map((doc, i) => (
              <div key={doc.id} style={{
                display: 'grid', gridTemplateColumns: '36px 2fr 1.4fr 120px',
                gap: 16, padding: '13px 0', borderBottom: '1px solid var(--border-soft)',
                alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.name}
                </span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--ink2)', fontStyle: 'italic' }}>
                  {doc.type === 'pdf' ? 'PDF' : doc.type === 'docx' ? 'Word-Dokument' : 'Text'}
                </span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--mute)' }}>
                  {doc.uploadDate ? formatFileDate(doc.uploadDate) : '–'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
