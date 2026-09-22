import { t } from '../i18n';
import { toast } from './toast';

// Backend meldet ab 80 % des Monatsbudgets { budget: 'soft' } (Pro läuft dann
// im Sparmodus, s. backend/src/budget/aiBudget.js). Hinweis nur einmal pro
// Sitzung, sonst käme er bei jeder Antwort.
let shown = false;

export const notifyBudgetSoft = (): void => {
  if (shown) return;
  shown = true;
  toast.info(t('errors.budgetSoft'));
};

export const isBudgetExhausted = (message: unknown): boolean =>
  typeof message === 'string' && message.startsWith('BUDGET_EXHAUSTED');
