/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        sunstay: {
          navy: '#0D1B2A',
          amber: '#F59E0B',
          orange: '#F97316',
        },
      },
    },
  },
  plugins: [],
}
