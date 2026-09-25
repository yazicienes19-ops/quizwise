const plugin = require('tailwindcss/plugin');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './config/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        indigo: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // 50-300 kommen aus app.css (--slate-*): warm im Tagmodus, unverändert im Nachtmodus.
        slate: {
          50: 'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: '#8FA3C4',
          500: '#607494',
          600: '#475C7A',
          700: '#2E4060',
          800: '#1A2D4F',
          900: '#0F1E3A',
          950: '#080F20',
        },
      },
      boxShadow: {
        // Ruhiger Stil (Audit 23.09.2026): leise Schatten statt schwebender Karten.
        '3d-raised': '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px -6px rgba(0, 0, 0, 0.08)',
        '3d-pressed': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        '3d-deep': '0 1px 3px rgba(0, 0, 0, 0.05), 0 12px 28px -14px rgba(0, 0, 0, 0.14)',
      },
    },
  },
  plugins: [
    plugin(function ({ addVariant }) {
      addVariant('hover', '@media (hover: hover) and (pointer: fine) { &:hover }');
    }),
  ],
};
