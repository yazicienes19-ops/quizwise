/**
 * Bestätigungsdialog im App-Design statt window.confirm() (Audit 23.09.2026:
 * 13 Löschbestätigungen nutzten das Browserfenster, das fremd aussieht und in
 * manchen App-Hüllen gar nicht erscheint).
 *
 * Verwendung:
 *   if (!(await confirmDialog({ message: t('lib.deleteFolderConfirm', …), danger: true }))) return;
 *
 * Angezeigt wird der Dialog von <ConfirmDialogHost />, der an denselben Stellen
 * wie <ToastContainer /> eingehängt ist. Ohne Host (z. B. in Tests) fällt die
 * Funktion auf window.confirm zurück, damit nichts stillschweigend bestätigt wird.
 */
export interface ConfirmRequest {
  message: string;
  /** Text des Bestätigungsknopfs; Standard "Löschen" bei danger, sonst "Bestätigen". */
  confirmLabel?: string;
  /** Roter Bestätigungsknopf für endgültige Aktionen. */
  danger?: boolean;
}

export interface PendingConfirm extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

type Listener = (pending: PendingConfirm | null) => void;
let listener: Listener | null = null;

export const registerConfirmHost = (l: Listener): (() => void) => {
  listener = l;
  return () => { if (listener === l) listener = null; };
};

export const confirmDialog = (req: ConfirmRequest): Promise<boolean> => {
  if (!listener) return Promise.resolve(typeof window !== 'undefined' && window.confirm(req.message));
  const host = listener;
  return new Promise<boolean>(resolve => {
    host({
      ...req,
      resolve: ok => { host(null); resolve(ok); },
    });
  });
};
