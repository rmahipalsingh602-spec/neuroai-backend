/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#3b82f6', // blue-500
          DEFAULT: '#2563eb', // blue-600
          dark: '#1d4ed8', // blue-700
        },
        charcoal: {
          light: '#525252', // neutral-600
          DEFAULT: '#262626', // neutral-800
          dark: '#171717', // neutral-900
        },
      }
    },
  },
  plugins: [],
}
