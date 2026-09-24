
import React, { useState, useEffect, useMemo } from 'react';
import { ActiveTab, FlashcardDeck, Collection } from '../types';
import { countDueCards, migrateLegacyCard } from '../services/spacedRepetition';
import { countDueMistakes, MISTAKES_UPDATED_EVENT } from '../services/mistakeReviewService';
import { getStreak, STREAK_UPDATED_EVENT } from '../services/streakService';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  Home, BookOpen, HelpCircle, Calendar, Brain, GraduationCap,
  Layers, Lightbulb, BarChart2, Search, FileText, Moon, Sun,
  X, Menu, KeyRound, LogIn, LogOut, Zap, Settings, Star, Users,
  PanelLeftClose, PanelLeftOpen, Network, type LucideIcon
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { ColorPicker } from './ColorPicker';
import { ApiKeySettings } from './ApiKeySettings';
import { LegalModal } from './LegalModal';
import { CookieSettingsModal } from './CookieSettingsModal';
import { NAV_GROUPS, LABOR_GROUP } from './navConfig';
import { BrandMark } from './BrandMark';
import { isAdmin } from '../config/admin';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';
import { openGlobalSearch, SEARCH_SHORTCUT } from './GlobalSearch';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  /** Fach-Kontext (Variante C): Ordner als app-weite Vorauswahl */
  collections?: Collection[];
  /** App-weiter Deck-Zustand — Basis für das fällig-Karten-Badge, damit es
   *  nach einer Lern-Session sofort mitrechnet statt bis zum Reload stale zu sein. */
  decks?: FlashcardDeck[];
  activeModuleId?: string | null;
  onModuleChange?: (id: string | null) => void;
  user?: User | null;
  userPlan?: 'free' | 'pro';
  onLoginClick?: () => void;
  onLogout?: () => void;
  onUpgradeClick?: () => void;
  onSettingsClick?: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

const ICONS: Partial<Record<ActiveTab, LucideIcon>> = {
  [ActiveTab.DASHBOARD]: Home,
  [ActiveTab.LIBRARY]:   BookOpen,
  [ActiveTab.QUIZ]:      HelpCircle,
  [ActiveTab.PLANNER]:   Calendar,
  [ActiveTab.RECALL]:    Brain,
  [ActiveTab.EXAM]:      GraduationCap,
  [ActiveTab.CARDS]:     Layers,
  [ActiveTab.EXPLAINER]: Lightbulb,
  [ActiveTab.RADAR]:     BarChart2,
  [ActiveTab.ADMIN]:     Users,
  [ActiveTab.SEARCH]:    Search,
  [ActiveTab.PAPER]:     FileText,
  [ActiveTab.KNOWLEDGE_GRAPH]: Network,
};

/** Sidebar ist bewusst IMMER Navy — unabhängig vom Hell/Dunkel-Toggle des
 *  Hauptinhalts (User-Wunsch: derselbe Navy/Gold-Look wie LandingPage.tsx/
 *  AuthPage.tsx soll auch in der App sichtbar sein). Navy 1:1 von dort
 *  übernommen (#1B2A4A/#FBF9F4). "gold" ist `var(--sidebar-accent)` — folgt
 *  der vom Nutzer gewählten Akzentfarbe (Einstellungen → Akzentfarbe), aber
 *  NICHT `var(--primary)` direkt: eine zu dunkle Akzentfarbe (z.B. der
 *  "Navy"-Preset selbst) wäre auf dem immer-dunklen Sidebar-Hintergrund
 *  unlesbar. `--sidebar-accent` ist eine aufgehellte, garantiert kontrast-
 *  sichere Variante (components/ColorPicker.tsx, getSidebarSafeAccent). */
const SIDEBAR = {
  bg: '#1B2A4A',
  border: 'rgba(255,255,255,0.08)',
  text: '#FBF9F4',
  textMuted: 'rgba(251,249,244,0.55)',
  hoverBg: 'rgba(255,255,255,0.06)',
  chipBg: 'rgba(255,255,255,0.08)',
  chipBorder: 'rgba(255,255,255,0.14)',
  gold: 'var(--sidebar-accent)',
} as const;

