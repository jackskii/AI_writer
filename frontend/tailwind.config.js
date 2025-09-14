/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0a0a0a',
        'dark-surface': '#1a1a1a',
        'dark-border': '#333333',
        'dark-text': '#e0e0e0',
        'dark-text-muted': '#a0a0a0',
        'dark-primary': '#3b82f6',
        'dark-secondary': '#64748b',
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