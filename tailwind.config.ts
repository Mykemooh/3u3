import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#D2961E',
          light: '#E4B458',
        },
        ink: '#1A1A1A',
        bronze: '#8A6D1D',
        cream: '#FAEEDA',
        charcoal: '#242220',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 8px 30px -8px rgba(210, 150, 30, 0.45)',
      },
    },
  },
  plugins: [],
};

export default config;
