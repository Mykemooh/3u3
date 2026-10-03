# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Homeowners in Katy & the greater Houston area** booking residential cleaning (standard, deep, move-in/move-out). They request a free in-person walkthrough, get priced at the door by a real person (never a form-generated estimate), then book, pay, and manage recurring service from an account.
- **Crew members (cleaners, team leads)** who work jobs in the field: navigate to the home, follow a per-visit checklist, log before/after and add-on photos, track supplies, and get paid via a per-job/hourly/percentage model with tip splitting — often with unreliable signal in a client's home, so the crew app must work offline and sync on reconnect.
- **Admin / office staff** (the founders and, as the business grows, office hires) who manage scheduling, payroll runs, invoicing/autopay, service-area radius, reviews, and the pay-model configuration crews operate under.

## Product Purpose

3U3 Cleaning is a residential cleaning service and the operational software that runs it: quoting, booking, in-home service delivery, crew logistics and pay, payments/invoicing, and customer trust-building (reviews), all under one roof for a single cleaning company. Success is a homeowner getting their time back without having to think about scheduling, pricing, or trusting a stranger in their home — and a crew that gets paid fairly and simply for exactly the work the system shows they did.

## Positioning

The name is the mechanism: **"Three cleaners. Under three hours."** — a crew of three works a home together (kitchen / bathrooms / floors+bedrooms) and most homes are done inside three hours, so a homeowner gets a day back, not just a clean house. Paired with **price-at-the-door, never a guessed online quote** — a real person walks the home and prices it on the spot, with the honest caveat that a first deep clean, empty move-out, or larger home can run longer, said before booking, not discovered after.

Family-owned (not a franchise or a route-based service): the founders (Betty & Mike) and their family's name are on every job. The business explicitly commits to only making claims it can already stand behind — no "insured and bonded," no customer counts, no manufactured testimonials — until verifiably true.

## Operating Context

- Customers interact primarily on the marketing site and account dashboard; quoting happens via an in-person walkthrough, not a self-serve calculator.
- Crew members work from a mobile-first PWA in homes with unreliable connectivity: in-app turn-by-turn navigation (no external maps hand-off), photo capture with timestamps, checklists, and an offline action queue that syncs when back online.
- Admin operates from a dashboard: payroll configuration (per-job / hourly / percentage pay basis, tip split method), weekly/bi-weekly/monthly payroll export, service-area radius, Stripe billing (card-on-file, autopay on completion, monthly batching for recurring accounts, branded invoices/receipts), and review moderation.
- Service area is Katy, TX and the surrounding Houston metro.

## Capabilities and Constraints

- Stack: Next.js (App Router) + Drizzle ORM/Postgres, NextAuth, Tailwind, Stripe (Payment Element, Invoices), Vercel Blob, Mapbox (geocoding/directions/nav).
- Roles: `CUSTOMER`, `CLEANER` (with `TEAM_LEAD` / `CLEANER` / `JR_CLEANER` sub-roles), `ADMIN`, `SUPER_ADMIN`.
- The schema has latent multi-tenant plumbing (`tenants.isPlatform`, `SUPER_ADMIN`) for a possible future parent product ("TrashCan") that would let other cleaning businesses run on this stack — but that platform/super-admin layer is explicitly **out of scope for 3U3 product work** right now and is being designed separately. 3U3 itself is built and positioned as a single cleaning company's product, not a multi-tenant SaaS pitch, until that decision changes.
- Legal/compliance constraints that shape the product, not just the code: tips are taxable wages (IRS Topic 761), not gifts — payroll logic must treat them as such; geocoded coordinates are never persisted beyond a single trip's cache, per Mapbox's free-tier ToS.
- No service pricing is ever published on the public site — pricing is confirmed in person by design, not a placeholder gap.

## Brand Commitments

- Name: **3U3 Cleaning**. Wordmark/logo assets exist (light and dark variants) and are binding — not to be redrawn.
- Founders: Betty & Mike, parents of three boys, moved from Canada to Texas.
- Tagline family: "Clean spaces. Brighter days." / "More time for life."
- Three Pillars (stated company values, each written as a checkable promise rather than an adjective): **Faith** ("price at your door instead of guessing from a form," "we don't take a cent before we've earned it"), **Family** ("nobody joins this crew we wouldn't hand our own front-door key to"), **Future** ("a business our boys could take over one day").
- Voice: warm, plain-spoken, promise-driven, allergic to vague marketing claims — copy favors specific, checkable statements ("The baseboard nobody checks") over adjectives.
- Current visual system: a premium consumer-tech palette established today (green-led token system, Inter typeface) — treat as the confirmed, binding palette unless the user changes it.

## Evidence on Hand

- Full founder story and three-pillars copy: `lib/about.ts`.
- Service copy (Standard, Deep, Move-In/Move-Out; Airbnb withdrawn but preserved in schema): `lib/services.ts`.
- Real hero photography in `public/images/`; logo marks in `public/brand/`.
- No testimonials/review counts/customer figures exist yet beyond what real customers submit through the in-product review flow — none should be fabricated.

## Product Principles

1. Trust is earned by specificity, not adjectives — every claim on the product must be one the business can already stand behind.
2. Price is a conversation at the door, never a number printed or guessed online.
3. The crew's tools (offline-first app, fair/configurable pay, supply reporting) are as much the product as the customer-facing site — a cleaning company that treats its crew well is the actual differentiator behind the trust claims.
4. The 3U3 product and the future multi-tenant/SaaS platform layer (TrashCan) are deliberately kept separate; do not let platform/SUPER_ADMIN concerns leak into 3U3-facing design.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established beyond standard web accessibility practice.
