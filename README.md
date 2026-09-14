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
- **New-customer lead capture** — choose a service, then name, phone,
  address (no account or payment), immediately followed by picking a
  quote-visit time. The quote-visit calendar is fully native (four fixed
  daily 30-minute slots, PRD 6.2/9) — it needs no third-party calendar
  (Koalendar etc.) hooked up to work.
- **Returning-customer booking** — sign in by phone, see your own agreed
  rate per service, pick a real open slot on the crew's calendar. The
  recurring-cadence prompt (one-time / bi-weekly / monthly) only appears —
  and only for Standard cleaning — as the very last step before confirming,
  exactly as specced.
- **Estimates** — the step that turns a walkthrough into money. After a
  quote visit the admin writes up priced line items (plus an optional note)
  and sends them; the client gets Approve / Decline as one-click links in
  the email, no account needed. Approving writes the agreed price into
  `client_rates`, which is exactly what the returning-customer booking flow
  filters on — so approval opens real bookable slots at that price with no
  admin step in between. A brand-new lead has no password yet, so the
  approval page lets them set one and drops them straight into booking.
- **Dispatch board** (`/admin/schedule`) — the week laid out with crews
  down the side and days across the top, jobs needing a crew called out in
  their own row, and quote visits on a separate row since they're the
  owner's calendar rather than crew capacity. Reassigning a crew re-runs
  the same no-double-booking check that booking does.
- **Pipeline board** (`/admin/pipeline`) — every client's stage on one
  screen, from new lead through paid, with money totalled per column.
  Entirely derived from real records, so there's no status field to keep
  up to date by hand.
- **Invoicing and payment** — an invoice auto-drafts the moment a cleaner
  marks a job complete, at the client's already-agreed rate. The admin
  reviews and sends it; that creates a real Stripe invoice
  (`collection_method: 'send_invoice'`, so nothing is ever auto-charged)
  with a Stripe-hosted pay page and PDF. A webhook on `invoice.paid` marks
  it paid and sends the customer a receipt link plus an owner alert.
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

That chain — lead → walkthrough → estimate → approval → booking → job →
invoice → payment → receipt — runs end to end with no step happening
outside the app.

Out of scope for now (per the PRD's own "future phases" list, section 5):
AI phone bot, self-serve white-label onboarding UI, owner analytics
dashboard, video capture. The data model doesn't preclude any of these —
tenant, service, and checklist records are already per-tenant, just seeded
with one tenant today, so onboarding a second cleaning business is a data
exercise rather than a rewrite.

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
  estimates.ts            Draft/send/approve estimates; approval sets the agreed rate
  dispatch.ts             Week schedule rollup + crew reassignment (same conflict check)
  pipeline.ts             Derives each client's lifecycle stage for the pipeline board
  invoices.ts             Auto-draft on job completion, send via Stripe, confirm payment
  stripe.ts               Lazy Stripe client (throws a clear error if unconfigured)
  email.ts                Resend sending + every email template
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
- **Notifications are logged AND sent**, once configured. `notification_log`
  still records every trigger event (PRD section 3's cost-tracking goal),
  and `lib/email.ts` now actually sends the customer quote-visit
  confirmation and the owner's new-lead alert via Resend — but only once
  `RESEND_API_KEY` is set (see `.env.example`). Without it, sends are
  logged and console-warned, not delivered, so the app still runs fine
  without an email provider configured.
- **The hero's looping background video is real footage now**
  (`public/videos/hero-cleaning.mp4`, muted/looped/autoplaying behind the
  logo, tagline, and both CTAs), replacing the earlier CSS-simulated
  shine/sparkle placeholder in `components/CleaningMotion.tsx`.
- **Fixed a build-breaking bug**: several pages/routes that read live DB
  data (`/api/slots`, and everything under `/admin`, `/book`, `/crew`)
  weren't marked `dynamic = 'force-dynamic'`, so Next tried to prerender
  them at build time. With no DB reachable at build time this fails
  `next build` outright (exit code 1) — with a DB reachable, it would
  instead silently bake a build-time snapshot into the page. Both are bugs;
  fixed by declaring these routes dynamic.
- **Estimate approval links are capability URLs, not logins.** The client
  has no account when the estimate lands, so there's nothing to
  authenticate against; the link carries a 32-byte random token, stored
  unique on the row and only ever minted at send time. Same model as
  Stripe's own hosted invoice links. The token grants exactly one thing —
  answering that estimate — and the password-setup endpoint behind it only
  works once, on an approved estimate, for a client who has no password
  yet, so a forwarded link can never reset an established account.
- **The pipeline board derives every stage; it stores none.** A "stage"
  column maintained by hand drifts out of step with reality the first busy
  week. Stages are computed from bookings, estimates, jobs and invoices at
  read time instead, ordered by what needs doing next rather than how far
  along someone is (see the comments in `lib/pipeline.ts` — the repeat-
  client case is the one worth reading).
- **`db/push.ts` needs an explicit `ALTER TABLE` for new columns on
  existing tables.** `CREATE TABLE IF NOT EXISTS` is a no-op once a table
  exists, so editing a `CREATE TABLE` block alone will never reach an
  already-deployed database no matter how many times the script is re-run.
  `users.stripe_customer_id` is the worked example.
- **Payments never trust the browser.** An invoice is marked paid only by
  the Stripe webhook (`invoice.paid`), never by the customer landing back
  on a thank-you page. Without `STRIPE_WEBHOOK_SECRET` set, payments will
  succeed on Stripe's side and this app will never learn about them — so
  configure it before sending a real invoice.
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
3. Add `RESEND_API_KEY` (and optionally `EMAIL_FROM`) in Vercel's
   Environment Variables so the customer confirmation and owner alert
   emails actually send — sign up free at resend.com, verify a sending
   domain (or use their shared `onboarding@resend.dev` sender to start),
   and create an API key. Add Twilio, per the PRD's SMS cost threshold,
   once lead volume justifies it.
4. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` so invoices can
   actually be sent and paid. Use test-mode keys until you're ready for
   real money, and point the webhook at `<your-app-url>/api/stripe/webhook`
   subscribed to at least `invoice.paid` — without it, payments go through
   on Stripe's side and this app never finds out.
5. Set `NEXTAUTH_URL` to the real production URL. Estimate approval links
   are built from it, so if it's wrong or missing, every estimate you send
   will point at `localhost`.
6. Change the seeded demo passwords / replace the demo users before this
   goes anywhere near real customers or cleaners.
7. Add a custom domain in Vercel once you're happy with the `.vercel.app` URL.
