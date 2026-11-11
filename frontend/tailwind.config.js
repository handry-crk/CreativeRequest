/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        brand: { DEFAULT: '#D7191F', deep: '#B32E26', sun: '#F5B800', orange: '#F2A541', cream: '#FFF4E0', tint: '#F7D4D5', green: '#2E7D4F', amber: '#C98A1B', char: '#1F1A1A' },
      },
      fontFamily: {
        display: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        pop: '4px 4px 0 rgb(var(--ink))',
        'pop-sm': '2px 2px 0 rgb(var(--ink))',
        'pop-lg': '8px 8px 0 rgb(var(--ink))',
      },
    },
  },
  plugins: [],
}
