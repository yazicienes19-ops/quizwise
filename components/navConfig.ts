/**
 * navConfig.ts — Neue gruppierte Navigation mit selbsterklärenden Labels.
 *
 * Verwendung: In Layout.tsx die bisherige flache Nav-Liste durch diese
 * Gruppen-Struktur ersetzen. Rendering-Beispiel unten in der Datei.
 *
 * Wichtig: ActiveTab-Enum bleibt unverändert — nur Labels + Struktur ändern
 * sich. Kein Breaking Change in App.tsx nötig.
 */
import { ActiveTab } from '../types';

export interface NavItem {
  tab: ActiveTab;
  label: string;
  /** Kurzer Untertitel der erklärt was hier passiert — max 4 Wörter */
  hint?: string;
}

export interface NavGroup {
  /** null = kein Gruppen-Header (für Start) */
  title: string | null;
  items: NavItem[];
}

/** Labor-Gruppe: nur für Admins (isAdmin(userId) === true) */
export const LABOR_GROUP: NavGroup = {
  title: 'Labor',
  items: [
    { tab: ActiveTab.EXPLAINER, label: 'KI-Erklärer', hint: 'Konzepte verstehen' },
    { tab: ActiveTab.PAPER, label: 'Hausarbeit', hint: 'Mit Quellen schreiben' },
    { tab: ActiveTab.SEARCH, label: 'Recherche', hint: 'Paper & Web suchen' },
  ],
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { tab: ActiveTab.DASHBOARD, label: 'Start' },
    ],
  },
  {
    title: 'Lernen',
    items: [
      { tab: ActiveTab.QUIZ, label: 'Quiz', hint: 'Fragen aus deinen Unterlagen' },
      { tab: ActiveTab.CARDS, label: 'Karteikarten', hint: 'Täglich wiederholen' },
      { tab: ActiveTab.RECALL, label: 'Erklären üben', hint: 'Feynman-Methode' },
      { tab: ActiveTab.EXAM, label: 'Klausur üben', hint: 'Prüfung simulieren' },
    ],
  },
  {
    title: 'Material',
    items: [
      { tab: ActiveTab.LIBRARY, label: 'Bibliothek', hint: 'PDFs & Notizen' },
      // KI-Erklärer + Hausarbeit + Recherche sind Aktionen auf Dokumenten →
      // erreichbar über die Bibliothek (Dokument anklicken → Aktion wählen).
      // Falls eigene Nav-Punkte gewünscht, hier wieder einkommentieren:
      // { tab: ActiveTab.EXPLAINER, label: 'Erklär mir das', hint: 'KI erklärt Konzepte' },
      // { tab: ActiveTab.PAPER, label: 'Hausarbeit', hint: 'Mit Quellen schreiben' },
      // { tab: ActiveTab.SEARCH, label: 'Recherche', hint: 'Paper & Web suchen' },
    ],
  },
  {
    title: 'Fortschritt',
    items: [
      { tab: ActiveTab.RADAR, label: 'Lern-Coach', hint: 'Was du üben solltest' },
      { tab: ActiveTab.PLANNER, label: 'Lernplan' },
    ],
  },
];

/*
 * Rendering-Beispiel für Layout.tsx (Stil passend zum bestehenden Design):
 *
 * {NAV_GROUPS.map((group, gi) => (
 *   <div key={gi} className="space-y-1">
 *     {group.title && (
 *       <p className="px-4 pt-4 pb-1 text-[8px] font-black uppercase tracking-[0.3em] text-slate-400">
 *         {group.title}
 *       </p>
 *     )}
 *     {group.items.map(item => (
 *       <button
 *         key={item.tab}
 *         onClick={() => onTabChange(item.tab)}
 *         className={`w-full text-left px-4 py-2.5 rounded-[14px] transition-all ${
 *           activeTab === item.tab
 *             ? 'font-black'
 *             : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
 *         }`}
 *         style={activeTab === item.tab
 *           ? { background: 'var(--primary-soft)', color: 'var(--primary-soft-text)' }
 *           : undefined}
 *       >
 *         <span className="text-[11px] font-black uppercase tracking-widest">{item.label}</span>
 *         {item.hint && activeTab !== item.tab && (
 *           <span className="block text-[9px] font-medium text-slate-400 normal-case tracking-normal mt-0.5">
 *             {item.hint}
 *           </span>
 *         )}
 *       </button>
 *     ))}
 *   </div>
 * ))}
 */
