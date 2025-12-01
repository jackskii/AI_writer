/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Theme-aware colors using CSS variables
        'dark-bg': 'var(--color-bg)',
        'dark-surface': 'var(--color-surface)',
        'dark-border': 'var(--color-border)',
        'dark-text': 'var(--color-text)',
        'dark-text-muted': 'var(--color-text-muted)',
        'dark-primary': 'var(--color-primary)',
        'dark-secondary': 'var(--color-secondary)',
      },
      fontFamily: {
        'chinese': ['Source Han Serif CN', 'serif'],
        'ui': ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}