import React, { useState, useEffect } from 'react';
import { AcademicSource, CitationStyle, SearchResult, ProcessedDocument, MultiStyleCitation, PaperFramework } from '../types';
import { EmojiImage } from './EmojiImage';
import { generatePaperFramework, formatCitationFull, GenerationSource, magicFormatCitation } from '../services/geminiService';
import { documentDisplayName } from '../services/libraryService';
import { toast } from '../services/toast';

interface TermPaperSystemProps {
  availableDocuments: ProcessedDocument[];
  onUploadNew: (file: File) => void;
  initialSources?: SearchResult[];
  getDocumentSource: (doc: ProcessedDocument) => GenerationSource;
}

type Tab = 'guide' | 'outline' | 'phrases' | 'citations' | 'magic' | 'paraphrase' | 'checklist';

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = 'Kopieren' }) => {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handle}
      className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl transition-all ${copied ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600'}`}
    >
      {copied ? '✓ Kopiert' : label}
    </button>
  );
};

const InTextRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center gap-2 justify-between">
    <span className="text-[9px] font-bold text-slate-400 shrink-0">{label}:</span>
    <div className="flex items-center gap-1.5 min-w-0">
      <code className="text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded font-mono text-slate-700 dark:text-slate-300 truncate max-w-[160px]">{value || '–'}</code>
      {value && <CopyButton text={value} />}
    </div>
  </div>
);

// ─── Static data ──────────────────────────────────────────────────────────────

const GUIDE_SECTIONS = [
  {
    title: 'Titelblatt',
    icon: '📄',
    color: 'indigo',
    items: [
      'Name der Hochschule + Fachbereich',
      'Titel der Hausarbeit (kein Fettdruck)',
      'Veranstaltungstitel + Semester',
      'Name des Dozenten / der Dozentin',
      'Vor- und Nachname, Matrikelnummer, Studiengang',
      'E-Mail-Adresse + Abgabedatum',
      'Keine Seitenzahl auf dem Titelblatt',
    ]
  },
  {
    title: 'Inhaltsverzeichnis',
    icon: '📋',
    color: 'violet',
    items: [
      'Alle Kapitel und Unterkapitel nummeriert (1., 1.1, 1.2 ...)',
      'Seitenzahlen rechtsbündig',
      'Literaturverzeichnis am Ende aufführen (ohne Nummer)',
      'Anhänge falls vorhanden aufführen',
      'Keine Seitenzahl für das Inhaltsverzeichnis selbst',
    ]
  },
  {
    title: 'Einleitung (10–15 % der Arbeit)',
    icon: '🚪',
    color: 'blue',
    items: [
      'Thema einführen: Warum ist das relevant?',
      'Forschungsfrage / Fragestellung klar benennen',
      'Abgrenzung: Was wird NICHT behandelt und warum?',
      'Methode kurz erläutern (Literaturarbeit, Empirik, ...)',
      'Aufbau der Arbeit skizzieren ("Die Arbeit gliedert sich wie folgt...")',
      'Keine Ergebnisse oder Schlussfolgerungen vorwegnehmen',
    ]
  },
  {
    title: 'Hauptteil (70–80 % der Arbeit)',
    icon: '📖',
    color: 'emerald',
    items: [
      'Roter Faden: Jedes Kapitel muss zur Fragestellung beitragen',
      'Vom Allgemeinen zum Speziellen strukturieren',
      'Jeden Abschnitt mit Überleitung zum nächsten beenden',
      'Aussagen immer belegen — keine unbelegten Behauptungen',
      'Direkte Zitate sparsam einsetzen (max. 10–15 % des Textes)',
      'Eigene Analyse/Interpretation, nicht nur Wiedergabe von Quellen',
      'Fachbegriffe beim ersten Vorkommen erklären',
    ]
  },
  {
    title: 'Fazit / Schluss (10–15 % der Arbeit)',
    icon: '🎯',
    color: 'amber',
    items: [
      'Keine neuen Argumente — nur Zusammenfassung der Ergebnisse',
      'Forschungsfrage explizit beantworten',
      'Kritische Reflexion: Grenzen der eigenen Arbeit benennen',
      'Ausblick: Welche Fragen bleiben offen? Zukünftige Forschung?',
      'Kein Zitat im Fazit',
    ]
  },
  {
    title: 'Literaturverzeichnis',
    icon: '📚',
    color: 'rose',
    items: [
      'Alphabetisch nach Nachname des Erstautors sortieren',
      'Alle im Text zitierten Quellen müssen hier erscheinen (und umgekehrt)',
      'Einheitlicher Zitierstil (APA / Harvard / Chicago — je nach Vorgabe)',
      'Internetquellen: Zuletzt abgerufen am [Datum] angeben',
      'Kein "und weiter" oder "et al." im Verzeichnis — alle Autoren ausschreiben',
    ]
  },
  {
    title: 'Formatierung',
    icon: '⚙️',
    color: 'slate',
    items: [
      'Schriftart: Times New Roman 12pt oder Arial 11pt',
      'Zeilenabstand: 1,5-fach (Fußnoten: einfach)',
      'Seitenränder: Links 3 cm, Rechts 2,5 cm, Oben/Unten je 2,5 cm',
      'Absatzabstand: 6–12 pt nach jedem Absatz (kein doppelter Zeilenabstand zwischen Absätzen)',
      'Blocksatz mit automatischer Silbentrennung',
      'Seitenzahlen: Ab der Einleitung, unten mittig oder rechts',
      'Fußnoten: Schriftgröße 10pt, einfacher Zeilenabstand',
      'Anhänge beginnen auf neuer Seite, eigene Seitennummerierung (I, II, III)',
    ]
  },
];

