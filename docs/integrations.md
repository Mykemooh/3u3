# Integrations plan

What a cleaning company running on TrashCan (3U3 first) connects to, what's
already wired, and what gets built next. Every integration is **off until its
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
| Twilio SMS / WhatsApp | Reminders, on-my-way texts, two-way texting, Tex by text | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM` | console.twilio.com (dashboard shows SID and token) | Per message; US texting needs 10DLC registration |
| Twilio Voice | Tex answers the business line | same Twilio keys; point the number's Voice webhook at `/api/twilio/voice` | console.twilio.com → Phone Numbers | Per minute |
| Mapbox | Live crew map, ETA, route optimisation, service-area check | `MAPBOX_ACCESS_TOKEN` (+ optional `MAPBOX_SERVER_TOKEN`) | account.mapbox.com/access-tokens | Free tier |
| QuickBooks Online | Paid invoices sync as sales receipts, no duplicates | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT` | developer.intuit.com → My Apps | Free to register |
| Cloudflare R2 | Before/after photos and videos | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | dash.cloudflare.com → R2 → Manage API tokens | 10 GB free |
| Google sign-in | "Continue with Google" on every portal | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com/apis/credentials (OAuth client, Web app; redirect `<site>/api/auth/callback/google`) | Free |
| Claude API (Tex) | Tex's answers in the portals, by text and by phone | `ANTHROPIC_API_KEY` (optional `TEX_MODEL`) | console.anthropic.com/settings/keys | Per token; Tex falls back to the help articles without it |

## To build next (scheduled build, Oct 6 2026)

Each item ships behind its env var or a per-company "Connect" button, with
tests, and is listed on Admin → Settings → Integrations with its status.

1. **Integrations hub** — Admin → Settings → Integrations shows every
   integration above and below: connected / missing keys / not used, what it
   does, and the exact setup steps. Platform owner sees which env vars are
   set (names only, never values).
2. **Company API keys + outgoing webhooks** (Zapier, Make, n8n). Each company
   creates API keys (stored hashed, shown once) and webhook endpoints that
   receive signed JSON for `lead.created`, `booking.created`,
   `booking.cancelled`, `job.started`, `job.completed`, `invoice.sent`,
   `invoice.paid`, `review.created`. Retries with backoff; delivery log.
   No outside keys needed.
3. **Inbound lead webhook** — `POST /api/hooks/leads` (company API key)
   creates a lead from Angi, Thumbtack, Facebook Lead Ads or a website form
   via Zapier. Dedupe by phone/email.
4. **Google Calendar sync** — each staff member can "Connect Google
   Calendar" (same Google Cloud project as sign-in, Calendar API enabled);
   their jobs are pushed as events and kept in step when moved, skipped or
   cancelled. One-way, idempotent.
5. **Weather on the schedule** — Open-Meteo (free, **no key**): rain/heat
   flags on days with outdoor add-ons (patio, windows, pressure washing).
6. **Google review link lookup** — with `GOOGLE_MAPS_API_KEY` (Places API),
   find the company's Place ID and fill the "leave a review" link used by
   review requests. Manual paste stays as the fallback.
7. **Address autocomplete** — Mapbox Search Box on lead and client forms,
   using the existing Mapbox token; coordinates still never stored.
8. **Background checks (Checkr)** — invite a new cleaner from Team, track
   status by webhook. `CHECKR_API_KEY` (dashboard.checkr.com, partner
   account).
9. **Payroll (Gusto)** — export a payroll run in Gusto's import format now;
   push via API when partner credentials exist (`GUSTO_CLIENT_ID`,
   `GUSTO_CLIENT_SECRET`, dev.gusto.com).
10. **Error monitoring** — Sentry (`SENTRY_DSN`, sentry.io) for server and
    browser errors, and a public `/status` page backed by a health check.
11. **Xero** — the QuickBooks sync's twin for companies on Xero
    (`XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, developer.xero.com).

## Usable today with no key

- Open-Meteo weather (no account).
- US federal holidays (computed in `lib/recurring.ts`).
- Google Calendar "Add to calendar" links and `.ics` files (already in the
  client portal).
- Outgoing webhooks and company API keys (TrashCan's own).
