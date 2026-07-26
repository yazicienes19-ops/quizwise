import React from 'react';

interface BrandMarkProps {
  size?: number;
  strokeColor?: string;
  peakColor?: string;
  className?: string;
}

/**
 * "Redemption Arc" — Marke aus dem Logo-Handoff: eine Linie startet ruhig,
 * fällt auf einen Tiefpunkt, schwingt dann über die Ausgangshöhe hinaus zu
 * einem 5-Zack-Stern (Kampf → Wachstum). Baseline-Strich verankert den Start.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 40,
  strokeColor = '#1B2A4A',
  peakColor = '#A9772C',
  className,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
    <line x1={10} y1={88} x2={30} y2={88} stroke={strokeColor} strokeWidth={5} strokeLinecap="round" opacity={0.35} />
    <path
      d="M 16 42 C 34 46, 44 62, 46 76 C 48 88, 58 88, 62 74 C 67 55, 76 24, 92 14"
      stroke={strokeColor}
      strokeWidth={8.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <circle cx={16} cy={42} r={4.5} fill={strokeColor} opacity={0.35} />
    <polygon
      points="92.00,5.00 94.22,10.94 100.56,11.22 95.59,15.17 97.29,21.28 92.00,17.78 86.71,21.28 88.41,15.17 83.44,11.22 89.78,10.94"
      fill={peakColor}
    />
  </svg>
);
