/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        card: '#0A0A0A',
        border: '#1A1A1A',
        primary: '#FFFFFF',
        muted: '#A1A1AA',
        sub: '#71717A',
        brand: '#C8102E',
        'brand-hover': '#E53030',
        'btn-border': '#27272A',
        'btn-hover': '#1A1A1A',
      },
      fontFamily: {
        display: ['"Archivo Black"', 'sans-serif'],
        body: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"Space Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
