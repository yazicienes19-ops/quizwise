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
        slate: {
          50: '#F8FAFF',
          100: '#F1F5FF',
          200: '#E2E9F8',
          300: '#C8D5EE',
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
        '3d-raised': '0 10px 30px -5px rgba(0, 0, 0, 0.08), 0 4px 10px -2px rgba(0, 0, 0, 0.03), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
        '3d-pressed': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        '3d-deep': '0 30px 60px -12px rgba(0, 0, 0, 0.15), 0 18px 36px -18px rgba(0, 0, 0, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
      },
    },
  },
  plugins: [],
};
