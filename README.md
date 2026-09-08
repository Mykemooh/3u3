# 3U3 Cleaning — Booking, Scheduling & Operations App

A real, working web app for 3U3 Cleaning (formerly Homelume), built against the
Product Requirements Document in the "cleaning project": customer booking on
one side, crew checklist + before/after photo capture on the other, all
backed by a single admin-driven schedule so no slot is ever fabricated and no
crew is ever double-booked.

Built to deploy cleanly on **Vercel**, using Vercel Postgres and Vercel Blob
for storage (see Deploying, below).

## What's built (V1 scope, per the PRD)

- **Welcome screen** — two paths only: returning customer / new here.
- **New-customer lead capture** — name, phone, address, no account or
  payment, immediately followed by picking a quote-visit time.
- **Returning-customer booking** — sign in by phone, see your own agreed
  rate per service, pick a real open slot on the crew's calendar. The
  recurring-cadence prompt (one-time / bi-weekly / monthly) only appears —
  and only for Standard cleaning — as the very last step before confirming,
  exactly as specced.
- **Admin dashboard** — adjust the scheduling engine (working hours, crew
  size, per-service duration via seed data, commute buffer), see every
  booking, manage crew, set/update each client's agreed rate.
- **Cleaner job app** — cleaners see only their own crew's jobs; each job's
  checklist matches its service type (Standard / Deep / Move-in-out /
  Airbnb turnover); every room needs a before *and* after photo (or an
  explicit skip + reason) before it counts as done; a job can't be marked
  finished until every room is accounted for.
- **No double-booking** — enforced in a database transaction, not just in
  the UI.

