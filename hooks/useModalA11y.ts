import { useEffect, useId, useRef, type RefObject } from 'react';

/**
 * useModalA11y — gemeinsame Accessibility-Infrastruktur für alle Modals.
 *
 * Übernimmt: role="dialog"/aria-modal, aria-labelledby (+ optional
 * aria-describedby über descriptionId), Focus Trap (Tab/Shift+Tab bleibt im
 * Panel), Fokus auf das erste fokussierbare Element beim Öffnen, Fokus-
 * Rückgabe auf das auslösende Element beim Schließen, ESC ruft onClose auf,
 * und aria-hidden auf #root während das Modal offen ist (Screenreader-
 * Hintergrundisolation — setzt voraus, dass das Modal per createPortal nach
 * document.body gerendert wird, sonst würde sich das Modal selbst mitverstecken).
 *
 * Bewusst NICHT enthalten: Backdrop-Klick-Verhalten (bleibt pro Modal
 * individuell, manche schließen nie/bedingt bei Backdrop-Klick — s.
 * DESIGN_AUDIT.md Phase-2-Plan) und jegliche visuelle/Layout-Logik.
 *
 * `initialFocusRef`: optional. Ohne Angabe fokussiert der Hook beim Öffnen
 * das erste fokussierbare Element im Panel (DOM-Reihenfolge). Einzelne
 * Modals hatten aber bereits ein bewusst gewähltes Fokus-Ziel, das nicht in
 * DOM-Reihenfolge das erste Element ist (z.B. EditCardModal/AnkiImportModal
 * fokussieren gezielt ein Eingabefeld, nicht den davor liegenden Schließen-
 * Button) — für diese Fälle das bisherige Ref hier durchreichen, statt das
 * bisherige Verhalten zu verschlechtern.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'textarea:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(el => el.offsetParent !== null); // versteckte Elemente (display:none etc.) ausschließen
}

export function useModalA11y(
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Fokus beim Öffnen setzen + beim Schließen zurückgeben
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else if (panel) {
      const focusable = getFocusableElements(panel);
      (focusable[0] ?? panel).focus();
    }
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  // ESC schließt + Focus Trap (Tab/Shift+Tab zyklisch im Panel halten)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Hintergrund für Screenreader ausblenden, solange das Modal offen ist
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const previous = root.getAttribute('aria-hidden');
    root.setAttribute('aria-hidden', 'true');
    return () => {
      if (previous === null) root.removeAttribute('aria-hidden');
      else root.setAttribute('aria-hidden', previous);
    };
  }, []);

  return {
    panelRef,
    titleId,
    descriptionId,
    dialogProps: {
      ref: panelRef,
      role: 'dialog' as const,
      'aria-modal': true as const,
      'aria-labelledby': titleId,
    },
  };
}
