import { db } from '@/db/client';
import { bookings, campaigns, quotes, recurringSeries, tenants, users } from '@/db/schema';
import { and, desc, eq, gte, inArray, ne } from 'drizzle-orm';
import { lapsedClients, claimSend, renderTemplate } from '@/lib/automations';
import { sendEmail, simpleEmail, emailConfigured } from '@/lib/email';
import { unsubscribeUrl } from '@/lib/unsubscribe';
import { appUrl } from '@/lib/url';
import { addDays } from '@/lib/recurring';
import { businessTodayISO } from '@/lib/time';
import { logChange } from '@/lib/audit';

/**
 * Marketing (Admin → Marketing): one-off email campaigns to a segment of
 * clients. Marketing email always carries an unsubscribe link and skips
 * anyone who used it; reminders and invoices are separate and unaffected.
 */

export type Segment = 'ALL_ACTIVE' | 'LAPSED' | 'RECURRING' | 'ONE_TIME' | 'LEADS';

export const SEGMENTS: { key: Segment; label: string; detail: string }[] = [
  { key: 'ALL_ACTIVE', label: 'All active clients', detail: 'Anyone with a clean in the last year or one booked' },
  { key: 'RECURRING', label: 'Recurring clients', detail: 'On a repeating schedule right now' },
  { key: 'ONE_TIME', label: 'One-time clients', detail: 'Had a clean, not on a repeating schedule' },
  { key: 'LAPSED', label: 'Lapsed clients', detail: 'Last clean longer ago than your “lapsed after” setting, nothing booked' },
  { key: 'LEADS', label: 'Leads who haven’t booked', detail: 'Asked for a walkthrough or quote, never had a clean' },
];

export class MarketingError extends Error {
  status = 400;
}

async function clientIdsFor(tenantId: string, segment: Segment): Promise<string[]> {
  const today = businessTodayISO();
  const real = await db
    .select({ clientId: bookings.clientId, slotStart: bookings.slotStart, status: bookings.status })
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.isQuoteVisit, false), ne(bookings.status, 'CANCELLED')));
  const series = new Set(
    (await db.select({ clientId: recurringSeries.clientId }).from(recurringSeries).where(and(eq(recurringSeries.tenantId, tenantId), eq(recurringSeries.status, 'ACTIVE')))).map(
      (s) => s.clientId,
    ),
  );
  if (segment === 'RECURRING') return Array.from(series);
  if (segment === 'ALL_ACTIVE') {
    const since = addDays(today, -365);
    return [...new Set(real.filter((b) => b.slotStart.slice(0, 10) >= since).map((b) => b.clientId))];
  }
  if (segment === 'ONE_TIME') {
    return [...new Set(real.filter((b) => b.status === 'COMPLETED').map((b) => b.clientId))].filter((id) => !series.has(id));
  }
  if (segment === 'LAPSED') {
    const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
    return (await lapsedClients(tenantId, tenant?.winbackDays ?? 60, today)).map((l) => l.clientId);
  }
  // LEADS: a walkthrough or a quote, and never a real booking.
  const booked = new Set(real.map((b) => b.clientId));
  const walk = await db.select({ clientId: bookings.clientId }).from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.isQuoteVisit, true)));
  const quoted = await db.select({ clientId: quotes.clientId }).from(quotes).where(eq(quotes.tenantId, tenantId));
  return [...new Set([...walk, ...quoted].map((r) => r.clientId))].filter((id) => !booked.has(id));
}

/** Who a campaign to this segment would reach: has an email, active, not unsubscribed. */
export async function segmentRecipients(tenantId: string, segment: Segment) {
  const ids = await clientIdsFor(tenantId, segment);
  if (!ids.length) return [];
  const rows = await db.select().from(users).where(and(eq(users.tenantId, tenantId), inArray(users.id, ids), eq(users.role, 'CUSTOMER')));
  return rows.filter((u) => u.isActive && !!u.email && !u.marketingOptOut);
}

export async function segmentCounts(tenantId: string) {
  const out = {} as Record<Segment, number>;
  for (const s of SEGMENTS) out[s.key] = (await segmentRecipients(tenantId, s.key)).length;
  return out;
}

export async function listCampaigns(tenantId: string) {
  return db.select().from(campaigns).where(eq(campaigns.tenantId, tenantId)).orderBy(desc(campaigns.createdAt));
}

