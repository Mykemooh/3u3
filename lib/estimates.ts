import { appUrl } from '@/lib/url';
import { randomBytes } from 'crypto';
import { db } from '@/db/client';
import { quotes, quoteItems, bookings, users, serviceTypes, clientRates, addresses } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getOwnerEmail } from '@/lib/data';
import { logNotification } from '@/lib/bookings';
import {
  sendEmail,
  estimateEmail,
  estimateRespondedOwnerEmail,
} from '@/lib/email';

export class EstimateError extends Error {}

// 30 days is the industry-normal validity window for a residential cleaning
// estimate, and it keeps a stale price from being approved months later at
// a rate that no longer covers the work.
const VALID_FOR_DAYS = 30;

/**
 * The public URL a client uses to approve or decline. Built from
 * NEXTAUTH_URL, which is already required for auth to work in every
 * environment — so there's no new env var to set for this feature.
 */
export function estimateUrl(token: string) {
  return appUrl(`/estimate/${token}`);
}

/**
 * Creates the DRAFT estimate an admin fills in after a walkthrough. When it
 * comes from a quote visit we carry that booking's service type across, so
 * the admin starts from what the client actually asked about. Idempotent
 * per quote visit: coming back to the same lead reopens the existing draft
 * instead of starting a second one.
 */
export async function createDraftEstimate(input: {
  tenantId: string;
  clientId: string;
  serviceTypeId: string;
  quoteVisitBookingId?: string;
}): Promise<string> {
  if (input.quoteVisitBookingId) {
    const existing = (
      await db
        .select()
        .from(quotes)
        .where(eq(quotes.quoteVisitBookingId, input.quoteVisitBookingId))
        .limit(1)
    )[0];
    if (existing) return existing.id;
  }

  const service = (
    await db.select().from(serviceTypes).where(eq(serviceTypes.id, input.serviceTypeId)).limit(1)
  )[0];
  if (!service) throw new EstimateError('Service not found');
  if (service.tenantId !== input.tenantId) throw new EstimateError('Service belongs to another business');

  const quoteId = crypto.randomUUID();
  await db.insert(quotes).values({
    id: quoteId,
    tenantId: input.tenantId,
    clientId: input.clientId,
    quoteVisitBookingId: input.quoteVisitBookingId,
    serviceTypeId: input.serviceTypeId,
    status: 'DRAFT',
    totalCents: 0,
  });

  // One empty priced line to start from — the admin fills in the number
  // from the walkthrough. Never pre-fill an amount we'd be guessing at.
  await db.insert(quoteItems).values({
    id: crypto.randomUUID(),
    quoteId,
    description: service.name,
    amountCents: 0,
    sortOrder: 0,
  });

  return quoteId;
}

export async function getEstimateWithItems(quoteId: string) {
  const quote = (await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1))[0];
  if (!quote) return null;
  return hydrate(quote);
}

export async function getEstimateByToken(token: string) {
  const quote = (await db.select().from(quotes).where(eq(quotes.approvalToken, token)).limit(1))[0];
  if (!quote) return null;
  return hydrate(quote);
}

async function hydrate(quote: typeof quotes.$inferSelect) {
  const items = (await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quote.id))).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const client = (await db.select().from(users).where(eq(users.id, quote.clientId)).limit(1))[0];
  const service = (
    await db.select().from(serviceTypes).where(eq(serviceTypes.id, quote.serviceTypeId)).limit(1)
  )[0];
  const visit = quote.quoteVisitBookingId
    ? (await db.select().from(bookings).where(eq(bookings.id, quote.quoteVisitBookingId)).limit(1))[0]
    : undefined;
  const clientAddresses = client
    ? await db.select().from(addresses).where(eq(addresses.userId, client.id))
    : [];
  return { quote, items, client, service, visit, address: clientAddresses[0] };
}

export async function getEstimatesForTenant(tenantId: string) {
  return db.select().from(quotes).where(eq(quotes.tenantId, tenantId)).orderBy(desc(quotes.createdAt));
}

export async function getEstimatesForClient(clientId: string) {
  return db.select().from(quotes).where(eq(quotes.clientId, clientId)).orderBy(desc(quotes.createdAt));
}

/** Replaces a draft estimate's line items and notes wholesale. Draft only. */
export async function updateDraftEstimate(
  quoteId: string,
  input: { items: { description: string; amountCents: number }[]; notes?: string; serviceTypeId?: string },
) {
  const quote = (await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1))[0];
  if (!quote) throw new EstimateError('Estimate not found');
  if (quote.status !== 'DRAFT') throw new EstimateError('Only a draft estimate can be edited');
  if (input.items.length === 0) throw new EstimateError('An estimate needs at least one line item');

  if (input.serviceTypeId && input.serviceTypeId !== quote.serviceTypeId) {
    const service = (
      await db.select().from(serviceTypes).where(eq(serviceTypes.id, input.serviceTypeId)).limit(1)
    )[0];
    if (!service || service.tenantId !== quote.tenantId) throw new EstimateError('Service not found');
  }

  await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  for (let i = 0; i < input.items.length; i += 1) {
    await db.insert(quoteItems).values({
      id: crypto.randomUUID(),
      quoteId,
      description: input.items[i].description,
      amountCents: Math.max(0, Math.round(input.items[i].amountCents)),
      sortOrder: i,
    });
  }

  const totalCents = input.items.reduce((sum, i) => sum + Math.max(0, Math.round(i.amountCents)), 0);
  await db
    .update(quotes)
    .set({
      totalCents,
      notes: input.notes ?? quote.notes,
      serviceTypeId: input.serviceTypeId ?? quote.serviceTypeId,
    })
    .where(eq(quotes.id, quoteId));

  return totalCents;
}

