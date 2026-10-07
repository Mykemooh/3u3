import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { adConcepts, metaConnections } from '@/db/schema';
import { seal, unseal } from '@/lib/secretBox';
import { logChange, type Actor } from '@/lib/audit';
import { appUrl } from '@/lib/url';
import { copyIssues, imageUrlFor, getConcept, MuseError, tenantBookingLink } from '@/lib/muse';

/**
 * Facebook and Instagram ads through the owner's OWN Meta ad account
 * (Marketing API; the API itself is free — the owner pays Meta for ad spend).
 *
 * Safety is the point of this file:
 * - Only an APPROVED concept with clean copy can be sent.
 * - The campaign, ad set and ad are all created PAUSED. Nothing runs and
 *   nothing is spent until the owner turns it on inside Meta's Ads Manager.
 * - A daily budget is required and capped (META_MAX_DAILY_CENTS, default
 *   $50), and the audience is a list of ZIP codes the owner typed.
 * - The token is sealed at rest and never returned.
 *
 * Needs META_APP_ID and META_APP_SECRET (a free app at developers.facebook.com
 * with the Marketing API product; redirect <site>/api/admin/muse/meta/callback).
 * Until Meta approves the app for Advanced Access, only people added as
 * testers/admins of the app can connect.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';
export const metaConfigured = () => !!(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim());
const redirectUri = () => appUrl('/api/admin/muse/meta/callback');
export const maxDailyCents = () => Math.max(500, Number(process.env.META_MAX_DAILY_CENTS) || 5000);
export class MetaError extends Error {}

export function metaAuthorizeUrl(state: string) {
  const p = new URLSearchParams({ client_id: process.env.META_APP_ID ?? '', redirect_uri: redirectUri(), state, scope: 'ads_management,pages_show_list,pages_read_engagement,business_management', response_type: 'code' });
  return `https://www.facebook.com/v21.0/dialog/oauth?${p}`;
}

async function graph<T>(path: string, token: string, opts: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string } };
  if (!res.ok || data.error) throw new MetaError(data.error?.error_user_msg ?? data.error?.message ?? `Meta said no (${res.status}).`);
  return data;
}

export async function getMeta(tenantId: string) {
  return (await db.select().from(metaConnections).where(eq(metaConnections.tenantId, tenantId)).limit(1))[0] ?? null;
}

type Edge<T> = { data?: T[] };

/** Finish the OAuth connect: exchange the code, upgrade to a long-lived token, pick the first ad account and page. */
export async function connectMeta(tenantId: string, userId: string | null, code: string, actor: Actor) {
  const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
  tokenUrl.search = new URLSearchParams({ client_id: process.env.META_APP_ID ?? '', client_secret: process.env.META_APP_SECRET ?? '', redirect_uri: redirectUri(), code }).toString();
  const short = (await (await fetch(tokenUrl, { signal: AbortSignal.timeout(15000) })).json().catch(() => ({}))) as { access_token?: string };
  if (!short.access_token) throw new MetaError('Meta did not accept that sign-in.');
  const longUrl = new URL(`${GRAPH}/oauth/access_token`);
  longUrl.search = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID ?? '', client_secret: process.env.META_APP_SECRET ?? '', fb_exchange_token: short.access_token }).toString();
  const long = (await (await fetch(longUrl, { signal: AbortSignal.timeout(15000) })).json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  const token = long.access_token ?? short.access_token;
  const accounts = (await graph<Edge<{ id: string; name: string }>>('/me/adaccounts', token, { query: { fields: 'id,name' } })).data ?? [];
  const pages = (await graph<Edge<{ id: string; name: string }>>('/me/accounts', token, { query: { fields: 'id,name' } })).data ?? [];
  const values = {
    userId,
    tokenSealed: seal(token),
    adAccountId: accounts[0]?.id ?? null,
    adAccountName: accounts[0]?.name ?? null,
    pageId: pages[0]?.id ?? null,
    pageName: pages[0]?.name ?? null,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
    updatedAt: new Date(),
  };
  const existing = await getMeta(tenantId);
  if (existing) await db.update(metaConnections).set(values).where(eq(metaConnections.id, existing.id));
  else await db.insert(metaConnections).values({ id: crypto.randomUUID(), tenantId, ...values });
  await logChange({ tenantId, actor, entityType: 'integration', entityId: tenantId, action: 'created', summary: 'Connected Facebook/Instagram ads' });
}

export async function metaChoices(tenantId: string) {
  const c = await getMeta(tenantId);
  if (!c) throw new MetaError('Connect Facebook first.');
  const token = unseal(c.tokenSealed)!;
  const [accounts, pages] = await Promise.all([
    graph<Edge<{ id: string; name: string }>>('/me/adaccounts', token, { query: { fields: 'id,name' } }),
    graph<Edge<{ id: string; name: string }>>('/me/accounts', token, { query: { fields: 'id,name' } }),
  ]);
  return { accounts: accounts.data ?? [], pages: pages.data ?? [], selected: { adAccountId: c.adAccountId, pageId: c.pageId } };
}