Out of scope for V1 (per the PRD's own "future phases" list, section 5):
AI phone bot, white-label multi-tenant onboarding UI, owner analytics
dashboard, in-app payments, video capture. The data model doesn't preclude
any of these — tenant, service, and checklist records are already
per-tenant, just seeded with one tenant today.

## Tech stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Postgres** via `pg` (node-postgres) + Drizzle ORM — works with any
  standard Postgres connection string, including Vercel Postgres
- **Vercel Blob** for job photos in production, with an automatic fallback
  to local disk (`public/uploads/`) for local dev — see `lib/storage.ts`
- **NextAuth** (credentials-based: phone+password for customers,
  email+password for staff)

Two things worth knowing about these choices:

- **Not Prisma.** Its `prisma generate` step downloads a native engine
  binary from the network, which wasn't reachable in the sandbox this app
  was first built in. Drizzle + `pg` needs nothing beyond `npm install`.
- **Not `@vercel/postgres`.** That package is now deprecated in favor of
  Neon's own driver — but since this app needs real interactive
  transactions (read-then-conditionally-write, for the no-double-booking
  check), plain `pg` against Vercel Postgres's standard connection string
  is simpler and more portable than either serverless driver.

## Running it locally

Requires Node 18+ and a Postgres database (local install, Docker, or any
free-tier hosted one — Vercel Postgres itself, Neon, Supabase, etc. all
work for local dev too).

```bash
npm install
cp .env.example .env.local   # then fill in POSTGRES_URL and NEXTAUTH_SECRET
npm run setup                 # creates tables + seed data
npm run dev                   # http://localhost:3000
```

Leave `BLOB_READ_WRITE_TOKEN` blank locally — job photos will just save
under `public/uploads/jobs/` instead of Vercel Blob.

### Demo logins (created by `npm run setup`)

| Role | Identifier | Password |
|---|---|---|
| Admin | `admin@3u3cleaning.com` | `admin123` |
| Cleaner | `jordan@3u3cleaning.com` | `clean123` |
| Returning customer | `+12815550199` (Dana Reyes) | `customer123` |

Dana has agreed rates on file for Standard ($120) and Deep ($220) cleaning,
so `/book` will show real pricing immediately.

## Deploying to Vercel

1. Push this repo to GitHub (see the checklist your build session gave you,
   or just `git remote add origin <your-repo-url> && git push -u origin main`).
2. In Vercel, "Add New Project" → import the repo.
3. Before the first deploy, open the project's **Storage** tab and add:
   - **Postgres** — this sets `POSTGRES_URL` (and a few related env vars)
     automatically.
   - **Blob** — this sets `BLOB_READ_WRITE_TOKEN` automatically.
4. In **Settings → Environment Variables**, add:
   - `NEXTAUTH_SECRET` — a long random string (`openssl rand -base64 32`)
   - `NEXTAUTH_URL` — your production URL (e.g. `https://3u3cleaning.vercel.app`)
5. Deploy.
6. Run the one-time schema + seed step against the *production* database.
   Easiest way: pull the production env vars locally and run the same
   scripts you used for local dev:
   ```bash
   npx vercel env pull .env.production.local
   npx tsx --env-file=.env.production.local db/push.ts
   npx tsx --env-file=.env.production.local db/seed.ts
   ```
   (Or connect any Postgres client to the `POSTGRES_URL` Vercel gives you
   and skip straight to `db/seed.ts` after `db/push.ts`.)
7. Visit your deployed URL and sign in with the demo logins above to
   confirm everything works, then replace the seed data with real crew /
   client / rate records from the admin dashboard.

**Change the demo passwords** (or replace the seeded users entirely) before
giving real customers or cleaners the URL.

## Where things live

```
app/                    Pages & API routes (Next.js App Router)
  page.tsx               Welcome screen
  new/                    New-customer lead capture + quote-visit booking
  signin/                 Customer / staff sign-in
  book/                   Returning-customer booking wizard
  admin/                  Admin dashboard (settings, bookings, crew, rates)
  crew/                   Cleaner job app (checklist + photo capture)
  api/                    Route handlers backing all of the above
components/              Shared UI (BookWizard, JobChecklist, Logo, forms)
lib/
  scheduling.ts           The admin-driven slot-generation engine
  bookings.ts             Booking creation + no-double-booking enforcement
  storage.ts              Job photo storage (Vercel Blob, local-disk fallback)
  auth.ts                 NextAuth config
  data.ts                 Shared DB read helpers
db/
  schema.ts               Drizzle schema (mirrors PRD section 7's data model)
  push.ts                 Creates tables (idempotent, no migration tooling needed)
  seed.ts                 3U3 tenant, services, checklists, crew, demo users
```

## Notable implementation decisions

- **Scheduling math matches the PRD exactly.** With the V1 defaults (8:00
  AM–5:00 PM, 2.5hr Standard clean, 45min commute buffer), the engine
  produces precisely the three windows named in PRD section 6.4: 8:00–10:30,
  11:15–1:45, 2:30–5:00. Change any admin setting and it recalculates.
- **Quote visits are a separate calendar from cleaning jobs**, per the open
  question the PRD itself flags in section 9 — modeled as four fixed
  30-minute owner visit slots/day, independent of crew capacity.
- **The checklist room lists are sensible defaults**, not a verbatim copy of
  the internal Cleaning Checklists reference document (that level of detail
  wasn't available to pull from when this was built). They're stored as
  ordinary database rows (`checklist_template_items`), so editing them is a
  data change, not a code change — worth reviewing against the real SOP
  before this goes live with cleaners.
- **The 3U3 logo is a styled text wordmark**, not the real PNG (the actual
  asset lives outside this build environment). Drop the real file at
  `public/logo.png` and swap the two-line markup in `components/Logo.tsx`
  for an `<img>` tag — everything else (colors, layout) is already correct.
- **Job photos use Vercel Blob automatically once deployed** (falls back to
  local disk only when `BLOB_READ_WRITE_TOKEN` isn't set, i.e. local dev).
- **Notifications are logged, not sent.** `notification_log` records every
  email/SMS trigger event (matching PRD section 3's cost-tracking goal) but
  no real email/SMS provider is wired up — that's a natural next step.
- **`slotStart`/`slotEnd` are plain text**, not Postgres timestamp columns —
  they hold naive "business-local wall-clock" strings
  (`YYYY-MM-DDTHH:MM:00`) that the scheduling engine parses directly. This
  is deliberate: V1 has one service area / one timezone, so there's nothing
  to gain from timezone-aware columns, and it avoids any UTC-conversion
  surprises in the slot math.

## Suggested next steps

1. Swap in the real 3U3 logo asset.
2. Replace the checklist item defaults with the actual room-by-room detail
   from the Cleaning Checklists SOP document.
3. Wire `notification_log` triggers to a real email provider (e.g. Resend)
   and, per the PRD's SMS cost threshold, Twilio once lead volume justifies it.
4. Change the seeded demo passwords / replace the demo users before this
   goes anywhere near real customers or cleaners.
5. Add a custom domain in Vercel once you're happy with the `.vercel.app` URL.
