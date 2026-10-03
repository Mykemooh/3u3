import type { Config } from 'tailwindcss';

/**
 * Text colours are real values, not opacity steps on ink.
 *
 * ---------------------------------------------------------------------------
 * 2026 rebrand #3: the actual 3U3 brand book (navy/blue/teal/green), from
 * the company's own brand board — #041730 deep navy, #016AEE vivid blue,
 * #18AA9D aqua/teal, #2DBD91 fresh green, #F7F9FB near-white, and a
 * signature #016AEE → #2DBD91 gradient for the primary CTA. This replaces
 * rebrand #2's invented single-green palette, which had drifted away from
 * the real brand — the logo asset (public/brand/logo-*-mark.png) kept its
 * navy numerals and blue-to-green gradient U the whole time; this just
 * brings the rest of the tokens back to match it.
 *
 * Token *names* are kept as-is again, same reasoning as every previous
 * pass: every component already references `bg-gold`/`text-bronze`/
 * `bg-ink`/etc., so recoloring here is what makes this apply everywhere
 * without a repo-wide rename. `gold` is now the brand's vivid blue (the
 * gradient's start); `gold.light` is the fresh green (the gradient's end),
 * so `.btn-primary`'s gradient in globals.css reads directly off
 * `gold.DEFAULT → gold.light`. `green` is now the distinct aqua/teal accent
 * (nav underline, status pills) the brand book keeps separate from blue.
 * `bronze` still holds the AA-safe darkened variant of `gold` for links/
 * hover text, just darkened blue instead of darkened green now.
 * ---------------------------------------------------------------------------
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          // The signature gradient's two ends — every primary button, focus
          // ring and accent reads off these two.
          DEFAULT: '#016AEE', // vivid blue
          light: '#2DBD91',   // fresh green
        },
        ink: '#041730',        // headings, dark bands — deep navy
        'ink-soft': '#0F2A42', // one step lighter than ink — dark-section hover states
        slate: '#1C3447',      // body copy         — dark navy-grey, ~14:1
        muted: '#5B7085',      // meta, timestamps  — navy-grey, ~4.7:1
        line: '#DCE3E9',       // borders, dividers — cool, not warm
        surface: '#F1F5F8',    // section fills — cool neutral tint
        bronze: '#0157C4',     // links on white    — darkened vivid blue, ~5.8:1
        green: {
          // The brand book's distinct aqua/teal accent — a genuinely
          // different hue from `gold` now, not the same hue reused.
          DEFAULT: '#18AA9D',
          light: '#E3F5F3',
        },
        cream: '#F7F9FB',      // the brand book's "Near White" — exact match
        charcoal: '#1C3447',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 30px rgba(4,23,48,0.06)',
        'card-lg': '0 16px 50px rgba(4,23,48,0.09)',
        gold: '0 2px 6px rgba(1,106,238,0.22), 0 10px 24px -10px rgba(45,189,145,0.45)',
        'gold-lg': '0 4px 10px rgba(1,106,238,0.26), 0 16px 32px -12px rgba(45,189,145,0.5)',
      },
    },
  },
  plugins: [],
};

export default config;