/**
 * Sends the estimate to the client: mints the one-click approval token,
 * marks it SENT, and emails Approve / Decline buttons. Re-sending an
 * already-sent estimate reuses the same token and expiry so any link the
 * client already has keeps working.
 */
export async function sendEstimate(quoteId: string): Promise<{ url: string; emailed: boolean }> {
  const data = await getEstimateWithItems(quoteId);
  if (!data) throw new EstimateError('Estimate not found');
  const { quote, items, client, service } = data;

  if (quote.status === 'APPROVED') throw new EstimateError('This estimate was already approved');
  if (quote.status === 'DECLINED') throw new EstimateError('This estimate was declined');
  if (quote.totalCents <= 0) throw new EstimateError('Add a price before sending this estimate');

  const token = quote.approvalToken ?? randomBytes(32).toString('hex');
  const expiresAt = quote.expiresAt ?? new Date(Date.now() + VALID_FOR_DAYS * 24 * 60 * 60 * 1000);

  await db
    .update(quotes)
    .set({ approvalToken: token, status: 'SENT', sentAt: quote.sentAt ?? new Date(), expiresAt })
    .where(eq(quotes.id, quoteId));

  const url = estimateUrl(token);
  let emailed = false;

  if (client?.email) {
    const { subject, html } = estimateEmail({
      name: client.name,
      serviceName: service?.name ?? 'Cleaning service',
      totalCents: quote.totalCents,
      items,
      notes: quote.notes ?? undefined,
      url,
      expiresAt,
    });
    emailed = await sendEmail({ to: client.email, subject, html });
  }

  await logNotification({
    tenantId: quote.tenantId,
    channel: 'EMAIL',
    recipient: client?.email ?? client?.phone ?? 'customer',
    triggerEvent: 'ESTIMATE_SENT_CUSTOMER',
    relatedBookingId: quote.quoteVisitBookingId ?? undefined,
  });

  return { url, emailed };
}

/**
 * The client's one-click answer. Approving writes the agreed rate into
 * client_rates for this (client, service) pair, which is the same table the
 * returning-customer booking flow reads — so the moment they approve, real
 * bookable slots at the approved price open up to them with no admin step
 * in between. Idempotent: clicking the link twice doesn't double-fire.
 */
export async function respondToEstimate(token: string, action: 'APPROVE' | 'DECLINE') {
  const data = await getEstimateByToken(token);
  if (!data) throw new EstimateError('This estimate link is not valid');
  const { quote, items, client, service } = data;

  if (quote.status === 'APPROVED' || quote.status === 'DECLINED') {
    // Already answered — report the existing outcome rather than erroring,
    // so a second click on an emailed link isn't a dead end.
    return { status: quote.status, alreadyAnswered: true as const };
  }
  if (quote.status === 'DRAFT') throw new EstimateError('This estimate has not been sent yet');
  if (quote.expiresAt && quote.expiresAt.getTime() < Date.now()) {
    await db.update(quotes).set({ status: 'EXPIRED' }).where(eq(quotes.id, quote.id));
    throw new EstimateError('This estimate has expired — please contact us for an updated price');
  }

  const status = action === 'APPROVE' ? 'APPROVED' : 'DECLINED';
  await db.update(quotes).set({ status, respondedAt: new Date() }).where(eq(quotes.id, quote.id));

  if (action === 'APPROVE') {
    // Upsert, because a client can be re-quoted for a service they already
    // have a rate on file for — the newly approved price wins.
    const existing = (
      await db
        .select()
        .from(clientRates)
        .where(and(eq(clientRates.userId, quote.clientId), eq(clientRates.serviceTypeId, quote.serviceTypeId)))
        .limit(1)
    )[0];
    if (existing) {
      await db.update(clientRates).set({ rateCents: quote.totalCents }).where(eq(clientRates.id, existing.id));
    } else {
      await db.insert(clientRates).values({
        id: crypto.randomUUID(),
        userId: quote.clientId,
        serviceTypeId: quote.serviceTypeId,
        rateCents: quote.totalCents,
      });
    }
  }

  const ownerEmail = await getOwnerEmail(quote.tenantId);
  if (ownerEmail) {
    const { subject, html } = estimateRespondedOwnerEmail({
      clientName: client?.name ?? 'A client',
      clientPhone: client?.phone ?? undefined,
      serviceName: service?.name ?? 'Cleaning service',
      totalCents: quote.totalCents,
      items,
      approved: action === 'APPROVE',
    });
    await sendEmail({ to: ownerEmail, subject, html });
  }

  await logNotification({
    tenantId: quote.tenantId,
    channel: 'EMAIL',
    recipient: ownerEmail ?? 'owner',
    triggerEvent: action === 'APPROVE' ? 'ESTIMATE_APPROVED_OWNER_ALERT' : 'ESTIMATE_DECLINED_OWNER_ALERT',
    relatedBookingId: quote.quoteVisitBookingId ?? undefined,
  });

  return { status, alreadyAnswered: false as const };
}
