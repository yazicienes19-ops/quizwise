import { ActiveTab } from '../../types';
import type { TKey } from '../../i18n';

/** Wiederverwendung der bestehenden Nav-Labels statt neuer, doppelter Übersetzungen. */
export const TAB_LABEL_KEY: Partial<Record<ActiveTab, TKey>> = {
  [ActiveTab.QUIZ]: 'nav.quiz',
  [ActiveTab.CARDS]: 'nav.cards',
  [ActiveTab.RECALL]: 'nav.recall',
  [ActiveTab.EXAM]: 'nav.exam',
  [ActiveTab.RADAR]: 'nav.radar',
  [ActiveTab.PLANNER]: 'nav.planner',
  [ActiveTab.EXPLAINER]: 'nav.explainer',
  [ActiveTab.LIBRARY]: 'nav.library',
};

/** Rein dekorative Icons für die Empfehlungs-/Lernmoment-Screens, kein neues Design-System. */
export const TAB_ICON: Partial<Record<ActiveTab, string>> = {
  [ActiveTab.QUIZ]: '📝',
  [ActiveTab.CARDS]: '🔁',
  [ActiveTab.RECALL]: '🧠',
  [ActiveTab.EXAM]: '🎓',
  [ActiveTab.RADAR]: '📊',
  [ActiveTab.PLANNER]: '🗓️',
  [ActiveTab.EXPLAINER]: '💬',
  [ActiveTab.LIBRARY]: '📚',
};
