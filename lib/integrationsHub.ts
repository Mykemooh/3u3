import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { metaConnections, apiKeys, calendarConnections, integrations, tenants, webhookEndpoints } from '@/db/schema';

/**
 * Admin → Settings → Integrations: every outside service a company can
 * use, whether it's working, and exactly how to turn it on.
 *
 * Status comes from two places only: which environment variables are set
 * on this deployment (names checked, values never read out), and whether
 * this company finished a per-company "Connect" flow. Nothing here ever
 * returns a key's value.
 */

export type IntegrationStatus =
  | 'connected' // working for this company
  | 'needs_connect' // keys are set; this company still has to click Connect
  | 'missing_keys' // the deployment is missing one or more environment variables
  | 'not_used' // available, but this company hasn't set anything up yet
  | 'built_in'; // needs no account or key

export type EnvVar = { name: string; optional?: boolean; note?: string };

export type IntegrationDef = {
  key: string;
  name: string;
  group: 'Payments and accounting' | 'Messages' | 'Maps and schedule' | 'Team' | 'Leads and automation' | 'Reliability' | 'Sign-in and AI';
  does: string;
  env: EnvVar[];
  steps: string[];
  getFrom?: { label: string; url: string };
  /** Where in the admin this is set up or used, once keys exist. */
  manage?: { label: string; href: string };
  /** Status beyond "are the env vars set" — e.g. a per-company connection. */
  status?: (ctx: StatusContext) => IntegrationStatus | null;
};

export type StatusContext = {
  tenantId: string;
  userId: string | null;
  tenant: typeof tenants.$inferSelect | null;
  providers: Set<string>;
  counts: Record<string, number>;
};

