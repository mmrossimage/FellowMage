/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cinzel"', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { 950: '#05070d', 900: '#0a0e18', 800: '#111726', 700: '#1a2236', 600: '#26304a' },
        arcane: { 300: '#9be7ff', 400: '#5fd3f5', 500: '#28b8e6', 600: '#168fbb' },
        ember: { 300: '#ffd18a', 400: '#ffb44d', 500: '#f59a1b' },
        blood: { 400: '#ff6b6b', 500: '#e63946' },
      },
      boxShadow: {
        playable: '0 0 0 2px rgba(95,211,245,.9), 0 0 18px 4px rgba(40,184,230,.55)',
        target: '0 0 0 2px rgba(255,180,77,.95), 0 0 20px 6px rgba(245,154,27,.6)',
        selected: '0 0 0 3px rgba(255,107,107,.95), 0 0 22px 6px rgba(230,57,70,.6)',
        panel: '0 10px 40px -10px rgba(0,0,0,.8)',
      },
    },
  },
  plugins: [],
};
