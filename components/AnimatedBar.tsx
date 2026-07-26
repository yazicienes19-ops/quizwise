import React, { useEffect, useState } from 'react';

interface AnimatedBarProps {
  percent: number;
  className?: string;
  style?: React.CSSProperties;
  duration?: number;
}

/** Balken-Füllung, die von 0 auf den Zielwert hochwächst statt sofort in voller
 *  Breite zu erscheinen. Drop-in-Ersatz für `<div style={{ width: '${n}%' }} />`. */
export const AnimatedBar: React.FC<AnimatedBarProps> = ({ percent, className, style, duration = 700 }) => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // Doppeltes rAF: der Browser muss den 0%-Zustand sicher zeichnen, bevor
    // die CSS-Transition zum Zielwert startet — sonst wird der erste Frame
    // manchmal übersprungen und der Balken erscheint sofort in voller Breite.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setWidth(percent));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [percent]);

  return (
    <div
      className={className}
      style={{ ...style, width: `${width}%`, transition: `width ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)` }}
    />
  );
};
