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
        brand: 'var(--brand)',
        'brand-hover': 'var(--brand-hover)',
        'brand-soft': 'var(--brand-soft)',
        'btn-border': 'var(--btn-border)',
        surface: 'var(--surface)',
      },
      boxShadow: {
        'card': '0 1px 3px var(--shadow), 0 0 0 0.5px var(--shadow)',
        'card-hover': '0 4px 16px var(--shadow-lg), 0 0 0 0.5px var(--shadow)',
      },
      keyframes: {
        progress: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'progress': 'progress 2s ease-in-out infinite alternate',
        'fade-in': 'fade-in 0.4s ease-out',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      borderRadius: {
        'card': '10px',
      },
    },
  },
  plugins: [],
}
