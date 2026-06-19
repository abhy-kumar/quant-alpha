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
        bg: 'var(--bg-app)',
        card: 'var(--bg-card)',
        border: 'var(--border-color)',
        heading: 'var(--text-main)',
        muted: 'var(--text-muted)',
        sub: 'var(--text-sub)',
        brand: 'var(--brand)',
        'brand-hover': 'var(--brand-hover)',
        'brand-soft': 'var(--brand-soft)',
        'btn-border': 'var(--btn-border)',
        surface: 'var(--surface)',
        green: 'var(--green)',
        'green-soft': 'var(--green-soft)',
        red: 'var(--red)',
        'red-soft': 'var(--red-soft)',
        blue: 'var(--blue)',
        'blue-soft': 'var(--blue-soft)',
        amber: 'var(--amber)',
        'amber-soft': 'var(--amber-soft)',
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'card': 'var(--shadow)',
        'card-hover': 'var(--shadow-md)',
        'elevated': 'var(--shadow-lg)',
      },
      keyframes: {
        progress: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'progress': 'progress 2s ease-in-out infinite alternate',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        data: ['Space Mono', 'SF Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
