# TRASHCAN brand in the code

The full guide is `docs/brand/trashcan-brand-guidelines-v1.pdf`; the logo reference is `trashcan-logo-reference.jpeg`. This page says where each rule lives in the code.

## Two brands, one codebase

| Surface | Brand | How |
|---|---|---|
| TRASHCAN marketing site (`/trashcan`, or `/` on a `PLATFORM_HOSTS` domain), signup (`/start`), legal, status, platform sign-in | TRASHCAN | `components/tc/TcSite.tsx` (wraps `.theme-tc`) |
| The owner's workspace (`/admin/*`) and the platform console (`/platform/*`) | TRASHCAN frame, the company's name and logo in the rail | `components/admin/AdminShell.tsx`, `app/platform/layout.tsx` |
| The crew app (`/crew`) — the tool a company's team works in | TRASHCAN: black "right now" band, lime for the one primary action, the company's name beside the TRASHCAN mark | `components/app/AppShell.tsx` (crew branch, `.theme-tc`), `components/crew/CrewBand.tsx` |
| A company's public site, client portal (`/account`), booking, sign-in, invoices | The company: 3U3's brand book, or another company's own colours and logo, with "Powered by TrashCan" | `:root` tokens, re-pointed per company by `lib/brand.ts` |

The semantic tokens (`gold`, `ink`, `slate`, `muted`, `line`, `surface`, `bronze`, `green`, `cream`) are CSS variables (`app/globals.css`). `:root` holds the company brand; `.theme-tc` re-points them to TRASHCAN. Wrapping anything in `.theme-tc` re-skins it with no per-component edits. `tc-*` classes (`bg-tc-lime`, `text-tc-black`, …) are the literal TRASHCAN colours.

## Colour

`#0B0F14` black, `#B8FF00` lime, `#FFFFFF`, greys `#111827 / #374151 / #6B7280 / #D1D5DB / #F3F4F6`, semantic blue `#3882F6`, green `#10B981`, amber `#F59E0B`, red `#EF4444`. On light surfaces the primary action is black; lime is for the dark layer (rail, hero, CTA band), focus rings, the logo and highlights. Never lime text on white — use `tc-lime-ink` (`#3F6212`) where lime's hue is needed as text.

## Type

Display: Satoshi 700–800 per the guide. Satoshi is distributed by Fontshare, not npm or Google, so the build currently uses **Manrope** (self-hosted from `@fontsource-variable/manrope`) as the closest open geometric grotesk. To switch to Satoshi:

1. Download Satoshi from fontshare.com (free licence) and put `Satoshi-Variable.woff2` in `app/fonts/`.
2. In `app/layout.tsx`, point `tcDisplay`'s `src` at `./fonts/Satoshi-Variable.woff2` with `weight: '300 900'`.

Body/UI: Inter, self-hosted from `@fontsource-variable/inter`. Type scale classes: `.tc-display`, `.tc-h1`, `.tc-h2`, `.tc-h3`, `.tc-lead`.

## Logo

`components/tc/TcLogo.tsx`: `TcIcon` (32×32 grid, lime), `TcWordmark` (uppercase, the crossbar-less A), `TcLogo` (lockup; `on="light"` black wordmark, `on="dark"` white), `TcAppIcon`. Static files: `public/brand/trashcan/icon.svg`, `public/brand/trashcan/app-icon.svg`.

## Components

`.tc-btn-lime`, `.tc-btn-dark`, `.tc-btn-ghost`, `.tc-btn-ghost-dark` (+ `.tc-btn-sm`, `.tc-btn-lg`) — 12px radius, 44px minimum height, lift 1px on hover. `.tc-card`, `.tc-card-hover`, `.tc-input`, `.tc-label`, `.tc-status` (dot + label), `.tc-kbd`, `.tc-range`, `.tc-link`. Motion: 150–220ms ease-out (`ease-tc-out`), `animate-tc-rise` for things that appear; all of it off under reduced motion.

## Photography

Placeholders render from `lib/tc/images.ts`; each slot carries its brief (also in `docs/brand/trashcan-image-briefs.md`). Drop the photo in `public/images/trashcan/` and set `file` on the slot.