export const envSet = (name: string) => !!process.env[name]?.trim();

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: 'stripe',
    name: 'Stripe',
    group: 'Payments and accounting',
    does: 'Sends invoices, keeps a card on file, charges autopay and tips, and bills company subscriptions.',
    env: [
      { name: 'STRIPE_SECRET_KEY' },
      { name: 'STRIPE_WEBHOOK_SECRET', note: 'Without it, payments succeed on Stripe but invoices here never turn paid.' },
      { name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY' },
      { name: 'STRIPE_CONNECT_WEBHOOK_SECRET', optional: true, note: 'Only for companies paid through their own Stripe account.' },
    ],
    steps: [
      'In Stripe, open Developers → API keys and copy the secret and publishable keys.',
      'Open Developers → Webhooks, add an endpoint at <site>/api/stripe/webhook for invoice.paid, and copy its signing secret.',
      'Add all three in Vercel → Settings → Environment Variables, then redeploy.',
    ],
    getFrom: { label: 'dashboard.stripe.com/apikeys', url: 'https://dashboard.stripe.com/apikeys' },
    manage: { label: 'Settings → Payments', href: '/admin/settings' },
  },
  {
    key: 'quickbooks',
    name: 'QuickBooks Online',
    group: 'Payments and accounting',
    does: 'Each paid invoice is added to QuickBooks as a sales receipt, with the customer, line items and tip. Never added twice.',
    env: [{ name: 'QUICKBOOKS_CLIENT_ID' }, { name: 'QUICKBOOKS_CLIENT_SECRET' }, { name: 'QUICKBOOKS_ENVIRONMENT', optional: true, note: '"production" to go live; anything else uses the sandbox.' }],
    steps: [
      'Create an app at developer.intuit.com → My Apps (Accounting scope).',
      'Add the redirect URI <site>/api/admin/integrations/quickbooks/callback.',
      'Put the client ID and secret in Vercel, redeploy, then click Connect QuickBooks below.',
    ],
    getFrom: { label: 'developer.intuit.com', url: 'https://developer.intuit.com/app/developer/myapps' },
    status: (c) => (c.providers.has('QUICKBOOKS') ? 'connected' : 'needs_connect'),
  },
  {
    key: 'zapier',
    name: 'Zapier, Make and n8n',
    group: 'Leads and automation',
    does: 'API keys to send leads in, and signed webhooks out when a lead, booking, job, invoice or review changes. No outside keys needed.',
    env: [],
    steps: [
      'Open Settings → API and webhooks.',
      'To send leads in (Angi, Thumbtack, Facebook Lead Ads, a website form): create an API key and use it in a Zapier "Webhooks by Zapier → POST" step to <site>/api/hooks/leads.',
      'To get events out: add a webhook address (for example a Zapier "Catch Hook" URL) and pick the events.',
    ],
    manage: { label: 'Settings → API and webhooks', href: '/admin/developers' },
    status: (c) => ((c.counts.apiKeys ?? 0) + (c.counts.webhooks ?? 0) > 0 ? 'connected' : 'not_used'),
  },
  {
    key: 'google_calendar',
    name: 'Google Calendar',
    group: 'Maps and schedule',
    does: 'Each person’s jobs (and, for the office, walkthroughs) appear in their own Google Calendar and move, disappear or change when the schedule does. One way: edits in Google don’t change the schedule.',
    env: [{ name: 'GOOGLE_CLIENT_ID' }, { name: 'GOOGLE_CLIENT_SECRET' }],
    steps: [
      'Uses the same Google Cloud OAuth client as Google sign-in.',
      'In that Google Cloud project, enable the Google Calendar API (APIs & Services → Library).',
      'On the OAuth consent screen, add the scope …/auth/calendar.events. Until Google verifies the app, add each staff member as a test user.',
      'Add the redirect URI <site>/api/calendar/google/callback to the OAuth client.',
      'Each person then clicks Connect Google Calendar — office staff here, crew on their Today screen.',
    ],
    getFrom: { label: 'console.cloud.google.com/apis/library/calendar-json.googleapis.com', url: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com' },
    status: (c) => ((c.counts.calendarMine ?? 0) > 0 ? 'connected' : 'needs_connect'),
  },
  {
    key: 'weather',
    name: 'Weather (Open-Meteo)',
    group: 'Maps and schedule',
    does: 'Flags rain and heat on the schedule for days with outdoor add-ons — patio, windows, pressure washing.',
    env: [{ name: 'OPEN_METEO_API_KEY', optional: true, note: 'Open-Meteo’s free service is for non-commercial use; a business should take one of their API plans and set this key.' }],
    steps: [
      'Works without setup. Mark which add-ons are done outside on Quotes → Add-ons (common ones are recognised by name).',
      'The forecast uses a team’s home-base city (Team page), or the city most of the week’s jobs are in.',
      'For commercial use, subscribe at open-meteo.com/en/pricing and add OPEN_METEO_API_KEY in Vercel.',
    ],
    getFrom: { label: 'open-meteo.com/en/pricing', url: 'https://open-meteo.com/en/pricing' },
    manage: { label: 'Schedule', href: '/admin/schedule' },
    status: () => 'built_in',
  },
  {
    key: 'google_places',
    name: 'Google review link lookup',
    group: 'Leads and automation',
    does: 'Finds your Google Business Profile and fills in the “leave a review” link happy clients are sent to. Pasting the link by hand works without it.',
    env: [{ name: 'GOOGLE_MAPS_API_KEY', note: 'Server-side only. Restrict it to Places API (New).' }],
    steps: [
      'In Google Cloud → APIs & Services → Library, enable Places API (New).',
      'Create an API key under Credentials and restrict it to Places API (New).',
      'Add GOOGLE_MAPS_API_KEY in Vercel and redeploy, then use Search Google under Settings → Reviews and referrals.',
    ],
    getFrom: { label: 'console.cloud.google.com/apis/credentials', url: 'https://console.cloud.google.com/apis/credentials' },
    manage: { label: 'Settings → Reviews and referrals', href: '/admin/settings#growth' },
    status: (c) => (c.tenant?.googleReviewUrl ? 'connected' : 'not_used'),
  },
  {
    key: 'checkr',
    name: 'Checkr background checks',
    group: 'Team',
    does: 'Send a new cleaner a background check from Team and see its status there. Checkr collects their details and consent; reports stay in Checkr.',
    env: [
      { name: 'CHECKR_API_KEY' },
      { name: 'CHECKR_PACKAGE', optional: true, note: 'The package slug on your Checkr account. Defaults to basic_plus.' },
      { name: 'CHECKR_ENVIRONMENT', optional: true, note: '"staging" to use Checkr’s test environment.' },
    ],
    steps: [
      'Open a Checkr account (partner or API access) at dashboard.checkr.com.',
      'Copy the secret API key from Account settings → Developer settings.',
      'Add a webhook there pointing at <site>/api/hooks/checkr.',
      'Add CHECKR_API_KEY (and CHECKR_PACKAGE if yours isn’t basic_plus) in Vercel and redeploy.',
    ],
    getFrom: { label: 'dashboard.checkr.com', url: 'https://dashboard.checkr.com' },
    manage: { label: 'Team → Background checks', href: '/admin/team#checks' },
  },
  {
    key: 'gusto',
    name: 'Gusto payroll',
    group: 'Team',
    does: 'Every payroll run exports in Gusto’s hours-and-earnings import layout now. With Gusto partner keys, Send to Gusto fills the open Gusto payroll for that period instead (matched by email; you still review and run it in Gusto).',
    env: [{ name: 'GUSTO_CLIENT_ID' }, { name: 'GUSTO_CLIENT_SECRET' }, { name: 'GUSTO_ENVIRONMENT', optional: true, note: '"production" once Gusto approves the app; otherwise Gusto’s demo environment is used.' }],
    steps: [
      'Without keys: open a payroll run and click Export for Gusto, then upload it in Gusto → Run payroll → Import hours. Check the columns against Gusto’s template the first time.',
      'For the API: apply for a Gusto developer (partner) app at dev.gusto.com and add the redirect URI <site>/api/admin/integrations/gusto/callback.',
      'Add GUSTO_CLIENT_ID and GUSTO_CLIENT_SECRET in Vercel, redeploy, then click Connect Gusto below.',
      'Make sure each person’s email on Team matches their email in Gusto.',
    ],
    getFrom: { label: 'dev.gusto.com', url: 'https://dev.gusto.com' },
    manage: { label: 'Payroll', href: '/admin/payroll' },
    status: (c) => (c.providers.has('GUSTO') ? 'connected' : 'needs_connect'),
  },
  {
    key: 'sentry',
    name: 'Sentry error monitoring',
    group: 'Reliability',
    does: 'Sends server and browser errors to Sentry with the page they happened on, so problems are seen before a client reports them. Never sends form contents, cookies or links’ query strings.',
    env: [{ name: 'SENTRY_DSN' }],
    steps: [
      'Create a project in Sentry (platform: Next.js) and copy its DSN from Project settings → Client keys.',
      'Add SENTRY_DSN in Vercel and redeploy.',
      'The public status page is at <site>/status; point an uptime monitor at <site>/api/health (200 while the app and database are up).',
    ],
    getFrom: { label: 'sentry.io', url: 'https://sentry.io' },
    manage: { label: 'Status page', href: '/status' },
  },
  {
    key: 'muse',
    name: 'Muse (ads and campaign ideas)',
    group: 'Leads and automation',
    does: 'Tex’s marketing helper: drafts ads, emails and texts from your own services and clients, checks the copy against house rules, suggests a four-week plan, and makes free AI pictures. Works with no keys; add an Anthropic key for fresher writing.',
    env: [{ name: 'ANTHROPIC_API_KEY', optional: true, note: 'Without it Muse uses built-in templates.' }, { name: 'MUSE_MODEL', optional: true }],
    steps: ['Open Marketing → Muse and tell it a goal.', 'Edit and approve what you like; email and text ideas become draft campaigns in Growth.'],
    manage: { label: 'Open Muse', href: '/admin/marketing/muse' },
    status: () => 'built_in',
  },
  {
    key: 'meta-ads',
    name: 'Facebook and Instagram ads',
    group: 'Leads and automation',
    does: 'Muse can create an approved ad in your own Meta ad account — always paused, with a daily budget cap and the ZIP codes you choose. You switch it on in Ads Manager and pay Meta directly.',
    env: [
      { name: 'META_APP_ID' },
      { name: 'META_APP_SECRET' },
      { name: 'META_MAX_DAILY_CENTS', optional: true, note: 'Highest daily budget Muse will accept. Defaults to 5000 ($50).' },
    ],
    steps: [
      'Create an app at developers.facebook.com (type Business) and add the Marketing API product.',
      'Add the redirect URI <site>/api/admin/muse/meta/callback.',
      'Add META_APP_ID and META_APP_SECRET in Vercel, redeploy, then Connect Facebook in Marketing → Muse.',
      'Until Meta approves the app for advanced access, only people added to the app as admins or testers can connect.',
    ],
    getFrom: { label: 'developers.facebook.com', url: 'https://developers.facebook.com/apps' },
    manage: { label: 'Open Muse', href: '/admin/marketing/muse' },
    status: (c) => (c.counts.metaAds > 0 ? 'connected' : 'needs_connect'),
  },
  {
    key: 'xero',
    name: 'Xero',
    group: 'Payments and accounting',
    does: 'For companies on Xero instead of QuickBooks: each paid invoice is added to Xero as money received, with the client, line items and tip. Never added twice.',
    env: [
      { name: 'XERO_CLIENT_ID' },
      { name: 'XERO_CLIENT_SECRET' },
      { name: 'XERO_SALES_ACCOUNT_CODE', optional: true, note: 'Revenue account for line items. Defaults to 200 (Sales).' },
      { name: 'XERO_BANK_ACCOUNT_CODE', optional: true, note: 'Bank account that receives the money. Defaults to your only bank account, or one named Stripe.' },
      { name: 'XERO_SCOPES', optional: true, note: 'Only if Xero asks your app to use different scopes.' },
    ],
    steps: [
      'Create a Web app at developer.xero.com → My Apps.',
      'Add the redirect URI <site>/api/admin/integrations/xero/callback and copy the client ID and secret.',
      'Add them in Vercel, redeploy, then click Connect Xero below.',
    ],
    getFrom: { label: 'developer.xero.com', url: 'https://developer.xero.com/app/manage' },
    status: (c) => (c.providers.has('XERO') ? 'connected' : 'needs_connect'),
  },
  {
    key: 'resend',
    name: 'Resend email',
    group: 'Messages',
    does: 'Sends every email: confirmations, reminders, sign-in codes, invoices and receipts.',
    env: [{ name: 'RESEND_API_KEY' }, { name: 'EMAIL_FROM', optional: true, note: 'For example "3U3 Cleaning <hello@3u3cleaning.com>". Verify the domain in Resend first.' }],
    steps: ['Verify your sending domain in Resend → Domains.', 'Create an API key in Resend → API Keys.', 'Add RESEND_API_KEY and EMAIL_FROM in Vercel, then redeploy.'],
    getFrom: { label: 'resend.com/api-keys', url: 'https://resend.com/api-keys' },
  },
  {
    key: 'twilio',
    name: 'Twilio texts and calls',
    group: 'Messages',
    does: 'Reminders and on-my-way texts, two-way texting in Messages, and Tex answering texts and the business line.',
    env: [
      { name: 'TWILIO_ACCOUNT_SID' },
      { name: 'TWILIO_AUTH_TOKEN' },
      { name: 'TWILIO_FROM_NUMBER' },
      { name: 'TWILIO_WHATSAPP_FROM', optional: true },
    ],
    steps: [
      'Copy the Account SID and Auth Token from the Twilio console home page.',
      'Buy a number, and register it for US texting (A2P 10DLC) before sending to clients.',
      'On the number, set "A message comes in" to POST <site>/api/twilio/sms and "A call comes in" to POST <site>/api/twilio/voice.',
      'Add the keys in Vercel, redeploy, and enter the number under Settings → Texting and Tex.',
    ],
    getFrom: { label: 'console.twilio.com', url: 'https://console.twilio.com' },
    manage: { label: 'Settings → Texting and Tex', href: '/admin/settings' },
  },
  {
    key: 'mapbox',
    name: 'Mapbox',
    group: 'Maps and schedule',
    does: 'Address suggestions on lead and client forms, live crew map, arrival times, route planning and the service-area check. Coordinates are never stored.',
    env: [{ name: 'MAPBOX_ACCESS_TOKEN' }, { name: 'MAPBOX_SERVER_TOKEN', optional: true, note: 'A second, unrestricted token for server-side lookups.' }],
    steps: ['Create a token at account.mapbox.com → Access tokens (public scopes are enough).', 'Add MAPBOX_ACCESS_TOKEN in Vercel and redeploy.'],
    getFrom: { label: 'account.mapbox.com/access-tokens', url: 'https://account.mapbox.com/access-tokens/' },
    manage: { label: 'Schedule → Routes', href: '/admin/routes' },
  },
  {
    key: 'r2',
    name: 'Cloudflare R2 storage',
    group: 'Maps and schedule',
    does: 'Stores before-and-after photos and videos, uploaded straight from the crew’s phones.',
    env: [{ name: 'R2_ACCOUNT_ID' }, { name: 'R2_ACCESS_KEY_ID' }, { name: 'R2_SECRET_ACCESS_KEY' }, { name: 'R2_BUCKET' }, { name: 'R2_PUBLIC_URL' }],
    steps: ['Create a bucket in Cloudflare → R2.', 'Create an API token with Object Read & Write on that bucket.', 'Add the five values in Vercel and redeploy. Full guide: docs/storage-r2.md.'],
    getFrom: { label: 'dash.cloudflare.com → R2', url: 'https://dash.cloudflare.com' },
  },
  {
    key: 'google_signin',
    name: 'Google sign-in',
    group: 'Sign-in and AI',
    does: '"Continue with Google" on every portal.',
    env: [{ name: 'GOOGLE_CLIENT_ID' }, { name: 'GOOGLE_CLIENT_SECRET' }],
    steps: [
      'In Google Cloud → APIs & Services → Credentials, create an OAuth client (Web application).',
      'Add the redirect URI <site>/api/auth/callback/google.',
      'Add the client ID and secret in Vercel and redeploy.',
    ],
    getFrom: { label: 'console.cloud.google.com/apis/credentials', url: 'https://console.cloud.google.com/apis/credentials' },
  },
  {
    key: 'anthropic',
    name: 'Claude API (Tex)',
    group: 'Sign-in and AI',
    does: 'Tex’s answers in the portals, by text and by phone. Without it, Tex answers from your help articles only.',
    env: [{ name: 'ANTHROPIC_API_KEY' }, { name: 'TEX_MODEL', optional: true }],
    steps: ['Create a key at console.anthropic.com → Settings → API keys.', 'Add ANTHROPIC_API_KEY in Vercel and redeploy.'],
    getFrom: { label: 'console.anthropic.com', url: 'https://console.anthropic.com/settings/keys' },
    manage: { label: 'Messages → Tex conversations', href: '/admin/messages/tex' },
  },
];

