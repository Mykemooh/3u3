import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { integrations, tenants } from '@/db/schema';

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
    does: 'Live crew map, arrival times, route planning and the service-area check. Addresses are looked up, never stored as coordinates.',
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
const COUNTERS: Record<string, (tenantId: string, userId: string | null) => Promise<number>> = {};

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
