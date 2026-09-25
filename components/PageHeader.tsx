import React from 'react';

/**
 * Gemeinsame Kopfzeile der Hauptbereiche, im ruhigen Stil von Heute, Tutor und
 * Feynman: kleine goldene Oberzeile, eine leichte Überschrift als Satz, darunter
 * eine Zeile Erklärung. Ersetzt die alten Kopfzeilen mit schwarzer 60-px-Schrift,
 * Farbakzent und Emoji-Symbol (Audit 23.09.2026: zwei Designgenerationen, auf
 * dem Handy füllte die Überschrift den ersten Bildschirm).
 *
 * Standard ist linksbündig wie Heute (Design-Tour 25.09.2026: eine Kopfzeile
 * für alle Seiten), Aktionen stehen rechts daneben. align="center" bleibt nur
 * für Sonderfälle ohne Seitenkontext.
 */
interface PageHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'center' | 'left';
  /** Knöpfe rechts neben (left) bzw. unter (center) der Überschrift. */
  actions?: React.ReactNode;
  /** Zusätzlicher Inhalt unter der Unterzeile, z. B. ein Fach-Filter. */
  children?: React.ReactNode;
}

const EYEBROW_COLOR = 'color-mix(in srgb, var(--primary) 70%, var(--ink))';

export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, subtitle, align = 'left', actions, children }) => {
  const centered = align === 'center';
  // Linksbündig: Text braucht Platz für die Überschrift in einer Zeile; reicht
  // er neben den Aktionen nicht, rutschen die Aktionen darunter (flex-wrap).
  const text = (
    <div className={`space-y-2 min-w-0 ${centered ? 'text-center' : 'flex-1 basis-[min(100%,34rem)]'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: EYEBROW_COLOR }}>{eyebrow}</p>
      <h1 className="text-[26px] sm:text-3xl lg:text-[40px] font-normal leading-tight [text-wrap:balance]" style={{ color: 'var(--ink)' }}>
        {title}
      </h1>
      {subtitle && (
        <p className={`text-sm lg:text-base ${centered ? 'max-w-xl mx-auto' : 'max-w-2xl'}`} style={{ color: 'var(--text-secondary)' }}>
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );

  if (centered) {
    return (
      <header className="space-y-4">
        {text}
        {actions && <div className="flex flex-wrap justify-center gap-2.5">{actions}</div>}
      </header>
    );
  }
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      {text}
      {actions && <div className="flex flex-wrap gap-2.5 shrink-0">{actions}</div>}
    </header>
  );
};