export function missingEnv(def: IntegrationDef): string[] {
  return def.env.filter((v) => !v.optional && !envSet(v.name)).map((v) => v.name);
}

export function statusOf(def: IntegrationDef, ctx: StatusContext): IntegrationStatus {
  if (def.env.length > 0 && missingEnv(def).length > 0) return 'missing_keys';
  const extra = def.status?.(ctx);
  if (extra) return extra;
  return def.env.length === 0 ? 'built_in' : 'connected';
}

/** Small per-company counts some statuses read. */
const COUNTERS: Record<string, (tenantId: string, userId: string | null) => Promise<number>> = {
  apiKeys: async (t) => (await db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.tenantId, t), isNull(apiKeys.revokedAt)))).length,
  calendarMine: async (_t, u) => (u ? (await db.select({ id: calendarConnections.id }).from(calendarConnections).where(eq(calendarConnections.userId, u))).length : 0),
  calendarTeam: async (t) => (await db.select({ id: calendarConnections.id }).from(calendarConnections).where(eq(calendarConnections.tenantId, t))).length,
  metaAds: async (t) => (await db.select({ id: metaConnections.id }).from(metaConnections).where(eq(metaConnections.tenantId, t))).length,
  webhooks: async (t) => (await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(and(eq(webhookEndpoints.tenantId, t), eq(webhookEndpoints.active, true)))).length,
};