const PHRASE_CATEGORIES = [
  {
    label: 'Einleitung',
    color: 'indigo',
    phrases: [
      { title: 'Thema einführen', text: 'In der vorliegenden Arbeit wird der Frage nachgegangen, ob ...' },
      { title: 'Ziel benennen', text: 'Ziel der vorliegenden Arbeit ist es, ... zu untersuchen.' },
      { title: 'Fragestellung', text: 'Die Hausarbeit beschäftigt sich mit der Frage, inwiefern ...' },
      { title: 'Relevanz', text: 'Die Relevanz dieses Themas ergibt sich aus ...' },
      { title: 'Aufbau', text: 'Die Arbeit gliedert sich wie folgt: Zunächst wird ... dargestellt, bevor anschließend ... analysiert wird. Abschließend ...' },
      { title: 'Abgrenzung', text: 'Aus Gründen des begrenzten Umfangs dieser Arbeit kann ... nicht berücksichtigt werden.' },
    ]
  },
  {
    label: 'Übergänge',
    color: 'violet',
    phrases: [
      { title: 'Nächster Punkt', text: 'Im Folgenden wird ...' },
      { title: 'Aufbauend', text: 'Aufbauend auf den vorherigen Überlegungen ...' },
      { title: 'In Bezug auf', text: 'In Bezug auf ... lässt sich festhalten, dass ...' },
      { title: 'Anknüpfend', text: 'Anknüpfend an die bisherigen Ausführungen ...' },
      { title: 'Zusammenfassend (Kapitel)', text: 'Zusammenfassend lässt sich für diesen Abschnitt festhalten, dass ...' },
      { title: 'Überleitung', text: 'Nachdem ... dargelegt wurde, soll nun ... betrachtet werden.' },
    ]
  },
  {
    label: 'Argumentation',
    color: 'blue',
    phrases: [
      { title: 'Ergänzung', text: 'Hinzu kommt, dass ...' },
      { title: 'Betonung', text: 'In diesem Zusammenhang ist hervorzuheben, dass ...' },
      { title: 'Kritik', text: 'Kritisch anzumerken ist, dass ...' },
      { title: 'Schlussfolgerung', text: 'Dies verdeutlicht, dass ...' },
      { title: 'Darüber hinaus', text: 'Darüber hinaus ist zu beachten, dass ...' },
      { title: 'Gegenposition', text: 'Dem ist jedoch entgegenzuhalten, dass ...' },
    ]
  },
  {
    label: 'Zitate einführen',
    color: 'emerald',
    phrases: [
      { title: 'Direkt zitieren', text: 'Wie [Autor:in] ([Jahr], S. X) treffend formuliert: „..."' },
      { title: 'Indirekt', text: 'Laut [Autor:in] ([Jahr], S. X) ...' },
      { title: 'Betonen', text: '[Autor:in] ([Jahr]) betont in diesem Zusammenhang, dass ...' },
      { title: 'Belegen', text: 'Dieser Befund deckt sich mit der Position von [Autor:in] ([Jahr]), die/der ...' },
      { title: 'Paraphrase', text: 'Im Sinne von [Autor:in] ([Jahr]) lässt sich argumentieren, dass ...' },
      { title: 'Querverweis', text: 'Vgl. hierzu auch [Autor:in] ([Jahr], S. X), der/die ...' },
    ]
  },
  {
    label: 'Fazit / Schluss',
    color: 'amber',
    phrases: [
      { title: 'Einleitung Fazit', text: 'Zusammenfassend lässt sich festhalten, dass ...' },
      { title: 'Ergebnisse', text: 'Die vorliegende Arbeit hat gezeigt, dass ...' },
      { title: 'Fragestellung beantworten', text: 'Die eingangs gestellte Frage, ob ..., lässt sich dahingehend beantworten, dass ...' },
      { title: 'Reflexion', text: 'Einschränkend ist anzumerken, dass die Ergebnisse dieser Arbeit ...' },
      { title: 'Ausblick', text: 'Für zukünftige Forschung wäre es interessant zu untersuchen, ob ...' },
      { title: 'Abschluss', text: 'Abschließend ist festzuhalten, dass ... Weiterer Forschungsbedarf besteht insbesondere hinsichtlich ...' },
    ]
  },
  {
    label: 'Formales',
    color: 'slate',
    phrases: [
      { title: 'Begriff definieren', text: 'Im Rahmen dieser Arbeit wird [Begriff] als ... verstanden.' },
      { title: 'Hinweis', text: 'Es sei angemerkt, dass ...' },
      { title: 'Sprache', text: 'Aus Gründen der Lesbarkeit wird in dieser Arbeit das generische Maskulinum / die gendergerechte Sprache verwendet.' },
      { title: 'Quellenhinweis', text: 'Sofern nicht anders angegeben, stammen alle Übersetzungen von der Verfasserin / dem Verfasser.' },
    ]
  },
];

