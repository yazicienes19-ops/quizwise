import React from 'react';

interface BrandSpinnerProps {
  size?: number;
  strokeColor?: string;
  peakColor?: string;
  className?: string;
}

/** Lade-Indikator: zeichnet die "Redemption Arc"-Kurve in einer Schleife
 *  statt eines generischen Spinner-Kreises — Ersatz für Loader2 in Buttons. */
export const BrandSpinner: React.FC<BrandSpinnerProps> = ({
  size = 18,
  strokeColor = 'currentColor',
  peakColor = 'currentColor',
  className,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={`brand-spinner ${className ?? ''}`} aria-hidden="true">
    <path
      d="M 16 42 C 34 46, 44 62, 46 76 C 48 88, 58 88, 62 74 C 67 55, 76 24, 92 14"
      stroke={strokeColor}
      strokeWidth={10}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      style={{
        strokeDasharray: 160,
        strokeDashoffset: 160,
        animation: 'markDrawLoop 1.1s ease-in-out infinite',
      }}
    />
    <circle cx={92} cy={14} r={9} fill={peakColor} style={{ animation: 'markPeakPulse 1.1s ease-in-out infinite' }} />
  </svg>
);