export async function statusContext(tenantId: string, userId: string | null): Promise<StatusContext> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const rows = await db.select({ provider: integrations.provider }).from(integrations).where(eq(integrations.tenantId, tenantId));
  const counts: Record<string, number> = {};
  for (const [name, fn] of Object.entries(COUNTERS)) {
    counts[name] = await fn(tenantId, userId).catch(() => 0);
  }
  return { tenantId, userId, tenant: tenant ?? null, providers: new Set(rows.map((r) => r.provider)), counts };
}

export async function integrationOverview(tenantId: string, userId: string | null) {
  const ctx = await statusContext(tenantId, userId);
  return INTEGRATIONS.map((def) => ({
    key: def.key,
    name: def.name,
    group: def.group,
    does: def.does,
    steps: def.steps,
    getFrom: def.getFrom ?? null,
    manage: def.manage ?? null,
    env: def.env.map((v) => ({ name: v.name, optional: !!v.optional, note: v.note ?? null })),
    status: statusOf(def, ctx),
  }));
}

/** Platform owner view: every variable, set or not — names only. */
export function envReport() {
  return INTEGRATIONS.map((def) => ({
    key: def.key,
    name: def.name,
    vars: def.env.map((v) => ({ name: v.name, optional: !!v.optional, set: envSet(v.name) })),
  }));
}

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  needs_connect: 'Ready to connect',
  missing_keys: 'Missing keys',
  not_used: 'Not set up',
  built_in: 'Built in',
};