const COLOR_MAP: Record<string, string> = {
  indigo: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300',
  violet: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300',
  blue:   'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  emerald:'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
  amber:  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  rose:   'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
  slate:  'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
};

const BADGE_MAP: Record<string, string> = {
  indigo: 'bg-indigo-600',
  violet: 'bg-violet-600',
  blue:   'bg-blue-600',
  emerald:'bg-emerald-600',
  amber:  'bg-amber-500',
  rose:   'bg-rose-600',
  slate:  'bg-slate-500',
};

const PARAPHRASE_EXAMPLES = [
  {
    label: 'Psychologie',
    original: '„Kognitive Dissonanz entsteht, wenn eine Person zwei widersprüchliche Überzeugungen gleichzeitig hält." (Festinger, 1957, S. 3)',
    wrong: 'Kognitive Dissonanz tritt auf, wenn jemand zwei gegensätzliche Überzeugungen gleichzeitig besitzt. (Festinger, 1957, S. 3)',
    wrongReason: 'Nur einzelne Wörter durch Synonyme ersetzt — Satzstruktur und Aussage sind identisch. Das zählt als Plagiat.',
    right: 'Festinger (1957) zufolge entsteht innerer Konflikt genau dort, wo sich zwei Überzeugungen einer Person gegenseitig ausschließen (S. 3).',
    rightReason: 'Eigene Satzstruktur, anderer Blickwinkel (Konflikt statt Dissonanz), Autor narrativ eingebaut.',
  },
  {
    label: 'Soziologie',
    original: '„Die Globalisierung hat wirtschaftliche Ungleichheiten zwischen Ländern verstärkt." (Autor, 2020, S. 45)',
    wrong: 'Durch die Globalisierung haben sich wirtschaftliche Ungleichheiten zwischen verschiedenen Ländern vergrößert. (Autor, 2020, S. 45)',
    wrongReason: 'Ein Wort ergänzt, ein Synonym eingesetzt — kaum verändert. Bleibt ein verschleiertes Direktzitat.',
    right: 'Im Zuge der weltweiten Vernetzung haben sich Wohlstandsgefälle zwischen Staaten weiter zugespitzt (vgl. Autor, 2020, S. 45).',
    rightReason: 'Andere Metapher (Wohlstandsgefälle), vollständiger Satzumbau, Quellenangabe mit „vgl." für indirektes Zitat.',
  },
  {
    label: 'Allgemein',
    original: '„Aktives Lernen führt zu besserem Behalten als passives Zuhören." (Autor, 2019, S. 12)',
    wrong: 'Aktives Lernen führt zu einem besseren Behalten des Stoffs als passives Zuhören. (Autor, 2019, S. 12)',
    wrongReason: 'Nur ein Artikel hinzugefügt. Das ist keine Paraphrase — das ist ein Plagiat mit minimalster Änderung.',
    right: 'Wie Autor (2019) zeigt, verfestigt sich Wissen nachhaltiger, wenn Lernende sich aktiv mit dem Stoff auseinandersetzen, anstatt ihn bloß zu rezipieren (S. 12).',
    rightReason: 'Vollständig umgebaut, eigene Satzstruktur, Quelle narrativ eingebunden, Synonym-Kette (verfestigt sich / rezipieren).',
  },
];

