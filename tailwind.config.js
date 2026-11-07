/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#F1F5FA',
          100: '#E2EAF4',
          200: '#C5D4E8',
          300: '#97B0D1',
          400: '#5F82B3',
          500: '#3D6494',
          600: '#2B4D78',
          700: '#1F3A5F',
          800: '#132A47',
          900: '#0B1B33',
          950: '#071324',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 27, 51, 0.04), 0 8px 24px -12px rgba(11, 27, 51, 0.12)',
        lift: '0 4px 12px rgba(11, 27, 51, 0.08), 0 24px 48px -16px rgba(11, 27, 51, 0.2)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'slide-in': 'slide-in 0.3s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
