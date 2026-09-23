import { toast } from './toast';
import { t } from '../i18n';

/**
 * Löschen mit "Rückgängig" (Audit 23.09.2026: Dokumente und Stapel samt
 * Lernstand waren sofort und endgültig weg).
 *
 * Ablauf: Der Aufrufer blendet das Element sofort aus. `commit` (die echte,
 * endgültige Löschung) läuft nach `ms` Millisekunden oder spätestens, wenn der
 * Tab geschlossen wird. Ein Klick auf "Rückgängig" ruft stattdessen `undo`
 * und verhindert `commit`. Beides läuft höchstens einmal.
 */
export const runUndoable = ({ message, commit, undo, ms = 8000 }: {
  message: string;
  commit: () => void;
  undo: () => void;
  ms?: number;
}): void => {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    window.removeEventListener('pagehide', finish);
    commit();
  };
  const timer = setTimeout(finish, ms);
  window.addEventListener('pagehide', finish);
  toast.withAction(message, {
    label: t('common.undo'),
    onClick: () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('pagehide', finish);
      undo();
    },
  }, ms);
};
