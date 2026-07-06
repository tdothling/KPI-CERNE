/** Espelha o config que antes vivia inline no index.html (Tailwind Play CDN). */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './utils.ts',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf2f4',
          100: '#fce7eb',
          200: '#f8d2db',
          300: '#f2aebf',
          400: '#e87e9b',
          500: '#d64d72',
          600: '#b02a50',
          700: '#8e1c3e',
          800: '#651830', // CERNE Main Color
          900: '#4a1526',
          950: '#2a0912',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