export const Layout: React.FC<LayoutProps> = ({
  children, activeTab, onTabChange, collections = [], decks = [], activeModuleId = null, onModuleChange, user, userPlan = 'free',
  onLoginClick, onLogout, onUpgradeClick, onSettingsClick,
  isDark, onToggleTheme
}) => {
  const { t, tp } = useTranslation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [legalPage, setLegalPage] = useState<'impressum' | 'datenschutz' | 'agb' | null>(null);
  const [showCookieSettings, setShowCookieSettings] = useState(false);
  // Nur die breite Desktop-Sidebar (≥1024px) betroffen — Tablet-Icon-Leiste und
  // Mobile-Menü bleiben unverändert, dort ist Platz ohnehin schon knapp bemessen.
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState('studearc_sidebar_collapsed', false);



  const visibleGroups = isAdmin(user?.id) ? [...NAV_GROUPS, LABOR_GROUP] : NAV_GROUPS;
  const allNavItems = visibleGroups.flatMap(g => g.items);

  // Badge-Zähler: decks als Prop (reaktiv auf Sessions) bzw. Fehler-Queue per
  // Event (Service schreibt nur localStorage, kein React-State) — vorher wurden
  // beide einmal beim Mount berechnet und blieben nach einer Session veraltet stehen.
  const dueCardsCount = useMemo(
    () => countDueCards(decks.flatMap(d => d.cards.map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) }))),
    [decks],
  );

  const [dueMistakesCount, setDueMistakesCount] = useState(() => countDueMistakes());
  useEffect(() => {
    const update = () => setDueMistakesCount(countDueMistakes());
    window.addEventListener(MISTAKES_UPDATED_EVENT, update);
    return () => window.removeEventListener(MISTAKES_UPDATED_EVENT, update);
  }, []);

  const [streak, setStreak] = useState(() => getStreak());
  useEffect(() => {
    const handleStreakUpdate = () => setStreak(getStreak());
    window.addEventListener(STREAK_UPDATED_EVENT, handleStreakUpdate);
    return () => window.removeEventListener(STREAK_UPDATED_EVENT, handleStreakUpdate);
  }, []);

  const EXTRA_LABELS: Partial<Record<ActiveTab, TKey>> = {
    [ActiveTab.EXPLAINER]: 'nav.explainer',
    [ActiveTab.SEARCH]:    'nav.search',
    [ActiveTab.PAPER]:     'nav.paper',
  };
  const currentItem = allNavItems.find(i => i.tab === activeTab);
  const currentPageLabel = currentItem ? t(currentItem.labelKey) : EXTRA_LABELS[activeTab] ? t(EXTRA_LABELS[activeTab]!) : '';

  // Mobile bottom bar: der TÄGLICHE Lernkreislauf als primäre Navigation —
  // Heute (was ist fällig) → Quiz und Karten (lernen, wiederholen) → Klausur
  // (prüfen) → Coach (Analysieren). Karten gehören dazu, weil die fälligen
  // Wiederholungen der häufigste tägliche Anlass sind (Audit 23.09.2026: lagen
  // vorher unter "Mehr"). Bibliothek/Kalender sind Verwaltung → "Mehr".
  const mobileBottomTabs: { tab: ActiveTab; shortKey: TKey }[] = [
    { tab: ActiveTab.DASHBOARD, shortKey: 'nav.start' },
    { tab: ActiveTab.QUIZ,      shortKey: 'nav.quiz'  },
    { tab: ActiveTab.CARDS,     shortKey: 'nav.short.cards' },
    { tab: ActiveTab.EXAM,      shortKey: 'nav.short.exam' },
    { tab: ActiveTab.RADAR,     shortKey: 'nav.short.coach' },
  ];

  // Mobile "Mehr"-Sheet: Verwaltung + vertiefende Methoden. Reihenfolge =
  // Nutzen fürs Lernen, nicht Katalog. SEARCH/PAPER sind Labor-Features
  // (siehe navConfig.ts LABOR_GROUP) und daher nur für Admins sichtbar.
  const mobileSheetItems: { tab: ActiveTab; labelKey: TKey; icon: LucideIcon }[] = [
    { tab: ActiveTab.LIBRARY,   labelKey: 'nav.library',   icon: BookOpen },
    { tab: ActiveTab.RECALL,    labelKey: 'nav.recall',    icon: Brain },
    { tab: ActiveTab.EXPLAINER, labelKey: 'nav.explainer', icon: Lightbulb },
    { tab: ActiveTab.KNOWLEDGE_GRAPH, labelKey: 'nav.knowledgeGraph', icon: Network },
    { tab: ActiveTab.PLANNER,   labelKey: 'nav.planner',   icon: Calendar },
    ...(isAdmin(user?.id) ? [
      { tab: ActiveTab.SEARCH, labelKey: 'nav.search' as TKey, icon: Search },
      { tab: ActiveTab.PAPER,  labelKey: 'nav.paper'  as TKey, icon: FileText },
    ] : []),
  ];
  const userInitial = (user?.user_metadata?.full_name || user?.email || 'U')[0].toUpperCase();

  const handleMobileTabChange = (tab: ActiveTab) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex transition-colors duration-300 bg-transparent relative">

      {/* WICHTIG: kein overflow-hidden auf diesem äußeren Container — das
          würde ihn (statt html/body) zum "nächsten Scroll-Container" für
          position:sticky in der <aside> darunter machen. Da dieser Container
          selbst nie eigenständig scrollt (er wächst per min-h-screen immer
          exakt auf Inhaltshöhe), bliebe sticky dadurch komplett wirkungslos —
          die Sidebar würde beim echten Scrollen der Seite einfach normal
          wegscrollen statt oben fixiert zu bleiben (genau der gemeldete Bug:
          Nav verschwindet beim Scrollen, man sieht nur noch eine leere Navy-
          Fläche). overflow-hidden für die Einklapp-Animation sitzt bereits
          direkt auf der <aside> selbst, wird hier also nicht gebraucht.

          Navy-Hintergrundfläche über die GESAMTE Seitenhöhe, unabhängig vom
          Sticky-Nav-Inhalt daneben. Reine Farbfläche (kein Nav-Inhalt) —
          verhindert, dass bei langen Seiten unter dem Sidebar-Inhalt heller
          Hintergrund durchscheint, ohne die Sidebar selbst höher als einen
          Bildschirm machen zu müssen. */}
      <div
        className="hidden lg:block absolute inset-y-0 left-0 pointer-events-none transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ background: SIDEBAR.bg, width: sidebarCollapsed ? '0px' : '18rem' }}
        aria-hidden="true"
      />
      <div className="hidden md:block lg:hidden absolute inset-y-0 left-0 w-[72px] pointer-events-none" style={{ background: SIDEBAR.bg }} aria-hidden="true" />

      {/* ── DESKTOP SIDEBAR (≥ 1024px) — einklappbar, Zustand persistiert ──
          Breite/Opacity animiert statt hart weg-/hinzugemountet; der innere
          Inhalt behält seine volle Breite (w-72) und wird vom schrumpfenden
          äußeren Container nur zunehmend abgeschnitten + nach links geschoben
          — dadurch wirkt es wie ein weiches Einklappen statt eines harten Cuts. */}
      <aside
        className="hidden lg:flex flex-col h-screen sticky top-0 shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.15)] z-20 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          background: SIDEBAR.bg,
          borderRight: `1px solid ${SIDEBAR.border}`,
          width: sidebarCollapsed ? '0px' : '18rem',
          opacity: sidebarCollapsed ? 0 : 1,
        }}
        aria-hidden={sidebarCollapsed}
      >
        <div
          className="p-10 flex flex-col h-full w-72 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: sidebarCollapsed ? 'translateX(-24px)' : 'translateX(0)' }}
        >
          <div className="flex items-center gap-3 mb-12">
            <BrandMark size={26} strokeColor={SIDEBAR.text} peakColor={SIDEBAR.gold} className="shrink-0" />
            <span className="text-xl font-semibold tracking-tighter truncate flex-1" style={{ color: SIDEBAR.text }}>Stude<span style={{ color: SIDEBAR.gold }}>Arc</span></span>
            <button
              onClick={() => setSidebarCollapsed(true)}
              aria-label={t('layout.collapseSidebar')}
              title={t('layout.collapseSidebar')}
              className="shrink-0 transition-colors"
              style={{ color: SIDEBAR.textMuted }}
            >
              <PanelLeftClose className="w-4 h-4" strokeWidth={1.75} />
            </button>
            {streak.current > 0 && (
              <div className="flex items-center gap-1 shrink-0" title={t('layout.streakTitle', { n: streak.current })}>
                <Star
                  className="w-4 h-4"
                  style={{ color: streak.todayDone ? SIDEBAR.gold : SIDEBAR.textMuted }}
                  fill={streak.todayDone ? SIDEBAR.gold : 'none'}
                  strokeWidth={2}
                />
                <span className="text-[11px] font-semibold" style={{ color: streak.todayDone ? SIDEBAR.gold : SIDEBAR.textMuted }}>
                  {streak.current}
                </span>
              </div>
            )}
          </div>

          {/* Globaler Tag-/Nachtmodus-Umschalter — unterhalb des Ein-/Ausklapp-
              Buttons, damit er überall in der App erreichbar ist (User-Vorgabe
              2026-08-04), nicht nur im Wissensnetz. Steuert denselben
              App-weiten Zustand wie der bestehende Umschalter im Mobile-Menü
              und in den Einstellungen (useAuth().isDark/toggleTheme) — kein
              eigener Theme-Zustand. */}
          <div className="flex items-center justify-between gap-2 -mt-8 mb-6 shrink-0">
          <button
            onClick={onToggleTheme}
            aria-label={isDark ? t('layout.dayMode') : t('layout.nightMode')}
            title={isDark ? t('layout.dayMode') : t('layout.nightMode')}
            className="flex items-center gap-1.5 transition-colors"
            style={{ color: SIDEBAR.textMuted }}
          >
            {isDark ? <Sun className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <Moon className="w-[18px] h-[18px]" strokeWidth={1.75} />}
            <span className="text-[13px] font-semibold">
              {isDark ? t('layout.dayMode') : t('layout.nightMode')}
            </span>
          </button>
          {user && (
            <button
              onClick={openGlobalSearch}
              aria-label={t('gs.open')}
              title={`${t('gs.open')} (${SEARCH_SHORTCUT})`}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors hover:opacity-80"
              style={{ color: SIDEBAR.textMuted, border: `1px solid ${SIDEBAR.chipBorder}` }}
            >
              <Search className="w-[15px] h-[15px]" strokeWidth={2} />
              <span className="text-[11px] font-semibold">{SEARCH_SHORTCUT}</span>
            </button>
          )}
          </div>

          {/* Fach-Kontext: gewähltes Modul gilt überall als Vorauswahl.
              Auch ohne Ordner sichtbar — sonst wissen Nutzer nicht, dass es das Feature gibt. */}
          {onModuleChange && collections.length === 0 && (
            <div className="mb-6 -mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1.5 px-1" style={{ color: SIDEBAR.textMuted }}>{t('layout.activeSubject')}</p>
              <button
                onClick={() => onTabChange(ActiveTab.LIBRARY)}
                className="w-full px-3 py-2.5 rounded-xl text-left transition-all hover:translate-x-0.5"
                style={{ background: SIDEBAR.chipBg, border: `1px dashed ${SIDEBAR.chipBorder}` }}
              >
                <span className="text-[13px] font-semibold block" style={{ color: SIDEBAR.text }}>{t('layout.allSubjects')}</span>
                <span className="block text-[11px] font-medium mt-0.5" style={{ color: SIDEBAR.textMuted }}>{t('layout.subjectHint')}</span>
              </button>
            </div>
          )}
          {onModuleChange && collections.length > 0 && (
            <div className="mb-6 -mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1.5 px-1" style={{ color: SIDEBAR.textMuted }}>{t('layout.activeSubject')}</p>
              <select
                value={activeModuleId ?? ''}
                onChange={e => onModuleChange(e.target.value || null)}
                aria-label={t('layout.selectSubject')}
                className="w-full px-3 py-2.5 rounded-xl text-[13px] font-semibold outline-none cursor-pointer"
                style={{
                  background: activeModuleId ? 'color-mix(in srgb, var(--sidebar-accent) 18%, #1B2A4A)' : SIDEBAR.chipBg,
                  border: `1px solid ${activeModuleId ? SIDEBAR.gold : SIDEBAR.chipBorder}`,
                  color: activeModuleId ? SIDEBAR.gold : SIDEBAR.text,
                }}
              >
                <option value="">{t('layout.allSubjects')}</option>
                {collections.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sichtbare, dünne Scrollleiste: mit versteckter Leiste merkte niemand,
              dass unten noch Menüpunkte liegen (Audit 23.09.2026, 900 px Höhe). */}
          <nav className="sidebar-nav space-y-0.5 overflow-y-auto pr-1 flex-1 min-h-0">
            {visibleGroups.map((group, gi) => (
              <div key={gi}>
                {group.titleKey && (
                  <p className="sidebar-group-title px-3 pt-5 pb-1.5 text-xs font-semibold" style={{ color: SIDEBAR.textMuted }}>
                    {t(group.titleKey)}
                  </p>
                )}
                {group.items.map(item => {
                  const isActive = activeTab === item.tab;
                  const Icon = ICONS[item.tab];
                  return (
                    <button
                      key={item.tab}
                      data-tour={`nav-${item.tab}`}
                      onClick={() => onTabChange(item.tab)}
                      className={`sidebar-item w-full flex items-center gap-3 px-4 py-2.5 rounded-[14px] text-left transition-all duration-200 ${isActive ? 'shadow-[0_2px_12px_rgba(169,119,44,0.35)]' : 'hover:translate-x-0.5'}`}
                      style={isActive
                        ? { background: SIDEBAR.gold, color: SIDEBAR.bg }
                        : { color: SIDEBAR.textMuted, background: 'transparent' }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = SIDEBAR.hoverBg; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {Icon && <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />}
                      <div className="flex-1 min-w-0">
                        {/* Einzeilig in allen Schriftarten (Garamond & Co. laufen breiter):
                            engere Laufweite statt tracking-widest, truncate als Notbremse */}
                        <span className="text-xs font-semibold block truncate" style={!isActive ? { color: SIDEBAR.text } : undefined}>{t(item.labelKey)}</span>
                        {item.hintKey && !isActive && (
                          <span className="sidebar-hint block text-[11px] font-medium normal-case tracking-normal mt-0.5 break-words" style={{ color: SIDEBAR.text }}>
                            {t(item.hintKey)}
                          </span>
                        )}
                      </div>
                      {item.tab === ActiveTab.CARDS && dueCardsCount > 0 && (
                        <span
                          className="text-[11px] font-semibold rounded-full px-1.5 py-0.5 shrink-0"
                          style={isActive ? { background: SIDEBAR.bg, color: SIDEBAR.gold } : { background: SIDEBAR.gold, color: SIDEBAR.bg }}
                        >{dueCardsCount}</span>
                      )}
                      {item.tab === ActiveTab.QUIZ && dueMistakesCount > 0 && (
                        <span
                          className="text-[11px] font-semibold rounded-full px-1.5 py-0.5 shrink-0"
                          style={isActive ? { background: SIDEBAR.bg, color: SIDEBAR.gold } : { background: SIDEBAR.gold, color: SIDEBAR.bg }}
                        >{dueMistakesCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="mt-6 space-y-2">
            {user ? (
              <>
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: SIDEBAR.chipBg }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-semibold shrink-0"
                    style={{ color: SIDEBAR.bg, background: SIDEBAR.gold }}
                  >{userInitial}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold break-words flex items-center gap-1.5" style={{ color: SIDEBAR.text }}>
                      <span className="truncate">{user.user_metadata?.full_name || t('layout.user')}</span>
                      {userPlan === 'pro' && (
                        <span
                          className="text-[11px] font-semibold uppercase tracking-[0.08em] rounded-full px-1.5 py-0.5 shrink-0"
                          style={{ background: SIDEBAR.gold, color: SIDEBAR.bg }}
                        >Pro</span>
                      )}
                    </p>
                    {/* Immer eine Zeile — kein Umbruch, volle Adresse per Tooltip */}
                    <p className="text-[11px] flex items-center gap-1.5 min-w-0" style={{ color: SIDEBAR.textMuted }} title={user.email ?? ''}>
                      {userPlan !== 'pro' && (
                        <button
                          onClick={onUpgradeClick}
                          className="sidebar-upgrade-chip text-[13px] font-semibold rounded-full px-1.5 py-0.5 shrink-0"
                          style={{ border: `1px solid ${SIDEBAR.gold}`, color: SIDEBAR.gold }}
                        >Pro</button>
                      )}
                      <span className="truncate">{user.email}</span>
                    </p>
                  </div>
                  <button onClick={onSettingsClick} aria-label={t('layout.settings')} title={t('layout.settings')} className="transition-colors shrink-0 hover:opacity-80" style={{ color: SIDEBAR.textMuted }}>
                    <Settings className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  </button>
                  <button onClick={onLogout} aria-label={t('layout.logoutTitle', { email: user.email ?? '' })} title={t('layout.logout')} className="transition-colors shrink-0 hover:opacity-80" style={{ color: SIDEBAR.textMuted }}>
                    <LogOut className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  </button>
                </div>
                {userPlan !== 'pro' && (
                  <button
                    onClick={onUpgradeClick}
                    className="sidebar-upgrade w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold transition-all hover:scale-[1.02]"
                    style={{ background: 'color-mix(in srgb, var(--sidebar-accent) 18%, #1B2A4A)', color: SIDEBAR.gold, border: `1px solid ${SIDEBAR.gold}` }}
                  >
                    <Zap className="w-3.5 h-3.5" strokeWidth={2} />
                    {t('layout.upgradePro')}
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={onLoginClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-[13px] font-semibold transition-all hover:scale-[1.02]"
                style={{ background: SIDEBAR.gold, color: SIDEBAR.bg }}
              >
                <LogIn className="w-[18px] h-[18px]" strokeWidth={1.75} />
                {t('layout.loginRegister')}
              </button>
            )}
          </div>

          <div className="mt-3 pt-3 space-y-2" style={{ borderTop: `1px solid ${SIDEBAR.border}` }}>
            {!user && (
              <button
                onClick={onSettingsClick}
                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                style={{ background: SIDEBAR.chipBg, color: SIDEBAR.textMuted }}
              >
                <Settings className="w-4 h-4" strokeWidth={1.75} />
                {t('layout.settings')}
              </button>
            )}
            {/* Normale Schreibweise statt gesperrter Versalien: passt in eine Zeile
                und bleibt direkt erreichbar (Impressum-Pflicht). */}
            <div className="flex justify-center gap-x-2.5 gap-y-1 flex-wrap">
              {(['impressum', 'datenschutz', 'agb'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setLegalPage(p)}
                  className="text-[11px] font-semibold transition-colors hover:underline"
                  style={{ color: SIDEBAR.textMuted }}
                >
                  {p === 'impressum' ? t('legal.imprint') : p === 'datenschutz' ? t('legal.privacy') : t('legal.terms')}
                </button>
              ))}
              <button
                onClick={() => setShowCookieSettings(true)}
                className="text-[11px] font-semibold transition-colors hover:underline"
                style={{ color: SIDEBAR.textMuted }}
                title={t('cookie.settingsLink')}
              >
                {t('cookie.settingsShort')}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Wieder einblenden — nur sichtbar, wenn die Desktop-Sidebar eingeklappt ist */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          aria-label={t('layout.expandSidebar')}
          title={t('layout.expandSidebar')}
          className="hidden lg:flex fixed top-4 left-4 z-30 w-9 h-9 rounded-xl items-center justify-center shadow-lg transition-all hover:scale-105 animate-in fade-in"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)', animationDelay: '200ms', animationDuration: '250ms' }}
        >
          <PanelLeftOpen className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}

      {/* ── TABLET SIDEBAR (768px – 1023px) ── */}
      <aside
        className="hidden md:flex lg:hidden flex-col h-screen w-[72px] sticky top-0 z-20"
        style={{ background: SIDEBAR.bg, borderRight: `1px solid ${SIDEBAR.border}` }}
      >
        {/* Scrollable top: logo + all nav items */}
        <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col items-center gap-1 pt-4 pb-2">
          <BrandMark size={26} strokeColor={SIDEBAR.text} peakColor={SIDEBAR.gold} className="mb-5 shrink-0" />

          {allNavItems.map(item => {
            const isActive = activeTab === item.tab;
            const Icon = ICONS[item.tab];
            return (
              <button
                key={item.tab}
                data-tour={`nav-${item.tab}`}
                onClick={() => onTabChange(item.tab)}
                aria-label={t(item.labelKey)} title={t(item.labelKey)}
                className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 ${isActive ? 'shadow-[0_2px_12px_rgba(169,119,44,0.35)]' : ''}`}
                style={isActive ? { background: SIDEBAR.gold, color: SIDEBAR.bg } : { color: SIDEBAR.textMuted }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = SIDEBAR.hoverBg; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                {Icon && <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />}
              </button>
            );
          })}
        </div>

        {/* Fixed bottom: settings + user */}
        <div
          className="shrink-0 flex flex-col items-center gap-2 py-3"
          style={{ borderTop: `1px solid ${SIDEBAR.border}` }}
        >
          {user && (
            <button
              onClick={openGlobalSearch}
              aria-label={t('gs.open')} title={`${t('gs.open')} (${SEARCH_SHORTCUT})`}
              className="w-12 h-12 flex items-center justify-center rounded-xl transition-all"
              style={{ color: SIDEBAR.textMuted }}
              onMouseEnter={e => { e.currentTarget.style.background = SIDEBAR.hoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Search className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>
          )}
          <button
            onClick={onSettingsClick}
            aria-label={t('layout.settings')} title={t('layout.settings')}
            className="w-12 h-12 flex items-center justify-center rounded-xl transition-all"
            style={{ color: SIDEBAR.textMuted }}
            onMouseEnter={e => { e.currentTarget.style.background = SIDEBAR.hoverBg; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Settings className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
          {user ? (
            <button
              aria-label={t('layout.logoutTitle', { email: user.email ?? '' })} title={t('layout.logoutTitle', { email: user.email ?? '' })}
              onClick={onLogout}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-semibold transition-all hover:scale-105"
              style={{ background: SIDEBAR.gold, color: SIDEBAR.bg }}
            >{userInitial}</button>
          ) : (
            <button
              onClick={onLoginClick}
              aria-label={t('layout.login')} title={t('layout.login')}
              className="w-12 h-12 flex items-center justify-center rounded-xl transition-all"
              style={{ background: SIDEBAR.gold, color: SIDEBAR.bg }}
            >
              <LogIn className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </aside>

      {/* ── MOBILE TOPBAR (< 768px) ── */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 backdrop-blur-xl"
        style={{
          background: 'color-mix(in srgb, var(--bg-sidebar) 95%, transparent)',
          borderBottom: '1px solid var(--border-color)',
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top))',
        }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <BrandMark size={20} strokeColor="var(--mark-stroke)" peakColor="var(--mark-peak)" className="shrink-0" />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>Stude<span style={{ color: 'var(--primary-ink)' }}>Arc</span></span>
        </div>

        <span className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold text-slate-400 pointer-events-none max-w-[60vw] truncate">
          {currentPageLabel}
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {streak.current > 0 && (
            <div className="flex items-center gap-0.5 px-2">
              <Star
                className="w-4 h-4"
                style={{ color: streak.todayDone ? 'var(--primary)' : '#94a3b8' }}
                fill={streak.todayDone ? 'var(--primary)' : 'none'}
                strokeWidth={2}
              />
              <span className="text-[11px] font-semibold" style={{ color: streak.todayDone ? 'var(--primary)' : '#94a3b8' }}>
                {streak.current}
              </span>
            </div>
          )}
          {user && (
            <button
              onClick={openGlobalSearch}
              aria-label={t('gs.open')}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              <Search className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>
          )}
          <button
            onClick={onSettingsClick}
            aria-label={t('layout.settings')}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <Settings className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
          {user ? (
            <button aria-label={t('layout.openMenu')}
              onClick={() => setIsMobileMenuOpen(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-semibold transition-all"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >{userInitial}</button>
          ) : (
            <button
              onClick={onLoginClick}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl text-[13px] font-semibold transition-all"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              <LogIn className="w-[14px] h-[14px]" strokeWidth={1.75} />
              {t('layout.login')}
            </button>
          )}
        </div>
      </header>

      {/* ── MOBILE BOTTOM NAV (< 768px) ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-[60] flex justify-around items-center pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl shadow-2xl"
        style={{ background: 'color-mix(in srgb, var(--bg-sidebar) 95%, transparent)', borderTop: '1px solid var(--border-color)' }}
      >
        {mobileBottomTabs.map(item => {
          const isActive = activeTab === item.tab;
          const Icon = ICONS[item.tab];
          return (
            <button
              key={item.tab}
              data-tour={`nav-${item.tab}`}
              onClick={() => handleMobileTabChange(item.tab)}
              className="relative flex flex-col items-center gap-1 min-w-[3rem] px-1.5 py-1 rounded-xl transition-all"
              style={isActive ? { color: 'var(--primary-ink)' } : { color: 'var(--nav-inactive)' }}
            >
              {Icon && <Icon className="w-6 h-6" strokeWidth={1.75} />}
              {item.tab === ActiveTab.CARDS && dueCardsCount > 0 && (
                <span
                  className="absolute -top-1 right-0 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold leading-[18px] text-center"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                  aria-label={tp('dashboard.cardsN', dueCardsCount)}
                >{dueCardsCount > 99 ? '99+' : dueCardsCount}</span>
              )}
              <span className="text-xs font-semibold">{t(item.shortKey)}</span>
            </button>
          );
        })}
        <button
          onClick={() => setIsMobileMenuOpen(v => !v)}
          className="flex flex-col items-center gap-1 min-w-[3rem] px-2 py-1 rounded-xl transition-all"
          style={isMobileMenuOpen ? { color: 'var(--primary-ink)' } : { color: 'var(--nav-inactive)' }}
        >
          {isMobileMenuOpen
            ? <X className="w-6 h-6" strokeWidth={1.75} />
            : <Menu className="w-6 h-6" strokeWidth={1.75} />}
          <span className="text-[13px] font-semibold">{t('nav.more')}</span>
        </button>
      </nav>

      {/* ── MOBILE "MEHR" BOTTOM SHEET (< 768px) ── */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="absolute bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] inset-x-0 rounded-t-[28px] shadow-2xl"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="pt-3 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            <div className="overflow-y-auto max-h-[68vh] px-5 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] space-y-3">
              {/* Secondary nav grid */}
              <div className="grid grid-cols-2 gap-3">
                {mobileSheetItems.map(item => {
                  const isActive = activeTab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      data-tour={`nav-${item.tab}`}
                      onClick={() => handleMobileTabChange(item.tab)}
                      className="flex items-center gap-3 p-4 rounded-2xl border transition-all text-left"
                      style={
                        isActive
                          ? { background: 'var(--primary)', color: 'var(--primary-text)', borderColor: 'var(--primary)' }
                          : { background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))', borderColor: 'var(--border-color)' }
                      }
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
                      <span className="text-xs font-semibold leading-tight">{t(item.labelKey)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="h-px" style={{ background: 'var(--border-color)' }} />

              {/* API Key */}
              <button
                onClick={() => { setIsMobileMenuOpen(false); setShowApiSettings(true); }}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all"
                style={{
                  borderColor: 'var(--border-color)',
                  background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))',
                }}
              >
                <span className="text-[13px] font-semibold flex items-center gap-2">
                  <KeyRound className="w-4 h-4" strokeWidth={1.75} />
                  {t('layout.apiKey')}
                </span>
                <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
              </button>

              {/* Theme toggle */}
              <button
                onClick={onToggleTheme}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all"
                style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-sidebar))', borderColor: 'var(--border-color)' }}
              >
                <span className="text-[13px] font-semibold">
                  {isDark ? t('layout.dayMode') : t('layout.nightMode')}
                </span>
                {isDark ? <Sun className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <Moon className="w-[18px] h-[18px]" strokeWidth={1.75} />}
              </button>

              <ColorPicker />

              {/* Login / Logout */}
              {user ? (
                <button
                  onClick={() => { onLogout?.(); setIsMobileMenuOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl text-[13px] font-semibold text-rose-500 transition-all"
                  style={{ background: 'color-mix(in srgb, #f43f5e 8%, var(--bg-sidebar))', border: '1px solid color-mix(in srgb, #f43f5e 20%, transparent)' }}
                >
                  <LogOut className="w-4 h-4" strokeWidth={1.75} />
                  {t('layout.logout')}
                </button>
              ) : (
                <button
                  onClick={() => { onLoginClick?.(); setIsMobileMenuOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl text-[13px] font-semibold transition-all"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                >
                  <LogIn className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  {t('layout.loginRegister')}
                </button>
              )}

              {/* Legal */}
              <div className="flex justify-center gap-4 pt-1 flex-wrap">
                {(['impressum', 'datenschutz', 'agb'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => { setIsMobileMenuOpen(false); setLegalPage(p); }}
                    className="text-[13px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {p === 'impressum' ? t('legal.imprint') : p === 'datenschutz' ? t('legal.privacy') : t('legal.terms')}
                  </button>
                ))}
                <button
                  onClick={() => { setIsMobileMenuOpen(false); setShowCookieSettings(true); }}
                  className="text-[13px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {t('cookie.settingsLink')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      {/* Reader und Wissensnetz füllen die Fläche (Split-Screen bzw. Pan/Zoom-Kanvas brauchen jeden Pixel), alle anderen Tabs behalten den zentrierten Lesebreiten-Container.
          Bei eingeklappter Sidebar zusätzlicher linker Platz (nur ≥1024px, wo der Einblenden-Button schwebt) —
          sonst überlappt er knapp bemessene Header-Zeilen wie im Reader ("← Zurück" sitzt sonst genau darunter). */}
      {/* overflow-x: clip statt overflow-y-auto: main scrollt nie selbst (wächst mit
          dem Inhalt, das Fenster scrollt), ein overflow-Wert ungleich visible/clip
          machte es aber zum Bezugsrahmen für position:sticky. Dadurch klebten
          Composer, Antwortleisten und Kopfzeilen in den Tabs nie am Viewport,
          sondern lagen am Seitenende (auf dem Handy hinter der Bottom-Nav). */}
      <main style={{ overflowX: 'clip' }} className={`flex-grow w-full relative ${activeTab === ActiveTab.READER
        ? 'pt-[calc(4rem+env(safe-area-inset-top))] pb-20 px-2 sm:px-4 md:pt-4 md:pb-4 md:px-4'
        : 'pt-[calc(4rem+env(safe-area-inset-top))] pb-24 px-4 sm:px-6 md:pt-8 md:pb-8 md:px-8 lg:pt-16 lg:pb-16 lg:px-16'} ${sidebarCollapsed ? 'lg:pl-14' : ''}`}>
        <div className={`relative z-10 ${activeTab === ActiveTab.READER || activeTab === ActiveTab.KNOWLEDGE_GRAPH ? 'w-full' : 'max-w-6xl mx-auto'}`}>{children}</div>
      </main>

      {showApiSettings && (
        <ApiKeySettings onClose={() => setShowApiSettings(false)} />
      )}
      {legalPage && (
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />
      )}
      {showCookieSettings && (
        <CookieSettingsModal onClose={() => setShowCookieSettings(false)} onShowPrivacy={() => setLegalPage('datenschutz')} />
      )}

    </div>
  );
};