type Draft = { name: string; segment: Segment; subject: string; body: string };

function check(d: Partial<Draft>) {
  if (d.name !== undefined && !d.name.trim()) throw new MarketingError('Give the campaign a name.');
  if (d.subject !== undefined && !d.subject.trim()) throw new MarketingError('Add a subject line.');
  if (d.body !== undefined && d.body.trim().length < 10) throw new MarketingError('Write the message first.');
  if (d.segment !== undefined && !SEGMENTS.some((s) => s.key === d.segment)) throw new MarketingError('Pick who it goes to.');
}

export async function createCampaign(tenantId: string, d: Draft, actor?: { id: string; name: string }) {
  check(d);
  const id = crypto.randomUUID();
  await db.insert(campaigns).values({ id, tenantId, name: d.name.trim(), segment: d.segment, subject: d.subject.trim(), body: d.body.trim() });
  await logChange({ tenantId, actor, entityType: 'campaign', entityId: id, action: 'created', summary: `Drafted campaign “${d.name.trim()}”` });
  return id;
}

export async function updateCampaign(tenantId: string, id: string, d: Partial<Draft>) {
  check(d);
  const row = (await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId))).limit(1))[0];
  if (!row) throw new MarketingError('Campaign not found.');
  if (row.status !== 'DRAFT') throw new MarketingError('This campaign has already gone out.');
  await db
    .update(campaigns)
    .set({
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(d.segment !== undefined ? { segment: d.segment } : {}),
      ...(d.subject !== undefined ? { subject: d.subject.trim() } : {}),
      ...(d.body !== undefined ? { body: d.body.trim() } : {}),
    })
    .where(eq(campaigns.id, id));
}

export async function deleteCampaign(tenantId: string, id: string) {
  const row = (await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId))).limit(1))[0];
  if (!row) throw new MarketingError('Campaign not found.');
  if (row.status !== 'DRAFT') throw new MarketingError('Sent campaigns stay on record.');
  await db.delete(campaigns).where(eq(campaigns.id, id));
}

/**
 * Sends a draft to its segment. The draft is flipped to SENT first, in one
 * conditional update, so a double-click can't send it twice; each
 * recipient is also claimed in automation_sends.
 */
export async function sendCampaign(tenantId: string, id: string, actor?: { id: string; name: string }) {
  if (!emailConfigured()) throw new MarketingError('Email isn’t connected yet. Add your Resend key (Settings → Integrations) before sending a campaign.');
  const flipped = await db
    .update(campaigns)
    .set({ status: 'SENT', sentAt: new Date() })
    .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId), eq(campaigns.status, 'DRAFT')))
    .returning();
  const campaign = flipped[0];
  if (!campaign) throw new MarketingError('This campaign has already gone out.');
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0]!;
  const recipients = await segmentRecipients(tenantId, campaign.segment);
  let sent = 0;
  for (const u of recipients) {
    if (!(await claimSend(tenantId, 'campaign', `${campaign.id}:${u.id}`))) continue;
    const vars = { firstName: u.name.split(/[\s(]/)[0], company: tenant.name, bookingLink: appUrl('/account') };
    const ok = await sendEmail({
      to: u.email!,
      subject: renderTemplate(campaign.subject, vars),
      html: simpleEmail({
        brandName: tenant.name,
        heading: renderTemplate(campaign.subject, vars),
        body: renderTemplate(campaign.body, vars),
        footer: `— ${tenant.name}. Don't want news and offers? Unsubscribe: ${unsubscribeUrl(u.id)}`,
      }),
    });
    if (ok) sent += 1;
  }
  await db.update(campaigns).set({ sentCount: sent }).where(eq(campaigns.id, campaign.id));
  await logChange({ tenantId, actor, entityType: 'campaign', entityId: campaign.id, action: 'sent', summary: `Sent “${campaign.name}” to ${sent} client${sent === 1 ? '' : 's'}` });
  return { sent, audience: recipients.length };
}

/** The numbers at the top of the Marketing page. */
export async function growthSnapshot(tenantId: string) {
  const counts = await segmentCounts(tenantId);
  const since = new Date(Date.now() - 30 * 86400_000);
  const newClients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'CUSTOMER'), gte(users.createdAt, since)));
  const unsubscribed = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'CUSTOMER'), eq(users.marketingOptOut, true)));
  return { counts, newLast30: newClients.length, unsubscribed: unsubscribed.length };
}
