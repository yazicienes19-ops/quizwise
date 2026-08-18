import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../../i18n/I18nProvider';

/**
 * Gemeinsame Modal-Hülle für alle Onboarding-Screens — Fortschritts-Pillen +
 * Content-Slot + Footer (primäre CTA, Zurück, Überspringen). Übernimmt exakt
 * das visuelle Muster des bisherigen components/Onboarding.tsx (rounded-[32px]-
 * Karte, animate-in-Übergang, CSS-var-Farben), keine neue visuelle Sprache.
 */
interface OnboardingCardProps {
  stepIndex: number;
  totalSteps: number;
  /** Klick auf eine bereits besuchte Pille springt direkt dorthin (wie im bisherigen Onboarding). */
  onPillClick?: (index: number) => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** undefined = Zurück-Button ausgeblendet (erster Screen). */
  onBack?: () => void;
  /** undefined = kein Überspringen-Button auf diesem Screen. */
  onSkip?: () => void;
  /** Fehlt = Standardtext "Überspringen" (onboarding.skip). */
  skipLabel?: string;
  children: React.ReactNode;
}

export const OnboardingCard: React.FC<OnboardingCardProps> = ({
  stepIndex, totalSteps, onPillClick, primaryLabel, onPrimary, primaryDisabled, onBack, onSkip, skipLabel, children,
}) => {
  const { t } = useTranslation();

  // Richtungsbewusster Content-Wechsel: vorwärts rutscht von rechts, zurück
  // von links ein — nur der Inhalt bekommt einen neuen Key (per stepIndex),
  // die Kartenhülle selbst bleibt gemountet (s. OnboardingFlow-Kommentar) und
  // spielt ihre eigene animate-in also nur einmal beim Öffnen ab.
  const prevIndexRef = useRef(stepIndex);
  const direction = stepIndex >= prevIndexRef.current ? 'right' : 'left';
  useEffect(() => { prevIndexRef.current = stepIndex; }, [stepIndex]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 backdrop-blur-[2px] p-4">
      <div
        className="w-full max-w-xl rounded-[32px] shadow-3d-deep overflow-y-auto animate-in fade-in zoom-in-95 duration-300 max-h-[90vh]"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        {/* Fortschritt: Pillen + Zahl kombiniert (User-Feedback "Fortschrittsanzeige
            zu unscheinbar") — etwas kräftigere Pillen, plus eine sichtbare "3 / 8"-Zahl.
            sticky top-0 statt shrink-0 in einem separaten Flex-Kind: bleibt jetzt Teil
            desselben Scroll-Containers wie Inhalt + Footer (s. Kommentar beim Footer
            unten zum "echten CTA-Bug", PRIORITÄT 1 der Onboarding-Überarbeitung). */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-6 sm:px-8 pt-6 pb-3" style={{ background: 'var(--bg-sidebar)' }}>
          <div className="flex gap-1.5 grow">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={t('onboarding.step', { n: i + 1, total: totalSteps })}
                onClick={() => i < stepIndex && onPillClick?.(i)}
                className="h-1.5 flex-1 rounded-full transition-all duration-300"
                style={{
                  background: i <= stepIndex ? 'var(--primary)' : 'var(--border-color)',
                  opacity: i <= stepIndex ? 1 : 0.5,
                  cursor: i < stepIndex && onPillClick ? 'pointer' : 'default',
                }}
              />
            ))}
          </div>
          <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {stepIndex + 1} / {totalSteps}
          </span>
        </div>

        {/* PRIORITÄT-1-Fix (echter CTA-Bug, per Playwright/WebKit bei kurzen
            Fensterhöhen reproduziert): früher war dieser Bereich ein eigenes
            Flex-Kind mit overflow-y-auto/min-h-0, der Footer SEPARAT daneben
            mit shrink-0 — bei viel Inhalt + kurzem Viewport blieb der Footer
            zwar an Ort und Stelle, aber der Inhalt wurde hart (ohne Scroll-
            Hinweis) abgeschnitten, und in TourSpotlight.tsx (gleiches Muster)
            geriet der Footer dadurch bei einer zusätzlichen Höhen-Fehlannahme
            sogar komplett außerhalb des Viewports. Jetzt scrollt die GANZE
            Karte (s. `overflow-y-auto` oben auf dem Karten-Root) als ein
            einziger Container, und der Footer ist `sticky bottom-0` INNERHALB
            davon (s. unten) — dadurch bleibt er über Scrollen spec-garantiert
            immer erreichbar, unabhängig von jeder Höhen-Berechnung. */}
        <div className="p-6 sm:p-10 pt-3">
          {/* Tailwind läuft hier über den Build (kein CDN-Runtime-Scan) — eine per
              Template-String zusammengesetzte Klasse wie `slide-in-from-${direction}-4`
              würde vom JIT-Compiler nie erzeugt werden. Deshalb zwei vollständige,
              statische Klassennamen per Ternary statt Interpolation.
              WICHTIG: dieses Projekt hat KEIN echtes tailwindcss-animate-Plugin,
              sondern ein schlankes handgeschriebenes Äquivalent in app.css
              (Suche "Entrance animation system") — nur die dort explizit definierten
              Klassen wirken. slide-in-from-right-3/left-3 + duration-250 (frühere
              Fassung) existierten dort NICHT und liefen die ganze Zeit unbemerkt
              ins Leere (nur das mitkombinierte fade-in griff). slide-in-from-left-4
              wurde deshalb frisch nach demselben Muster in app.css ergänzt. */}
          <div
            key={stepIndex}
            className={direction === 'right'
              ? 'animate-in fade-in slide-in-from-right-4 duration-200'
              : 'animate-in fade-in slide-in-from-left-4 duration-200'}
          >
            {children}
          </div>
        </div>

        <div className="sticky bottom-0 px-6 sm:px-10 pt-4 pb-6 sm:pb-8 space-y-3" style={{ background: 'var(--bg-sidebar)' }}>
          {/* Etwas kompakter + weicherer Schatten statt reinem Vollfarb-Block bei
              jedem Zwischenschritt (User-Feedback "Weiter-Button teilweise zu
              dominant") — bleibt aber klar als primäre Aktion erkennbar. */}
          <button
            type="button"
            onClick={onPrimary}
            disabled={primaryDisabled}
            className="w-full py-3 rounded-[16px] text-[11px] font-black uppercase tracking-widest shadow-sm hover:shadow-md hover:scale-[1.015] active:scale-[0.98] transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {primaryLabel}
          </button>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              disabled={!onBack}
              className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-0"
            >
              ← {t('common.back')}
            </button>
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                {skipLabel ?? t('onboarding.skip')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
