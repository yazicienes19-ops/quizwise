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
import type { TKey } from '../i18n';

export interface NavItem {
  tab: ActiveTab;
  labelKey: TKey;
  /** Kurzer Untertitel-Schlüssel der erklärt was hier passiert */
  hintKey?: TKey;
}

export interface NavGroup {
  /** null = kein Gruppen-Header (für Start) */
  titleKey: TKey | null;
  items: NavItem[];
}

/** Labor-Gruppe: nur für Admins (isAdmin(userId) === true) */
export const LABOR_GROUP: NavGroup = {
  titleKey: 'nav.group.lab',
  items: [
    { tab: ActiveTab.PAPER, labelKey: 'nav.paper', hintKey: 'nav.paper.hint' },
    { tab: ActiveTab.SEARCH, labelKey: 'nav.search', hintKey: 'nav.search.hint' },
  ],
};

export const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: null,
    items: [
      { tab: ActiveTab.DASHBOARD, labelKey: 'nav.start' },
    ],
  },
  {
    titleKey: 'nav.group.learn',
    items: [
      { tab: ActiveTab.QUIZ, labelKey: 'nav.quiz', hintKey: 'nav.quiz.hint' },
      { tab: ActiveTab.CARDS, labelKey: 'nav.cards', hintKey: 'nav.cards.hint' },
      { tab: ActiveTab.RECALL, labelKey: 'nav.recall', hintKey: 'nav.recall.hint' },
      { tab: ActiveTab.EXAM, labelKey: 'nav.exam', hintKey: 'nav.exam.hint' },
      { tab: ActiveTab.EXPLAINER, labelKey: 'nav.explainer', hintKey: 'nav.explainer.hint' },
    ],
  },
  {
    titleKey: 'nav.group.material',
    items: [
      { tab: ActiveTab.LIBRARY, labelKey: 'nav.library', hintKey: 'nav.library.hint' },
      // Hausarbeit + Recherche sind Aktionen auf Dokumenten → erreichbar über
      // die Bibliothek (Dokument anklicken → Aktion wählen). Der Split-Screen-
      // Reader ist ebenfalls dokument-gebunden und braucht deshalb keinen
      // eigenen Nav-Punkt (immer über Bibliothek → Quelle → Aktionskarte).
    ],
  },
  {
    titleKey: 'nav.group.progress',
    items: [
      { tab: ActiveTab.RADAR, labelKey: 'nav.radar', hintKey: 'nav.radar.hint' },
      { tab: ActiveTab.PLANNER, labelKey: 'nav.planner' },
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
