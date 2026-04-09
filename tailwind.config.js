/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { mono: ['JetBrains Mono', 'Fira Code', 'monospace'] },
      colors: {
        surface: { 900: '#0b1120', 800: '#0f172a', 700: '#1e293b', 600: '#334155' },
        gold: { 400: '#fbbf24', 300: '#fcd34d', 200: '#fde68a' }
      }
    }
  },
  plugins: []
}
