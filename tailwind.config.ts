import type { Config } from 'tailwindcss';

/**
 * Two brands, one component library.
 *
 * ---------------------------------------------------------------------------
 * The semantic tokens (gold, ink, slate, muted, line, surface, bronze,
 * green, cream, charcoal) no longer hold hex values directly. Each one reads
 * a CSS variable holding an "R G B" triplet, defined in app/globals.css:
 *
 *   :root        — the company brand. Today that is 3U3 Cleaning's own
 *                  brand book (deep navy #041730, vivid blue #016AEE,
 *                  aqua/teal #18AA9D, fresh green #2DBD91). Client portals,
 *                  the crew app and a company's public site live here.
 *   .theme-tc    — TrashCan, the platform (docs/brand/trashcan-guidelines.md):
 *                  #0B0F14 black, #B8FF00 lime, a neutral grey ramp. The
 *                  marketing site, signup, the owner's workspace (/admin),
 *                  billing and the platform console live here.
 *
 * Because every existing component already says `bg-gold`, `text-ink`,
 * `border-line` and so on, wrapping a surface in `.theme-tc` re-skins all of
 * it with no per-component edits — and opacity modifiers (`bg-gold/10`)
 * keep working because the variables hold bare channels.
 *
 * `tc.*` are the TrashCan brand's literal colours for the few places that
 * must be exactly that colour regardless of scope: the lime action layer,
 * the dark rail, the logo.
 * ---------------------------------------------------------------------------
 */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: v('gold'), // primary action
          light: v('gold-light'), // primary action, second stop
        },
        ink: v('ink'), // headings, dark bands
        'ink-soft': v('ink-soft'), // dark-section hover states
        slate: v('slate'), // body copy
        muted: v('muted'), // meta, timestamps
        line: v('line'), // borders, dividers
        surface: v('surface'), // section fills
        bronze: v('bronze'), // links and hover text on white
        green: {
          DEFAULT: v('green'), // accent text / icons
          light: v('green-light'), // accent tint
        },
        cream: v('cream'),
        charcoal: v('charcoal'),
        tc: {
          black: '#0B0F14',
          'black-2': '#141A22', // one step up, for raised dark surfaces
          'black-3': '#1E2630', // hover on dark
          lime: '#B8FF00',
          'lime-hover': '#C8FF33',
          'lime-ink': '#3F6212', // lime's hue, dark enough for text on white
          'lime-wash': '#F4FFD9', // pale lime surface for recommendations
          white: '#FFFFFF',
          900: '#111827',
          700: '#374151',
          500: '#6B7280',
          300: '#D1D5DB',
          200: '#E5E7EB',
          100: '#F3F4F6',
          50: '#F8F9FA',
          blue: '#3882F6',
          green: '#10B981',
          amber: '#F59E0B',
          red: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        'tc-display': ['var(--font-tc-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'tc-sm': '8px',
        'tc-md': '12px',
        'tc-lg': '16px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-lg': 'var(--shadow-card-lg)',
        gold: 'var(--shadow-gold)',
        'gold-lg': 'var(--shadow-gold-lg)',
        tc: '0 10px 30px rgba(11,15,20,.08)',
        'tc-lg': '0 24px 60px -12px rgba(11,15,20,.18)',
        'tc-ring': '0 0 0 1px rgba(11,15,20,.06), 0 1px 2px rgba(11,15,20,.04)',
      },
      transitionTimingFunction: {
        'tc-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'tc-rise': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'tc-rise': 'tc-rise 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
