import type { Config } from 'tailwindcss';

/**
 * Text colours are real values, not opacity steps on ink.
 *
 * The previous palette leaned on ink/40, ink/50 and ink/25 for most secondary
 * copy. Measured against white those come out at 2.5:1, 3.4:1 and 1.7:1 —
 * all below the 4.5:1 needed for body text, which is why the whole interface
 * looked faded. `slate` and `muted` below are picked to clear that bar.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#D2961E',
          light: '#E4B458',
        },
        ink: '#16181B',       // headings          — 16.6:1 on white
        slate: '#454C57',     // body copy         —  8.9:1
        muted: '#6B727E',     // meta, timestamps  —  4.9:1
        line: '#E3E6EB',      // borders, dividers — decorative only
        surface: '#F7F8FA',   // section fills
        bronze: '#8A6D1D',    // links on white    —  4.9:1
        green: {
          // The accent line. 5.2:1 on white, so it is safe as text as well
          // as decoration; `light` is for the same line on the ink bands.
          DEFAULT: '#0B7A55',
          light: '#4ADE80',
        },
        cream: '#FAEEDA',
        charcoal: '#242220',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(22,24,27,0.04), 0 8px 24px -12px rgba(22,24,27,0.12)',
        'card-lg': '0 2px 4px rgba(22,24,27,0.04), 0 18px 40px -16px rgba(22,24,27,0.18)',
        gold: '0 2px 6px rgba(210,150,30,0.24), 0 10px 24px -10px rgba(210,150,30,0.45)',
        'gold-lg': '0 4px 10px rgba(210,150,30,0.28), 0 16px 32px -12px rgba(210,150,30,0.5)',
      },
    },
  },
  plugins: [],
};

export default config;