const CHECKLIST_GROUPS = [
  {
    title: 'Inhalt & Argumentation',
    icon: '📝',
    items: [
      { id: 'c1',  text: 'Forschungsfrage ist klar formuliert und wird im Fazit explizit beantwortet' },
      { id: 'c2',  text: 'Alle Kapitel tragen zur Fragestellung bei (roter Faden erkennbar)' },
      { id: 'c3',  text: 'Keine neuen Argumente oder Quellen im Fazit' },
      { id: 'c4',  text: 'Eigene Einschätzungen sind klar von Quellenaussagen getrennt' },
      { id: 'c5',  text: 'Abgrenzung benannt: was wird NICHT behandelt und warum?' },
    ],
  },
  {
    title: 'Zitierung & Quellen',
    icon: '📚',
    items: [
      { id: 'c6',  text: 'Alle Direktzitate haben Anführungszeichen + Quelle + Seitenzahl' },
      { id: 'c7',  text: 'Alle indirekten Zitate haben einen Kurzbeleg (vgl. Autor, Jahr)' },
      { id: 'c8',  text: 'Jede im Text zitierte Quelle steht im Literaturverzeichnis — und umgekehrt' },
      { id: 'c9',  text: 'Zitierstil ist durchgehend einheitlich — nur ein Stil in der gesamten Arbeit' },
      { id: 'c10', text: 'Internetquellen haben ein „Zuletzt abgerufen am ..."-Datum' },
    ],
  },
  {
    title: 'Formatierung',
    icon: '⚙️',
    items: [
      { id: 'c11', text: 'Schriftart und -größe einheitlich (Times New Roman 12pt oder Arial 11pt)' },
      { id: 'c12', text: 'Zeilenabstand 1,5-fach im Fließtext (Fußnoten: einfacher Abstand)' },
      { id: 'c13', text: 'Seitenränder: Links 3 cm, Rechts 2,5 cm, Oben/Unten je 2,5 cm' },
      { id: 'c14', text: 'Seitenzahlen ab der Einleitung vorhanden (nicht auf Titelblatt)' },
      { id: 'c15', text: 'Blocksatz mit automatischer Silbentrennung aktiviert' },
    ],
  },
  {
    title: 'Struktur & Vollständigkeit',
    icon: '📋',
    items: [
      { id: 'c16', text: 'Inhaltsverzeichnis stimmt mit Kapitelüberschriften und Seitenzahlen überein' },
      { id: 'c17', text: 'Titelblatt vollständig: Name, Matrikelnummer, Dozent, Abgabedatum, Studiengang' },
      { id: 'c18', text: 'Literaturverzeichnis alphabetisch nach Nachname des Erstautors sortiert' },
      { id: 'c19', text: 'Seitenanzahl entspricht den Vorgaben (±10 % ist üblicherweise toleriert)' },
    ],
  },
  {
    title: 'Letzte Kontrolle vor Abgabe',
    icon: '✅',
    items: [
      { id: 'c20', text: 'Rechtschreib- und Grammatikprüfung durchgeführt' },
      { id: 'c21', text: 'Datei korrekt benannt (z.B. Nachname_Hausarbeit_Semester.docx)' },
      { id: 'c22', text: 'Plagiatsprüfung durchgeführt (falls Hochschule ein Tool anbietet)' },
      { id: 'c23', text: 'An die richtige Adresse abgegeben / ins richtige Portal hochgeladen' },
    ],
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export const TermPaperSystem: React.FC<TermPaperSystemProps> = ({
  availableDocuments, initialSources = [], getDocumentSource,
}) => {
  const [tab, setTab]                         = useState<Tab>('guide');
  // Outline
  const [topic, setTopic]                     = useState('');
  const [focus, setFocus]                     = useState('');
  const [pageCount, setPageCount]             = useState(10);
  const [selectedDocIds, setSelectedDocIds]   = useState<string[]>([]);
  const [framework, setFramework]             = useState<PaperFramework | null>(null);
  const [isGenerating, setIsGenerating]       = useState(false);
  // Phrases
  const [activePhraseTab, setActivePhraseTab] = useState(0);
  // Citations
  const [sources, setSources]                 = useState<AcademicSource[]>([]);
  const [citationStyle, setCitationStyle]     = useState<CitationStyle>('APA');
  const [citations, setCitations]             = useState<Record<string, MultiStyleCitation>>({});
  const [manualAuthor, setManualAuthor]       = useState('');
  const [manualTitle, setManualTitle]         = useState('');
  const [manualYear, setManualYear]           = useState('');
  const [manualJournal, setManualJournal]     = useState('');
  const [manualUrl, setManualUrl]             = useState('');
  const [isAdding, setIsAdding]               = useState(false);
  // Magic
  const [magicInput, setMagicInput]           = useState('');
  const [magicResult, setMagicResult]         = useState<MultiStyleCitation | null>(null);
  const [isMagicLoading, setIsMagicLoading]   = useState(false);
  // Checklist
  const [checked, setChecked]                 = useState<Set<string>>(new Set());
  const toggleCheck = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const totalItems = CHECKLIST_GROUPS.reduce((s, g) => s + g.items.length, 0);

  useEffect(() => {
    if (!initialSources.length) return;
    const timestamp = Date.now();
    const existing = new Set(sources.map(p => p.url));
    const newOnes: AcademicSource[] = initialSources
      .filter(s => !existing.has(s.url))
      .map((s, i) => ({ ...s, id: `init-${i}-${timestamp}`, type: 'article' as const }));
    if (!newOnes.length) return;
    setSources(prev => [...prev, ...newOnes]);
    newOnes.forEach(src => {
      formatCitationFull(src)
        .then(full => setCitations(c => ({ ...c, [src.id]: full })))
        .catch(() => {});
    });
  }, [initialSources]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Outline generation ──────────────────────────────────────────────────
  const handleGenerateOutline = async () => {
    if (!topic.trim()) { toast.error('Thema angeben!'); return; }
    setIsGenerating(true);
    try {
      const docs = availableDocuments.filter(d => selectedDocIds.includes(d.id));
      const genSources: GenerationSource[] = [];
      for (const doc of docs) {
        try {
          genSources.push(getDocumentSource(doc));
        } catch {
          toast.error(`"${documentDisplayName(doc)}" konnte nicht geladen werden — wird übersprungen.`);
        }
      }
      const fw = await generatePaperFramework(topic, focus, pageCount, genSources);
      setFramework(fw);
      setTab('outline');
    } catch (e: any) {
      toast.error(e?.message?.includes('LIMIT_REACHED')
        ? 'Tageslimit erreicht. Bitte morgen erneut versuchen.'
        : 'Gliederung konnte nicht generiert werden. Versuche es erneut.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Citation helpers ─────────────────────────────────────────────────────
  const handleAddSource = async () => {
    if (!manualTitle || !manualAuthor) { toast.error('Autor und Titel sind Pflicht!'); return; }
    setIsAdding(true);
    const src: AcademicSource = {
      id: `manual-${Date.now()}`,
      authors: manualAuthor, title: manualTitle,
      year: manualYear || new Date().getFullYear().toString(),
      journal: manualJournal, url: manualUrl,
      type: 'article', snippet: '', apaCitation: ''
    };
    try {
      const full = await formatCitationFull(src);
      setSources(prev => [src, ...prev]);
      setCitations(prev => ({ ...prev, [src.id]: full }));
      setManualAuthor(''); setManualTitle(''); setManualYear(''); setManualJournal(''); setManualUrl('');
      toast.success('Quelle hinzugefügt');
    } catch { toast.error('Zitier-Fehler.'); }
    finally { setIsAdding(false); }
  };

  const handleMagicFormat = async () => {
    if (!magicInput.trim()) return;
    setIsMagicLoading(true);
    try { setMagicResult(await magicFormatCitation(magicInput)); }
    catch { toast.error('Fehler beim KI-Zitieren.'); }
    finally { setIsMagicLoading(false); }
  };

  const downloadBibliography = () => {
    const text = buildBibliography();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Literaturverzeichnis_${citationStyle}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildBibliography = () => {
    return sources.map(s => {
      const c = citations[s.id];
      if (!c) return s.apaCitation || `${s.authors} (${s.year}). ${s.title}.`;
      switch (citationStyle) {
        case 'APA':     return c.apa?.entry || '';
        case 'MLA':     return c.mla?.entry || '';
        case 'Harvard': return c.harvard?.entry || '';
        case 'Chicago': return c.chicago?.bibliography || '';
        default:        return c.apa?.entry || '';
      }
    }).join('\n\n');
  };

  const outlineAsText = () => {
    if (!framework) return '';
    let out = `Thema: ${topic}\n\nForschungsfrage: ${framework.fragestellung}\n\nThese: ${framework.thesis}\n\nGliederung:\n\n`;
    framework.outline.forEach(s => {
      out += `${s.number}. ${s.title} (ca. ${s.wordCount} Wörter)\n`;
      s.subsections?.forEach(sub => { out += `   ${sub.number} ${sub.title}\n`; });
    });
    return out;
  };

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string }[] = [
    { id: 'guide',      label: 'Leitfaden' },
    { id: 'outline',    label: 'Gliederung' },
    { id: 'phrases',    label: 'Formulierungen' },
    { id: 'paraphrase', label: 'Paraphrasieren' },
    { id: 'citations',  label: 'Zitierung' },
    { id: 'magic',      label: 'KI-Zitierer' },
    { id: 'checklist',  label: 'Checkliste' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2 px-4">
        <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">
          Hausarbeit <span className="text-indigo-600">Assistent</span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          Struktur · Formulierungen · Zitierung · Leitfaden
        </p>
      </div>

      {/* Tab bar — sticky so it stays accessible on mobile when scrolled */}
      <div className="flex justify-center px-4 sticky top-14 md:top-0 z-20 py-2 bg-white/90 dark:bg-slate-900/95 backdrop-blur-xl">
        <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-[24px] flex flex-wrap justify-center gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${tab === t.id ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-md' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
              {t.label}
              {t.id === 'citations' && sources.length > 0 && (
                <span className={`w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center shrink-0 ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-white'}`}>
                  {sources.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4">

        {/* ── LEITFADEN ── */}
        {tab === 'guide' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center font-medium">
              Was muss in jede Sektion? Welche Formatierung? Alles auf einen Blick.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {GUIDE_SECTIONS.map((sec, i) => (
                <div key={i} className={`p-6 rounded-[28px] border ${COLOR_MAP[sec.color]}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-9 h-9 ${BADGE_MAP[sec.color]} text-white rounded-[14px] flex items-center justify-center text-lg`}>
                      {sec.icon}
                    </div>
                    <h3 className="font-black text-sm">{sec.title}</h3>
                  </div>
                  <ul className="space-y-2">
                    {sec.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs font-medium opacity-90">
                        <span className="mt-0.5 shrink-0 opacity-50">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── GLIEDERUNG ── */}
        {tab === 'outline' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Input form */}
            <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-6 sm:p-8 space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">KI-Gliederung generieren</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
                    placeholder="Thema der Hausarbeit..."
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white font-bold transition-colors"
                  />
                </div>
                <div className="sm:col-span-2">
                  <textarea value={focus} onChange={e => setFocus(e.target.value)}
                    placeholder="Forschungsfrage / Fokus (optional — KI schlägt eine vor)"
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white resize-none h-24 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-2">Seitenumfang</label>
                  <div className="flex gap-2 flex-wrap">
                    {[5, 10, 15, 20, 25].map(n => (
                      <button key={n} onClick={() => setPageCount(n)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${pageCount === n ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-indigo-50'}`}
                      >
                        {n} S.
                      </button>
                    ))}
                  </div>
                </div>
                {availableDocuments.length > 0 && (
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-2">Dokumente als Basis</label>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {availableDocuments.map(doc => (
                        <div key={doc.id} onClick={() => setSelectedDocIds(prev => prev.includes(doc.id) ? prev.filter(i => i !== doc.id) : [...prev, doc.id])}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all text-sm font-medium ${selectedDocIds.includes(doc.id) ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300' : 'border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400'}`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 text-[9px] ${selectedDocIds.includes(doc.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                            {selectedDocIds.includes(doc.id) && '✓'}
                          </div>
                          <span className="truncate">{documentDisplayName(doc)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {selectedDocIds.length > 0 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 text-center">
                  {selectedDocIds.length} {selectedDocIds.length === 1 ? 'Dokument' : 'Dokumente'} als Basis ausgewählt
                </p>
              )}
              <button onClick={handleGenerateOutline} disabled={isGenerating || !topic.trim()}
                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl text-[11px] uppercase tracking-[0.3em] shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {isGenerating ? 'KI arbeitet...' : 'Gliederung + Fragestellung generieren'}
              </button>
            </div>

            {/* Generated framework */}
            {framework && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Fragestellung + These */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-[24px] border border-indigo-200 dark:border-indigo-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[8px] font-black uppercase tracking-widest text-indigo-500">Vorgeschlagene Forschungsfrage</p>
                      <CopyButton text={framework.fragestellung} />
                    </div>
                    <p className="text-sm font-bold text-indigo-900 dark:text-indigo-100 leading-relaxed italic">
                      „{framework.fragestellung}"
                    </p>
                  </div>
                  <div className="p-6 bg-violet-50 dark:bg-violet-900/20 rounded-[24px] border border-violet-200 dark:border-violet-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[8px] font-black uppercase tracking-widest text-violet-500">Vorläufige These</p>
                      <CopyButton text={framework.thesis} />
                    </div>
                    <p className="text-sm font-medium text-violet-900 dark:text-violet-100 leading-relaxed">
                      {framework.thesis}
                    </p>
                  </div>
                </div>

                {/* Outline */}
                <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-black text-slate-900 dark:text-white">Gliederung</h3>
                    <CopyButton text={outlineAsText()} label="Alles kopieren" />
                  </div>
                  <div className="divide-y divide-slate-50 dark:divide-slate-800">
                    {framework.outline.map((section, i) => (
                      <div key={i} className="p-6">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black text-sm shrink-0">
                            {section.number}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <h4 className="font-black text-slate-900 dark:text-white">{section.title}</h4>
                              {section.wordCount && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg shrink-0">
                                  ca. {section.wordCount} Wörter
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{section.description}</p>
                            {section.keyPoints && section.keyPoints.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {section.keyPoints.map((pt, j) => (
                                  <span key={j} className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-full">
                                    {pt}
                                  </span>
                                ))}
                              </div>
                            )}
                            {section.subsections && section.subsections.length > 0 && (
                              <div className="mt-4 space-y-2 pl-4 border-l-2 border-slate-100 dark:border-slate-800">
                                {section.subsections.map((sub, j) => (
                                  <div key={j} className="flex items-start gap-3">
                                    <span className="text-[10px] font-black text-slate-400 shrink-0 mt-0.5">{sub.number}</span>
                                    <div>
                                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{sub.title}</p>
                                      {sub.description && <p className="text-xs text-slate-400 mt-0.5">{sub.description}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FORMULIERUNGEN ── */}
        {tab === 'phrases' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center font-medium">
              Akademische Formulierungen für Deutsche Hausarbeiten — einfach kopieren.
            </p>
            {/* Category tabs */}
            <div className="flex flex-wrap gap-2 justify-center">
              {PHRASE_CATEGORIES.map((cat, i) => (
                <button key={i} onClick={() => setActivePhraseTab(i)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activePhraseTab === i ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-indigo-50 dark:hover:bg-slate-700'}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            {/* Phrases grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PHRASE_CATEGORIES[activePhraseTab].phrases.map((phrase, i) => (
                <div key={i} className={`p-5 rounded-[24px] border ${COLOR_MAP[PHRASE_CATEGORIES[activePhraseTab].color]} space-y-2`}>
                  <div className="flex items-center justify-between">
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60">{phrase.title}</p>
                    <CopyButton text={phrase.text} />
                  </div>
                  <p className="text-sm font-medium leading-relaxed italic">{phrase.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ZITIERUNG ── */}
        {tab === 'citations' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Style picker */}
            <div className="flex gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl w-fit">
              {(['APA', 'MLA', 'Harvard', 'Chicago'] as CitationStyle[]).map(s => (
                <button key={s} onClick={() => setCitationStyle(s)}
                  className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${citationStyle === s ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-md' : 'text-slate-400'}`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Add source form */}
            <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-6 space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Quelle hinzufügen</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { val: manualAuthor, set: setManualAuthor, ph: 'Autor(en) — z.B. Müller, A. & Schmidt, B.' },
                  { val: manualTitle,  set: setManualTitle,  ph: 'Titel der Quelle *' },
                  { val: manualYear,   set: setManualYear,   ph: 'Erscheinungsjahr' },
                  { val: manualJournal,set: setManualJournal,ph: 'Journal / Verlag / Herausgeber' },
                ].map(({ val, set, ph }, i) => (
                  <input key={i} type="text" value={val} onChange={e => set(e.target.value)} placeholder={ph}
                    className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white transition-colors"
                  />
                ))}
                <input type="text" value={manualUrl} onChange={e => setManualUrl(e.target.value)}
                  placeholder="URL / DOI (optional)"
                  className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white sm:col-span-2 transition-colors"
                />
              </div>
              <button onClick={handleAddSource} disabled={isAdding || !manualTitle || !manualAuthor}
                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl text-[11px] uppercase tracking-widest hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {isAdding ? 'KI formatiert alle 4 Stile...' : `In allen Stilen zitieren`}
              </button>
            </div>

            {/* Source list */}
            {sources.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">Noch keine Quellen hinzugefügt.</p>
            ) : (
              <div className="space-y-4">
                {/* Export section */}
                <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 rounded-[28px] border-2 border-indigo-100 dark:border-indigo-800 p-6 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Literaturverzeichnis exportieren</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {sources.length} {sources.length === 1 ? 'Quelle' : 'Quellen'} · Stil: <span className="font-bold text-indigo-600">{citationStyle}</span>
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <CopyButton text={buildBibliography()} label="Kopieren" />
                      <button onClick={downloadBibliography}
                        className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
                      >
                        .txt herunterladen
                      </button>
                    </div>
                  </div>
                  {/* Preview */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-indigo-900 p-4 max-h-48 overflow-y-auto">
                    {sources.map((s, i) => {
                      const c = citations[s.id];
                      const entry = !c ? `${s.authors} (${s.year}). ${s.title}.`
                        : citationStyle === 'APA' ? c.apa?.entry
                        : citationStyle === 'MLA' ? c.mla?.entry
                        : citationStyle === 'Harvard' ? c.harvard?.entry
                        : c.chicago?.bibliography;
                      return (
                        <p key={s.id} className={`text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic ${i > 0 ? 'mt-3' : ''}`}>
                          {entry || '–'}
                        </p>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-slate-400 text-center">
                    Kopieren → in Word einfügen → fertig. Seitenzahlen bei Direktzitaten manuell ergänzen.
                  </p>
                </div>

                {sources.map(s => {
                  const c = citations[s.id];
                  return (
                    <div key={s.id} className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-black text-slate-900 dark:text-white text-sm">{s.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{s.authors} · {s.year}</p>
                        </div>
                        <button onClick={() => setSources(prev => prev.filter(x => x.id !== s.id))}
                          className="text-slate-300 hover:text-rose-500 transition-colors text-lg shrink-0">×</button>
                      </div>
                      {c ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(['APA', 'MLA', 'Harvard', 'Chicago'] as CitationStyle[]).map(style => {
                            const isActive = style === citationStyle;
                            const entry = style === 'APA' ? c.apa?.entry
                              : style === 'MLA' ? c.mla?.entry
                              : style === 'Harvard' ? c.harvard?.entry
                              : c.chicago?.bibliography;
                            return (
                              <div key={style} className={`p-4 rounded-2xl space-y-2 ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700'}`}>
                                <div className="flex items-center justify-between">
                                  <span className={`text-[8px] font-black uppercase tracking-widest ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>{style}</span>
                                  <CopyButton text={entry || ''} label="Eintrag" />
                                </div>
                                {/* Bibliography / Works Cited entry */}
                                <p className="text-xs italic text-slate-600 dark:text-slate-400 leading-relaxed">{entry || '–'}</p>
                                {/* In-text citations */}
                                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                                  {style === 'APA' && c.apa && (<>
                                    <InTextRow label="Klammer" value={c.apa.inTextKlammer} />
                                    <InTextRow label="Narrativ" value={c.apa.inTextNarrativ} />
                                  </>)}
                                  {style === 'MLA' && c.mla && (
                                    <InTextRow label="Kurzbeleg" value={c.mla.inText} />
                                  )}
                                  {style === 'Harvard' && c.harvard && (<>
                                    <InTextRow label="Kurzbeleg" value={c.harvard.inText} />
                                    <InTextRow label="Direktzitat" value={c.harvard.direct} />
                                  </>)}
                                  {style === 'Chicago' && c.chicago && (<>
                                    <InTextRow label="Fußnote" value={c.chicago.fullNote} />
                                    <InTextRow label="Kurznote" value={c.chicago.shortNote} />
                                  </>)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">Formatierung ausstehend...</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PARAPHRASIEREN ── */}
        {tab === 'paraphrase' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium max-w-xl mx-auto">
                Paraphrasieren heißt: fremde Ideen in eigenen Worten wiedergeben — mit Quellenangabe. Nicht nur Synonyme tauschen.
              </p>
            </div>

            {/* Rules */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: '🔄', rule: 'Satzstruktur komplett umbauen', detail: 'Aktiv ↔ Passiv, Haupt- zu Nebensatz' },
                { icon: '💬', rule: 'Eigenen Wortschatz nutzen', detail: 'Nicht nur Synonyme — echte Umformulierung' },
                { icon: '📌', rule: 'Quelle immer angeben', detail: 'Auch bei indirekten Zitaten: (vgl. Autor, Jahr, S. X)' },
                { icon: '🎯', rule: 'Aussage erhalten', detail: 'Inhalt darf sich nicht verändern — nur die Form' },
              ].map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <span className="text-xl shrink-0">{r.icon}</span>
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">{r.rule}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Examples */}
            <div className="space-y-6">
              {PARAPHRASE_EXAMPLES.map((ex, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{ex.label}</span>
                  </div>
                  <div className="p-6 space-y-4">
                    {/* Original */}
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Original (Direktzitat)</p>
                      <p className="text-sm italic text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl leading-relaxed">{ex.original}</p>
                    </div>
                    {/* Wrong */}
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-rose-500 mb-1.5">❌ Falsch — Plagiat</p>
                      <p className="text-sm italic text-slate-700 dark:text-slate-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 p-3 rounded-xl leading-relaxed">{ex.wrong}</p>
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1.5 font-medium">{ex.wrongReason}</p>
                    </div>
                    {/* Right */}
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-emerald-600 mb-1.5">✓ Richtig — korrekte Paraphrase</p>
                      <p className="text-sm italic text-slate-700 dark:text-slate-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl leading-relaxed">{ex.right}</p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium">{ex.rightReason}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CHECKLISTE ── */}
        {tab === 'checklist' && (
          <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
            {/* Progress */}
            <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-slate-900 dark:text-white">
                    {checked.size} / {totalItems} erledigt
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {checked.size === totalItems ? '🎉 Alles gecheckt — du kannst abgeben!' : 'Hake ab was du geprüft hast'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${(checked.size / totalItems) * 100}%` }}
                    />
                  </div>
                  {checked.size > 0 && (
                    <button onClick={() => setChecked(new Set())}
                      className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 transition-colors">
                      Zurücksetzen
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Groups */}
            {CHECKLIST_GROUPS.map((group, gi) => (
              <div key={gi} className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 overflow-hidden">
                <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-50 dark:border-slate-800">
                  <span>{group.icon}</span>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">{group.title}</h3>
                  <span className="ml-auto text-[9px] font-black text-slate-400">
                    {group.items.filter(it => checked.has(it.id)).length}/{group.items.length}
                  </span>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-slate-800">
                  {group.items.map(item => (
                    <button key={item.id} onClick={() => toggleCheck(item.id)}
                      className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${checked.has(item.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600'}`}>
                        {checked.has(item.id) && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm leading-relaxed transition-colors ${checked.has(item.id) ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-300'}`}>
                        {item.text}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── KI-ZITIERER ── */}
        {tab === 'magic' && (
          <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl mx-auto">
            <div className="text-center space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Rohen Text, Website-Inhalt oder Quellfragment einfügen — KI formatiert in alle 4 Stile.
              </p>
            </div>
            <textarea value={magicInput} onChange={e => setMagicInput(e.target.value)}
              placeholder="Beispiel: Müller, Hans (2021): Kognitive Psychologie. Hogrefe. S. 42–44. https://..."
              className="w-full h-36 p-6 bg-white dark:bg-slate-900 rounded-[28px] border-2 border-slate-100 dark:border-slate-800 focus:border-indigo-500 outline-none transition-all dark:text-white font-medium resize-none"
            />
            <button onClick={handleMagicFormat} disabled={isMagicLoading || !magicInput.trim()}
              className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl text-[11px] uppercase tracking-widest hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isMagicLoading ? 'KI formatiert...' : 'In allen Stilen zitieren'}
            </button>

            {magicResult && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {([
                  { key: 'apa',     label: 'APA 7th',    color: 'indigo', content: magicResult.apa.entry,          sub: [`Klammer: ${magicResult.apa.inTextKlammer}`, `Narrativ: ${magicResult.apa.inTextNarrativ}`] },
                  { key: 'mla',     label: 'MLA 9th',    color: 'violet', content: magicResult.mla.entry,          sub: [`In-Text: ${magicResult.mla.inText}`] },
                  { key: 'harvard', label: 'Harvard',    color: 'blue',   content: magicResult.harvard.entry,      sub: [`In-Text: ${magicResult.harvard.inText}`, `Direkt: ${magicResult.harvard.direct}`] },
                  { key: 'chicago', label: 'Chicago',    color: 'amber',  content: magicResult.chicago.bibliography, sub: [`Note: ${magicResult.chicago.fullNote}`, `Kurznote: ${magicResult.chicago.shortNote}`] },
                ] as const).map(({ key, label, color, content, sub }) => (
                  <div key={key} className={`p-6 rounded-[24px] border ${COLOR_MAP[color]} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-60">{label}</span>
                      <CopyButton text={content} />
                    </div>
                    <p className="text-sm italic leading-relaxed font-medium">{content}</p>
                    <div className="space-y-1 pt-2 border-t border-current border-opacity-10">
                      {sub.map((s, i) => <p key={i} className="text-[10px] font-bold opacity-60">{s}</p>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
