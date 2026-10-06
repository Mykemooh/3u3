# Integrations plan

What a cleaning company running on TrashCan (3U3 first) connects to, what's
wired, and what's next. Every integration is **off until its
keys are set** in Vercel → Settings → Environment Variables, so code can ship
before the accounts exist.

Keys are never pasted into chat, code, or the database by hand — each one goes
into Vercel's environment variables (or, for per-company connections like
QuickBooks, through that service's own "Connect" sign-in flow).

## Already wired (just needs keys)

| Integration | What it does | Env vars | Where to get them | Cost |
| --- | --- | --- | --- | --- |
| Stripe | Invoices, card on file, autopay, tips, platform subscriptions | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | dashboard.stripe.com/apikeys and /webhooks | Per transaction |
| Resend | All email (confirmations, reminders, MFA codes, receipts) | `RESEND_API_KEY`, `EMAIL_FROM` | resend.com/api-keys (verify your domain first) | Free tier |
| Twilio SMS / WhatsApp | Reminders, on-my-way texts, two-way texting (Admin → Messages), Tex by text | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM`; point the number's Messaging webhook ("A message comes in", POST) at `/api/twilio/sms` | console.twilio.com (dashboard shows SID and token) | Per message; US texting needs 10DLC registration |
| Twilio Voice | Tex answers the business line | same Twilio keys; point the number's Voice webhook at `/api/twilio/voice` | console.twilio.com → Phone Numbers | Per minute |
| Mapbox | Live crew map, ETA, route optimisation, service-area check | `MAPBOX_ACCESS_TOKEN` (+ optional `MAPBOX_SERVER_TOKEN`) | account.mapbox.com/access-tokens | Free tier |
| QuickBooks Online | Paid invoices sync as sales receipts, no duplicates | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT` | developer.intuit.com → My Apps | Free to register |
| Cloudflare R2 | Before/after photos and videos | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | dash.cloudflare.com → R2 → Manage API tokens | 10 GB free |
| Google sign-in | "Continue with Google" on every portal | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com/apis/credentials (OAuth client, Web app; redirect `<site>/api/auth/callback/google`) | Free |
| Claude API (Tex) | Tex's answers in the portals, by text and by phone | `ANTHROPIC_API_KEY` (optional `TEX_MODEL`) | console.anthropic.com/settings/keys | Per token; Tex falls back to the help articles without it |

## Built Oct 6 2026 (scheduled build) — each is off until its keys are set

Every item below is on **Admin → Settings → Integrations** with its live
status (connected / ready to connect / missing keys / not set up / built
in) and setup steps. The platform owner sees every env var as set or
missing — names only — on **/platform/integrations** ("Keys").

