import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../i18n/I18nProvider';

const CARD_WIDTH = 420;
const GAP = 20;
const EDGE_PAD = 24;
/** Nur Fallback für den allerersten Frame, bevor die Karte einmal real gemessen
 *  wurde (s. cardHeight-State unten) — KEINE Grundlage mehr für die Positions-
 *  Berechnung selbst. Frühere Fassung nutzte exakt diese Konstante direkt zur
 *  top-Clamp-Berechnung; bei Schritten mit Preview-Panel (z. B. Coach) ist die
 *  echte Kartenhöhe deutlich größer, wodurch die Karte bei einem weiter unten
 *  liegenden Ziel + kurzem Viewport unten aus dem Bildschirm ragte (Button
 *  nicht mehr erreichbar — reproduziert bei 700px Fensterhöhe, Schritt 6/6). */
const ASSUMED_MIN_HEIGHT = 260;
/** Abstand zwischen Hervorhebungs-Rahmen und dem eigentlichen Ziel-Element. */
const TARGET_PAD = 8;

interface TourSpotlightProps {
  /** CSS-Selektor des hervorzuhebenden Elements, z. B. `[data-tour="nav-LIBRARY"]`. */
  targetSelector: string;
  title: string;
  body: string;
  ctaLabel: string;
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  stepIndex: number;
  totalSteps: number;
  /** Kuratiertes Vorschau-Panel für Bereiche ohne aussagekräftigen echten Inhalt (Quiz/Karten/Analyse/Coach/…). */
  previewPanel?: React.ReactNode;
  /** z. B. "Beispielhafte Darstellung" — nur zusammen mit previewPanel sinnvoll. */
  badgeLabel?: string;
  /** true = dieser Tour-Schritt zeigt genau die Funktion, die im USP-Moment
   *  zuvor als persönliche Empfehlung hervorgehoben wurde ("Deine Lösung") —
   *  bekommt ein zusätzliches, auffälliges Badge, damit der Nutzer den Bezug
   *  wiedererkennt, statt die Tour wie eine reine Feature-Aufzählung wirken
   *  zu lassen (User-Feedback: "bei der Vorstellung aller Features sagen:
   *  das ist dein Feynman"). */
  isPrimaryRecommendation?: boolean;
}

/** `cardHeight` = die ECHTE, gemessene Kartenhöhe (s. cardHeight-State), nicht
 *  mehr geraten — der `top`-Clamp stellt damit sicher, dass `top + cardHeight`
 *  nie über den unteren Viewport-Rand hinausragt, egal wie viel Inhalt
 *  (insbesondere ein Preview-Panel) die Karte tatsächlich hat. */
function cardPositionStyle(rect: DOMRect, cardHeight: number): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceRight = vw - rect.right;
  const maxTop = Math.max(EDGE_PAD, vh - EDGE_PAD - cardHeight);

  if (spaceRight > CARD_WIDTH + GAP + EDGE_PAD) {
    const top = Math.min(Math.max(rect.top, EDGE_PAD), maxTop);
    return { position: 'fixed', top, left: rect.right + GAP, width: CARD_WIDTH };
  }
  const top = Math.min(rect.bottom + GAP, maxTop);
  const left = Math.min(Math.max(rect.left, EDGE_PAD), Math.max(EDGE_PAD, vw - CARD_WIDTH - EDGE_PAD));
  return { position: 'fixed', top, left, width: CARD_WIDTH };
}

/**
 * Generische Hülle für alle App-Tour-Schritte (Onboarding-Plan Abschnitt 2):
 * dunkelt den Bildschirm bis auf ein Ziel-Element ab (4 Rahmen-Rechtecke statt
 * CSS-Mask/SVG — einfacher aus einem DOMRect zu berechnen) und zeigt daneben
 * eine Erklär-Karte. Navigiert NICHT selbst — der Aufrufer setzt vorher den
 * echten `activeTab`, damit die echte Seite (inkl. Empty-States) sichtbar
 * hinter der Abdunklung liegt.
 *
 * Neuberechnung der Ziel-Position läuft über eine rAF-Schleife statt Resize-/
 * Scroll-Listener + ResizeObserver-Kombination — deckt damit einheitlich auch
 * die CSS-Transition beim Ein-/Ausklappen der Sidebar ab (Layout.tsx:167-186),
 * ohne mehrere Beobachtungs-Mechanismen koordinieren zu müssen. Kosten sind
 * vernachlässigbar (ein getBoundingClientRect()-Aufruf pro Frame, nur während
 * ein Tour-Schritt sichtbar ist).
 *
 * Wird das Ziel nicht gefunden (z. B. schmaler Viewport, Sidebar-Item nicht im
 * DOM), degradiert der Screen auf eine einfache zentrierte Karte ohne
 * Hervorhebung — gleicher Inhalt, nur ohne Spotlight.
 */
