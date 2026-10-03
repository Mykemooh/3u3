import type { Config } from 'tailwindcss';

/**
 * Text colours are real values, not opacity steps on ink.
 *
 * The previous palette leaned on ink/40, ink/50 and ink/25 for most secondary
 * copy. Measured against white those come out at 2.5:1, 3.4:1 and 1.7:1 —
 * all below the 4.5:1 needed for body text, which is why the whole interface
 * looked faded. `slate` and `muted` below are picked to clear that bar.
 *
 * ---------------------------------------------------------------------------
 * 2026 rebrand #2: premium consumer-tech (Apple/Linear/Stripe-inspired) —
 * warm near-black ink, warm neutrals, and a single green accent, replacing
 * the navy/blue/green theme before it. Token *names* are kept as-is again,
 * same reasoning as last time: every component already references
 * `bg-gold`/`text-bronze`/`bg-ink`/etc., so recoloring here is what makes
 * this apply everywhere without a repo-wide rename. `gold` now holds the
 * one brand green (there is no literal gold or blue left anywhere) for
 * every primary button, focus ring and accent; `bronze` is the same green
 * deepened for AA text contrast (links, labels) the same way it held a
 * deepened blue before.
 * ---------------------------------------------------------------------------
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          // The one brand accent — every primary button, focus ring, selected control.
          DEFAULT: '#1E8E55',
          light: '#34A871',
        },
        ink: '#101418',        // headings, dark bands — warm near-black, not navy
        'ink-soft': '#252A2F', // one step lighter than ink — dark-section hover states
        slate: '#252A2F',      // body copy         — ~15:1
        muted: '#68706B',      // meta, timestamps  —  ~4.8:1
        line: '#D9DBD7',       // borders, dividers — decorative only
        surface: '#F1F1ED',    // section fills — warm neutral, not a colour tint
        bronze: '#176B42',     // links on white    —  ~6:1
        green: {
          // Same hue as `gold`, used where the codebase wants "the brand
          // green" as its own concept (status pills) rather than "the
          // primary action colour" — DEFAULT matches gold.DEFAULT on
          // purpose; `light` is a paler tint for soft fills/backgrounds.
          DEFAULT: '#1E8E55',
          light: '#EAF5EE',
        },
        cream: '#F7F7F4',      // warm white — actually cream now, not a pale blue tint
        charcoal: '#252A2F',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 30px rgba(16,20,24,0.06)',
        'card-lg': '0 16px 50px rgba(16,20,24,0.09)',
        gold: '0 2px 6px rgba(30,142,85,0.24), 0 10px 24px -10px rgba(30,142,85,0.45)',
        'gold-lg': '0 4px 10px rgba(30,142,85,0.28), 0 16px 32px -12px rgba(30,142,85,0.5)',
      },
    },
  },
  plugins: [],
};

export default config;