| # | Integration | What it does | Needs | Where |
| --- | --- | --- | --- | --- |
| 1 | **Integrations hub** | One page with every integration's status and exact setup steps | nothing | `lib/integrationsHub.ts`, `app/admin/integrations`, `app/platform/integrations` |
| 2 | **API keys + outgoing webhooks** (Zapier, Make, n8n) | Company API keys (sha256-stored, shown once, revocable). Webhook addresses get HMAC-SHA256-signed JSON (`TrashCan-Signature: t=…,v1=…`, per-endpoint secret) for `lead.created`, `booking.created`, `booking.cancelled`, `job.started`, `job.completed`, `invoice.sent`, `invoice.paid`, `review.created`. Retries at 1m, 5m, 30m, 2h, 12h then gives up; delivery log with Retry now and Send test event. Public https only. | nothing | Settings → API and webhooks; `lib/apiKeys.ts`, `lib/webhooks.ts`, `lib/events.ts` |
| 3 | **Inbound lead webhook** | `POST /api/hooks/leads` with a company key (`Authorization: Bearer tc_live_…` or `X-Api-Key`), JSON or form-encoded. Forgiving field names; needs a name and a phone or email. A repeat from the same phone/email while the lead is open is folded in. Shows on Leads → "From other sites". 200 leads/hour cap. | a company API key | `lib/inboundLeads.ts` |
| 4 | **Google Calendar sync** | Each staff member connects their own calendar (office on Integrations, crew on Today). Jobs (and walkthroughs for office staff) from yesterday to +60 days kept as events; moved / restaffed / cancelled / skipped visits follow. One way, idempotent (fixed event id per booking). | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (same OAuth client as sign-in) + Calendar API enabled + scope `…/auth/calendar.events` + redirect `<site>/api/calendar/google/callback` | `lib/googleCalendar.ts` |
| 5 | **Weather on the schedule** | Schedule shows a weather watch for days with outdoor add-ons and ≥60% rain / ≥0.2 in or ≥95°F. Add-ons have an Outdoor checkbox (common ones recognised by name). | nothing; `OPEN_METEO_API_KEY` optional — Open-Meteo's free API is non-commercial | `lib/weather.ts` |
| 6 | **Google review link lookup** | Settings → Reviews: Search Google, pick the listing, its Place ID becomes the review link | `GOOGLE_MAPS_API_KEY` (Places API (New)) | `lib/googlePlaces.ts` |
| 7 | **Address autocomplete** | Mapbox Search Box (suggest + retrieve, session-billed) on the lead form, new-client form and client address editor; falls back to geocoding autocomplete; coordinates never stored | existing `MAPBOX_ACCESS_TOKEN` | `components/AddressInput.tsx` |
| 8 | **Background checks (Checkr)** | Team → Background checks: send a check (Checkr's hosted form does details, disclosure, consent). Webhook `POST /api/hooks/checkr` (signed with the API key) moves status; owner emailed when done. Only status/result kept. | `CHECKR_API_KEY`; optional `CHECKR_PACKAGE` (default `basic_plus`), `CHECKR_ENVIRONMENT=staging` | `lib/checkr.ts` |
| 9 | **Payroll (Gusto)** | Every payroll run: Export for Gusto (CSV in the hours-and-earnings import layout — hours for hourly pay, commission for per-clean/day/percentage pay, paycheck tips). With partner keys: Connect Gusto, then Send to Gusto fills the open Gusto payroll for that period, matched by email; nothing is submitted. | CSV: nothing. API: `GUSTO_CLIENT_ID`, `GUSTO_CLIENT_SECRET`, `GUSTO_ENVIRONMENT=production` once approved; redirect `<site>/api/admin/integrations/gusto/callback` | `lib/gusto.ts` |
| 10 | **Error monitoring** | Server errors (anything passed to `console.error`, unhandled rejections) and browser errors go to Sentry; no SDK. Only type, message, stack, path, environment, commit — never bodies, cookies, headers or query strings. `/status` and `/api/health` already existed. | `SENTRY_DSN` | `lib/monitoring.ts`, `instrumentation.ts` |
| 11 | **Xero** | Paid invoices added to Xero as "receive money" bank transactions with line items and tip; Idempotency-Key + `xero_links`, never twice | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`; optional `XERO_SALES_ACCOUNT_CODE` (default 200), `XERO_BANK_ACCOUNT_CODE`, `XERO_SCOPES`; redirect `<site>/api/admin/integrations/xero/callback` | `lib/xero.ts` |

Notes:

- Webhook retries run when the company's next event is sent, in the two
  daily jobs, and at `/api/cron/webhooks` (send `Authorization: Bearer
  <CRON_SECRET>`; point any scheduler at it for faster retries — no new
  Vercel cron was added, so the plan's cron limits don't change).
- Webhook signing secrets and outside services' tokens are sealed with
  `HOME_PROFILE_ENCRYPTION_KEY` when it's set (`lib/secretBox.ts`).
- Google Calendar sync also runs in the daily job, catching anything an
  edit path missed (for example a person moved to another team).
- The QuickBooks push no longer counts a paid tip twice when the invoice
  also carries the tip as its own line item.

## Muse — Tex's marketing agent (built Oct 6 2026)

**Status:** phases 1–4 are built (Marketing → Muse). Ideas and copy, the four-week plan, free AI pictures (Pollinations, no key) and a Facebook/Instagram publisher that only creates paused ads. A paid image/video generator (Higgsfield or similar) is not wired in — there's no free API for it; the picture step is an adapter point (`imageUrlFor` in `lib/muse.ts`). Needs for Facebook: `META_APP_ID`, `META_APP_SECRET`, optional `META_MAX_DAILY_CENTS`.

Original plan:

A "Muse AI"-style marketing agent that lives in Tex's backend (`lib/muse.ts`,
tools in `lib/museTools.ts`, office-only, Admin → Marketing → Muse). Phased,
each phase shippable on its own:

1. **Ideas and copy (no new keys, uses `ANTHROPIC_API_KEY`).** Muse drafts
   campaign ideas, ad concepts and copy variants (headline, primary text,
   call to action) from the company's own data: services offered, seasons,
   past-client segments, referral program. Output lands as *drafts* in the
   existing `campaigns` table and a new `ad_concepts` table. Never states
   prices; a human edits and approves everything.
2. **Audience and timing.** Suggests segments from `lib/marketing.ts`
   (lapsed clients, recurring upsells, referral asks) and a send calendar.
3. **Creative assets.** Optional image/video generation through a provider
   adapter (candidates: Higgsfield, plus an image model) — keys in Vercel
   env only, off until configured. Provider to be confirmed by the owner.
4. **Meta (Facebook/Instagram) ads.** Marketing API via the *owner's own*
   ad account (OAuth, `META_APP_ID`, `META_APP_SECRET`). Muse prepares the
   campaign; the owner approves in-app before anything is created, and ads
   are created **paused**. Spend caps required. Other channels later.

Rules: nothing is published or spent without an explicit owner approval in
the app; no API keys in code or the database; tenant-scoped like Tex.

## Supply restock (built Oct 6 2026)

Supplies → Restock: a catalog with par levels, a restock list from low items and crew reports, per-store links (Amazon add-to-cart by ASIN, product or search links elsewhere) and Google Shopping price comparison. Free: no vendor account or API. An Amazon Business or Zinc integration (real ordering) is possible later but both need accounts and fees.

## Usable today with no key

- Open-Meteo weather (no account; non-commercial terms — see item 5).
- Company API keys, outgoing webhooks and the inbound lead webhook.
- Gusto CSV export from every payroll run.
- US federal holidays (computed in `lib/recurring.ts`).
- Google Calendar "Add to calendar" links and `.ics` files (already in the
  client portal).