export const TourSpotlight: React.FC<TourSpotlightProps> = ({
  targetSelector, title, body, ctaLabel, onNext, onBack, onSkip, stepIndex, totalSteps, previewPanel, badgeLabel, isPrimaryRecommendation,
}) => {
  const { t } = useTranslation();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardHeight, setCardHeight] = useState(ASSUMED_MIN_HEIGHT);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    let scrolledIntoView = false;
    setCardHeight(ASSUMED_MIN_HEIGHT); // neuer Schritt: Fallback, bis der erste echte Messwert da ist
    const measure = () => {
      // Echte Kartenhöhe für die top-Clamp in cardPositionStyle() — läuft im
      // selben rAF-Zyklus wie die Ziel-Messung, damit z. B. ein nachträglich
      // ladendes Preview-Panel die Position noch im laufenden Betrieb korrigiert.
      const measuredHeight = cardRef.current?.getBoundingClientRect().height;
      if (measuredHeight) {
        // Funktionale Form: liest den jeweils aktuellsten State statt des beim
        // Effekt-Setup eingefangenen (sonst bliebe der Vergleich für die Laufzeit
        // des Effekts auf dem ANFANGSWERT stehen, da targetSelector — nicht
        // cardHeight — die einzige Dependency ist).
        setCardHeight(prev => (Math.abs(measuredHeight - prev) > 1 ? measuredHeight : prev));
      }
      // Layout.tsx rendert denselben data-tour-Button pro Breakpoint mehrfach
      // parallel im DOM (Desktop-Sidebar/Tablet-Sidebar/Mobile-Leiste/Mobile-
      // Sheet), nur per CSS ein-/ausgeblendet — ein einfaches querySelector()
      // nimmt blind das ERSTE DOM-Match, das je nach Viewport zufällig ein
      // unsichtbares (0×0-Rect) Duplikat sein kann. Deshalb: alle Matches
      // holen, das erste mit echter Fläche nehmen. WICHTIG: "hat eine Fläche"
      // heißt NICHT "ist gerade sichtbar" — die Sidebar-Nav hat mehr Einträge
      // als Höhe (eigenes overflow-y-auto) und scrollt intern; ein Ziel weiter
      // unten in der Liste hat trotzdem ein reales getBoundingClientRect()
      // ("wo es wäre, ungeclippt"), auch wenn es gerade aus dem sichtbaren
      // Scroll-Fenster heraus gescrollt ist — genau das führte live zu einem
      // Ring, der geometrisch korrekt, aber visuell auf der falschen Stelle
      // (der darunterliegenden User-Karte) landete. Deshalb: gefundenes Ziel
      // einmal explizit in den sichtbaren Bereich scrollen, bevor gemessen wird.
      const candidates = document.querySelectorAll(targetSelector);
      let foundEl: Element | null = null;
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { foundEl = el; break; }
      }
      if (foundEl && !scrolledIntoView) {
        scrolledIntoView = true;
        foundEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      setRect(foundEl ? foundEl.getBoundingClientRect() : null);
      rafId = requestAnimationFrame(measure);
    };
    rafId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(rafId);
  }, [targetSelector]);

  const card = (
    <div
      ref={cardRef}
      className="rounded-[24px] shadow-3d-deep overflow-y-auto max-h-[80vh] animate-in fade-in zoom-in-95 duration-200"
      style={rect ? { ...cardPositionStyle(rect, cardHeight), background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }
        : { position: 'relative', width: CARD_WIDTH, background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
    >
      <div className="p-6 pb-0">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: 'var(--primary)' }}>
            {t('onboarding.tour.stepLabel', { n: stepIndex + 1, total: totalSteps })}
          </p>
          {isPrimaryRecommendation && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              ⭐ {t('onboarding.tour.primaryBadge')}
            </span>
          )}
        </div>
        <h2 className="text-base font-black tracking-tight mb-2" style={{ color: 'var(--text-main)' }}>{title}</h2>
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400 mb-3">{body}</p>
        {previewPanel && (
          <div className="mt-3">
            {badgeLabel && (
              <p className="text-[9px] font-black uppercase tracking-widest mb-2 opacity-60" style={{ color: 'var(--text-main)' }}>
                {badgeLabel}
              </p>
            )}
            {previewPanel}
          </div>
        )}
      </div>
      {/* sticky statt eines vom Scroll-Bereich getrennten shrink-0-Footers: bleibt
          spec-garantiert am unteren Rand des SICHTBAREN Scroll-Ausschnitts, egal
          wie hoch der Inhalt oben ist — der Button ist dadurch immer per Scrollen
          erreichbar, selbst falls die top-Positionierung oben (cardPositionStyle)
          durch einen bisher unbekannten Fall doch daneben liegen sollte. */}
      <div className="sticky bottom-0 px-6 pt-4 pb-6 space-y-2.5" style={{ background: 'var(--bg-sidebar)' }}>
        <button
          type="button"
          onClick={onNext}
          className="w-full py-2.5 rounded-[14px] text-[11px] font-black uppercase tracking-widest shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          {ctaLabel}
        </button>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            disabled={!onBack}
            className="py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-0"
          >
            ← {t('common.back')}
          </button>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              {t('onboarding.skip')}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (!rect) {
    return (
      <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/70 backdrop-blur-[2px] p-4">
        {card}
      </div>
    );
  }

  const top = rect.top - TARGET_PAD;
  const left = rect.left - TARGET_PAD;
  const width = rect.width + TARGET_PAD * 2;
  const height = rect.height + TARGET_PAD * 2;

  return (
    <div className="fixed inset-0 z-[95]" style={{ pointerEvents: 'none' }}>
      <div className="fixed bg-black/60" style={{ pointerEvents: 'auto', top: 0, left: 0, right: 0, height: Math.max(0, top) }} />
      <div className="fixed bg-black/60" style={{ pointerEvents: 'auto', top: Math.max(0, top), left: 0, width: Math.max(0, left), height }} />
      <div className="fixed bg-black/60" style={{ pointerEvents: 'auto', top: Math.max(0, top), left: left + width, right: 0, height }} />
      <div className="fixed bg-black/60" style={{ pointerEvents: 'auto', top: top + height, left: 0, right: 0, bottom: 0 }} />
      <div
        className="fixed rounded-2xl"
        style={{ top, left, width, height, boxShadow: '0 0 0 3px var(--primary), 0 0 24px rgba(0,0,0,0.35)' }}
      />
      <div style={{ pointerEvents: 'auto' }}>{card}</div>
    </div>
  );
};
