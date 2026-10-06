# TRASHCAN billing

The software is free. TRASHCAN earns a platform fee on card payments a company collects through it, or a flat monthly plan that lowers or removes that fee. Usage (texts, Tex phone minutes, the business number) is prepaid by each company, so the platform owner never carries a company's costs.

All numbers live in **`lib/billing/plans.ts`** — the pricing page, signup, Plan & credits, fees and metering read from it.

| Plan | Monthly | Platform fee | Included texts | Included Tex minutes |
|---|---|---|---|---|
| Free | $0 | 1% | — | — |
| Crew | $49 | 0.5% | 500 | 60 |
| Team | $129 | 0% | 1,500 | 200 |

Usage beyond the allowance: texts 2¢ per segment, Tex minutes 25¢, number $2/month, texting setup $49 once.

## Card payments (lib/connect.ts)

Payments are routed to each company's own Stripe account (Connect, Express accounts, destination charges — the existing setup). The application fee is **Stripe's pass-through cost** (3.15% + 30¢ by default; `STRIPE_PASSTHROUGH_BPS` / `STRIPE_PASSTHROUGH_FIXED_CENTS`) **plus the plan's platform fee**. Tips carry only the pass-through. A company that hasn't connected Stripe can't take card payments (`cardRouting`), except a house account.

> Follow-up worth doing: move companies to **Standard accounts with direct charges**. Then Stripe bills each company directly, chargebacks are theirs, there's no per-account Connect fee, and the application fee is just the platform fee. That needs invoices, statements, tips and saved cards to be created on the connected account (`Stripe-Account` header) — a contained but real refactor of `lib/invoices.ts`, `lib/monthlyBilling.ts`, `lib/tips.ts` and `lib/payments.ts`.

## Plans and promos (lib/billing/stripeBilling.ts)

- Crew/Team are Stripe subscriptions on the platform account (prices created by lookup key on first use).
- A lapsed, cancelled or failed subscription drops the company to **Free**. Nothing is ever locked.
- Promo codes grant a complimentary Team plan (`planCompUntil` or `planCompForever`).
- **House accounts** (`billingExempt`): the platform owner's own company. Team features, no platform fee, usage never blocked or charged (still logged at $0). 3U3 Cleaning is set as one by the one-time migration in `db/push.ts`; toggle any company on `/platform/companies/[id]`.

## Credits (lib/billing/wallet.ts)

- `wallets` + append-only `wallet_ledger`; balance always equals the ledger sum and can't go below zero (row lock + CHECK).
- Every send is paid first and refunded if the provider call fails (`withUsage`). Allowance is spent before credits.
- Outbound texts (`lib/messaging.ts`, `lib/notify.ts` — falls back to email), inbound texts (Tex doesn't auto-reply without credits), Tex calls (2 minutes reserved to answer, then metered per turn; transfers capped by `timeLimit`).
- Top-ups by Stripe Checkout save the card; auto top-up charges it off-session (one attempt per 10 minutes) when the balance drops under the threshold. Credits land only on `payment_intent.succeeded`, keyed by PaymentIntent id (never twice).
- Daily (`/api/cron/monthly-billing` → `lib/billing/daily.ts`): allowance for house/promo accounts, the $2 number fee, suspend when unpaid, release after 30 days.
- Guardrails: 3,000 texts/day, 500 Tex minutes/month per company.

## Texting setup

The $49 checkout marks the company **Registering** and emails the platform owner. Provisioning is manual for now: buy the number in Twilio, file A2P 10DLC, add the number to the company, then **Mark number live** on the platform console.

## Webhooks

`/api/stripe/webhook` records every event id in `stripe_events` (a replay is a no-op), offers it to `handleBillingEvent` first, then to client-payment handlers. Events to enable on the platform endpoint: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `account.updated`.

## Before launch (owner)

1. Stripe: enable the events above; turn on the billing portal (Settings → Billing → Customer portal).
2. Vercel: Pro plan (Hobby doesn't allow commercial use); set `PLATFORM_HOSTS` once TRASHCAN has its own domain.
3. Twilio: a small starting balance (~$20) on the parent account.
4. Have the Terms reviewed (updated October 6, 2026 for this model).
