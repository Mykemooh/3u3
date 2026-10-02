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
 * 2026 rebrand: navy / blue / green, replacing the original gold/dark-ink
 * theme. The token *names* below (gold, bronze, ink, cream, green) are kept
 * as-is on purpose — every component in the app references these names, so
 * recoloring them here is what makes the rebrand apply everywhere without
 * hunting down every `bg-gold`/`text-bronze`/`bg-ink` call site. `gold` now
 * holds the brand's blue (the "Reliability" swatch) since it's still the one
 * color used for every primary CTA; `green` holds the brand's actual green
 * ("Freshness") but deepened enough to clear 4.5:1 on white, since it's used
 * as real text in a few status pills, not just decoration.
 * ---------------------------------------------------------------------------
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          // The brand's "Reliability" blue — every primary button and accent.
          DEFAULT: '#2563EB',
          light: '#3B82F6',
        },
        ink: '#0B1F3B',        // headings, dark bands — the brand's "Trust" navy
        slate: '#454C57',      // body copy         —  8.9:1
        muted: '#6B727E',      // meta, timestamps  —  4.9:1
        line: '#E3E6EB',       // borders, dividers — decorative only
        surface: '#E8EEF5',    // section fills — the brand's "Cleanliness" swatch
        bronze: '#1D4ED8',     // links on white    —  6.3:1
        green: {
          // The brand's "Freshness" green, deepened for the ~5:1 contrast
          // text needs; `light` is the true brand green, for decoration only
          // (underlines, the gradient line on dark bands) where contrast
          // doesn't apply.
          DEFAULT: '#047857',
          light: '#10B981',
        },
        cream: '#EFF6FF',      // soft accent fills — was warm, now a pale blue tint
        charcoal: '#242220',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(22,24,27,0.04), 0 8px 24px -12px rgba(22,24,27,0.12)',
        'card-lg': '0 2px 4px rgba(22,24,27,0.04), 0 18px 40px -16px rgba(22,24,27,0.18)',
        gold: '0 2px 6px rgba(37,99,235,0.24), 0 10px 24px -10px rgba(37,99,235,0.45)',
        'gold-lg': '0 4px 10px rgba(37,99,235,0.28), 0 16px 32px -12px rgba(37,99,235,0.5)',
      },
    },
  },
  plugins: [],
};

export default config;
