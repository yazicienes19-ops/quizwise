import React from 'react';

interface SkeletonProps {
  className?: string;
}

/** Content-shaped Ladeplatzhalter (statt generischem Spinner) für Listen/Karten
 *  mit bekannter, vorhersehbarer Form — z.B. eine Dokumentenliste, die aus dem
 *  Netzwerk nachlädt. NICHT geeignet für unbestimmte KI-/Backend-Wartezeiten
 *  (Kartengenerierung, Dokument-Digest) — dort bleibt ein Spinner die richtige
 *  Wahl, weil dort keine bekannte Zielform existiert, die vorab gezeichnet
 *  werden könnte. */
export const Skeleton: React.FC<SkeletonProps> = ({ className }) => (
  <div className={`animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800 ${className ?? ''}`} />
);