export async function chooseMeta(tenantId: string, adAccountId: string, pageId: string) {
  const choices = await metaChoices(tenantId);
  const a = choices.accounts.find((x) => x.id === adAccountId);
  const p = choices.pages.find((x) => x.id === pageId);
  if (!a || !p) throw new MetaError('Pick an ad account and a page from your own list.');
  await db.update(metaConnections).set({ adAccountId: a.id, adAccountName: a.name, pageId: p.id, pageName: p.name, updatedAt: new Date() }).where(eq(metaConnections.tenantId, tenantId));
}

export async function disconnectMeta(tenantId: string, actor: Actor) {
  await db.delete(metaConnections).where(eq(metaConnections.tenantId, tenantId));
  await logChange({ tenantId, actor, entityType: 'integration', entityId: tenantId, action: 'deleted', summary: 'Disconnected Facebook/Instagram ads' });
}

const zipList = (s: string | null | undefined) => [...new Set((s ?? '').split(/[\s,]+/).filter((z) => /^\d{5}$/.test(z)))].slice(0, 50);

/** Why this concept can't be sent yet (empty = ready). */
export function publishProblems(c: typeof adConcepts.$inferSelect, conn: typeof metaConnections.$inferSelect | null) {
  const p: string[] = [];
  if (!conn?.adAccountId || !conn.pageId) p.push('Connect your Facebook ad account and page first.');
  if (c.channel !== 'META') p.push('Only Facebook/Instagram ideas can be sent here.');
  if (c.status === 'PUBLISHED') p.push('Already sent to Facebook.');
  else if (c.status !== 'APPROVED') p.push('Approve the idea first.');
  p.push(...copyIssues(c));
  if (!zipList(c.zips).length) p.push('Add the ZIP codes to show it in (5 digits, separated by commas).');
  if (!c.dailyBudgetCents || c.dailyBudgetCents < 500) p.push('Set a daily budget of at least $5.');
  else if (c.dailyBudgetCents > maxDailyCents()) p.push(`The daily budget is capped at $${maxDailyCents() / 100} here.`);
  return p;
}

/** Create the campaign, ad set and ad in the owner's account — all paused. */
export async function publishPaused(tenantId: string, id: string, days: number, actor?: Actor) {
  const c = await getConcept(tenantId, id);
  const conn = await getMeta(tenantId);
  const problems = publishProblems(c, conn);
  if (problems.length) throw new MuseError(problems[0]);
  const token = unseal(conn!.tokenSealed)!;
  const act = conn!.adAccountId!.startsWith('act_') ? conn!.adAccountId! : `act_${conn!.adAccountId}`;
  const length = Math.min(30, Math.max(1, Math.round(days) || 7));
  const start = new Date(Date.now() + 3600_000);
  const end = new Date(start.getTime() + length * 86400_000);
  try {
    const campaign = await graph<{ id: string }>(`/${act}/campaigns`, token, { method: 'POST', body: { name: `${c.title} (Muse)`, objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: [] } });
    const adset = await graph<{ id: string }>(`/${act}/adsets`, token, {
      method: 'POST',
      body: {
        name: `${c.title} — ${zipList(c.zips).length} ZIPs`,
        campaign_id: campaign.id,
        daily_budget: c.dailyBudgetCents,
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        targeting: { geo_locations: { zips: zipList(c.zips).map((z) => ({ key: `US:${z}` })) }, age_min: 25, publisher_platforms: ['facebook', 'instagram'] },
        status: 'PAUSED',
      },
    });
    const creative = await graph<{ id: string }>(`/${act}/adcreatives`, token, {
      method: 'POST',
      body: {
        name: `${c.title} creative`,
        object_story_spec: {
          page_id: conn!.pageId,
          link_data: { message: c.primaryText, link: await tenantBookingLink(tenantId), name: c.headline, picture: imageUrlFor(c.imagePrompt, c.imageSeed, true), call_to_action: { type: 'LEARN_MORE', value: { link: await tenantBookingLink(tenantId) } } },
        },
      },
    });
    const ad = await graph<{ id: string }>(`/${act}/ads`, token, { method: 'POST', body: { name: c.title, adset_id: adset.id, creative: { creative_id: creative.id }, status: 'PAUSED' } });
    await db.update(adConcepts).set({ status: 'PUBLISHED', metaCampaignId: campaign.id, metaAdId: ad.id, updatedAt: new Date() }).where(eq(adConcepts.id, id));
    await logChange({ tenantId, actor, entityType: 'ad_concept', entityId: id, action: 'updated', summary: `Sent “${c.title}” to Facebook as a paused ad` });
    return { campaignId: campaign.id, adId: ad.id, adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act.replace('act_', '')}` };
  } catch (err) {
    if (err instanceof MetaError) throw new MuseError(`Facebook said: ${err.message}`);
    throw err;
  }
}
