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

**Price-at-the-door, never a guessed online quote** — a real person walks the home and prices it on the spot, and says before booking (not after) when a first deep clean, empty move-out, or larger home will run longer. A crew works the home together and times each room, so visit lengths are quoted from real numbers rather than a slogan. The company makes **no fixed promise about crew size or hours per home** (the earlier "three cleaners, under three hours" line is retired).

Family-owned (not a franchise or a route-based service): the founders (Betty & Mike) and their family's name are on every job. The business explicitly commits to only making claims it can already stand behind — no "insured and bonded," no customer counts, no manufactured testimonials — until verifiably true.

## Platform direction

3U3 Cleaning is also the first customer of **TrashCan**, a multi-tenant SaaS for cleaning companies (self-serve signup, per-company portals, Stripe Connect payouts). "TrashCan" is the product name — it is not about deleting anything. Tex is the assistant on chat, text and phone (receptionist, client self-service and, for office staff, Muse the marketing helper). The product makes no fixed promise about crew size or hours.

## Operating Context

- Customers interact primarily on the marketing site and account dashboard; quoting happens via an in-person walkthrough, not a self-serve calculator.
- Crew members work from a mobile-first PWA in homes with unreliable connectivity: in-app turn-by-turn navigation (no external maps hand-off), photo capture with timestamps, checklists, and an offline action queue that syncs when back online.
- Admin operates from a dashboard: payroll configuration (per-job / hourly / percentage pay basis, tip split method), weekly/bi-weekly/monthly payroll export, service-area radius, Stripe billing (card-on-file, autopay on completion, monthly batching for recurring accounts, branded invoices/receipts), and review moderation.
- Service area is Katy, TX and the surrounding Houston metro.

## Capabilities and Constraints

- Stack: Next.js (App Router) + Drizzle ORM/Postgres, NextAuth, Tailwind, Stripe (Payment Element, Invoices), Vercel Blob, Mapbox (geocoding/directions/nav).
- Roles: `CUSTOMER`, `CLEANER` (with `TEAM_LEAD` / `CLEANER` / `JR_CLEANER` sub-roles), `ADMIN`, `SUPER_ADMIN`.
- **TrashCan** is the SaaS product this codebase now is: a multi-tenant platform (`tenants.isPlatform`, `SUPER_ADMIN`) that any cleaning company can sign up for and run on. 3U3 Cleaning is its first tenant and the reference customer. Each company renames its own roles (defaults: Admin, Team Lead, Cleaner, Jr. Cleaner, Client), brands its portals, and turns integrations on with its own keys.
- Legal/compliance constraints that shape the product, not just the code: tips are taxable wages (IRS Topic 761), not gifts — payroll logic must treat them as such; geocoded coordinates are never persisted beyond a single trip's cache, per Mapbox's free-tier ToS.
- No service pricing is ever published on the public site — pricing is confirmed in person by design, not a placeholder gap.

## Brand Commitments

- Name: **3U3 Cleaning**. Wordmark/logo assets exist (light and dark variants) and are binding — not to be redrawn.
- Founders: Betty & Mike, parents of three boys, moved from Canada to Texas.
- Tagline family: "Clean spaces. Brighter days." / "More time for life."
- Three Pillars (stated company values, each written as a checkable promise rather than an adjective): **Faith** ("price at your door instead of guessing from a form," "we don't take a cent before we've earned it"), **Family** ("nobody joins this crew we wouldn't hand our own front-door key to"), **Future** ("a business our boys could take over one day").
- Voice: warm, plain-spoken, promise-driven, allergic to vague marketing claims — copy favors specific, checkable statements ("The baseboard nobody checks") over adjectives.
- Current visual system: the company's own brand book (`docs/brand/brand-board.png`) — deep navy `#041730`, vivid blue `#016AEE`, aqua/teal `#18AA9D`, fresh green `#2DBD91`, near-white `#F7F9FB`, signature `#016AEE → #2DBD91` gradient on the primary CTA only; Plus Jakarta Sans for headings/display, Inter for body/UI; full pill buttons, 16px card radius. This is the binding palette — treat it as ground truth over any prior in-session palette experiments, and check `docs/brand/brand-board.png` before making color/type/component decisions.

## Evidence on Hand

- Full founder story and three-pillars copy: `lib/about.ts`.
- Service copy (Standard, Deep, Move-In/Move-Out; Airbnb withdrawn but preserved in schema): `lib/services.ts`.
- Real hero photography in `public/images/`; logo marks in `public/brand/`.
- No testimonials/review counts/customer figures exist yet beyond what real customers submit through the in-product review flow — none should be fabricated.

## Product Principles

1. Trust is earned by specificity, not adjectives — every claim on the product must be one the business can already stand behind.
2. Price is a conversation at the door, never a number printed or guessed online.
3. The crew's tools (offline-first app, fair/configurable pay, supply reporting) are as much the product as the customer-facing site — a cleaning company that treats its crew well is the actual differentiator behind the trust claims.
4. TrashCan is the platform; each company's portals are theirs. Platform/SUPER_ADMIN concerns stay on /platform and never leak into a company's own admin, crew or client screens, which carry that company's name and brand.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established beyond standard web accessibility practice.
