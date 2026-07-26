import React, { useEffect, useState } from 'react';

interface CountUpProps {
  value: number;
  from?: number;
  duration?: number;
  decimals?: number;
  format?: (n: number) => string;
  /** Exakter Endtext (z.B. lokalisiert formatiert) — überschreibt das
   *  gerundete Zwischenergebnis, sobald die Animation fertig ist, damit
   *  keine Rundungsdifferenz zum echten Wert sichtbar wird. */
  finalText?: string;
  className?: string;
}

/** Zählt eine Zahl von `from` auf `value` hoch statt sie sofort anzuzeigen. */
export const CountUp: React.FC<CountUpProps> = ({ value, from = 0, duration = 700, decimals = 0, format, finalText, className }) => {
  const [display, setDisplay] = useState(from);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDone(false);
    let raf = 0;
    let start: number | null = null;
    const startValue = display;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(startValue + (value - startValue) * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
      else setDone(true);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  if (done && finalText !== undefined) return <span className={className}>{finalText}</span>;
  return <span className={className}>{format ? format(display) : display.toFixed(decimals)}</span>;
};
