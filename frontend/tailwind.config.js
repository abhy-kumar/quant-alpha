/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-app)',
        card: 'var(--bg-card)',
        border: 'var(--border-color)',
        primary: 'var(--text-main)',
        muted: 'var(--text-muted)',
        sub: 'var(--text-sub)',
        brand: 'var(--brand-red)',
        'brand-hover': 'var(--brand-red-hover)',
        'btn-border': 'var(--btn-border)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
