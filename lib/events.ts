import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { addresses, bookings, invoices, jobs, reviews, serviceTypes, users } from '@/db/schema';
import { syncTenantCalendars } from '@/lib/googleCalendar';
import { emitEvent, hasSubscriber, processDueDeliveries, type WebhookEventType } from '@/lib/webhooks';

/**
 * The business events other tools can listen for (lib/webhooks.ts), with
 * the JSON each one carries. Payloads hold what a Zap or CRM would use —
 * ids, names, contact details, times, amounts — and never anything
 * private to the home (entry codes, alarm codes, room notes).
 *
 * Each helper is fire-and-forget safe: it never throws, so the action
 * that triggered it can't fail because of a webhook.
 */

async function clientData(clientId: string) {
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, clientId)).limit(1);
  return u ?? null;
}

async function bookingData(bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!b) return null;
  const [service] = b.serviceTypeId ? await db.select({ name: serviceTypes.name, key: serviceTypes.key }).from(serviceTypes).where(eq(serviceTypes.id, b.serviceTypeId)).limit(1) : [];
  const [addr] = b.addressId ? await db.select({ line1: addresses.line1, city: addresses.city, state: addresses.state, zip: addresses.zip }).from(addresses).where(eq(addresses.id, b.addressId)).limit(1) : [];
  return {
    tenantId: b.tenantId,
    booking: {
      id: b.id,
      status: b.status.toLowerCase(),
      kind: b.isQuoteVisit ? 'walkthrough' : 'cleaning',
      service: service?.name ?? null,
      service_key: service?.key ?? null,
      starts_at: b.slotStart,
      ends_at: b.slotEnd,
      cadence: b.cadence.toLowerCase(),
      recurring_series_id: b.seriesId,
      price_cents: b.priceCents,
      address: addr ? { line1: addr.line1, city: addr.city, state: addr.state, zip: addr.zip } : null,
      client: await clientData(b.clientId),
    },
  };
}

type SendOpts = { sendNow?: boolean };

async function send(tenantId: string | null | undefined, type: WebhookEventType, data: Record<string, unknown> | null, opts?: SendOpts) {
  if (!tenantId || !data) return;
  await emitEvent(tenantId, type, data, opts);
}

async function safely(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error('[events] could not build event', err);
  }
}

async function bookingTenant(bookingId: string) {
  return (await db.select({ t: bookings.tenantId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1))[0]?.t ?? null;
}

async function listening(tenantId: string | null, type: WebhookEventType) {
  return !!tenantId && (await hasSubscriber(tenantId, type));
}

export const bookingEvent = (type: 'booking.created' | 'booking.cancelled', bookingId: string, opts?: SendOpts) =>
  safely(async () => {
    if (!(await listening(await bookingTenant(bookingId), type))) return;
    const d = await bookingData(bookingId);
    if (d) await send(d.tenantId, type, { booking: d.booking }, opts);
  });

/** A lead from the site's own request form (a walkthrough booking). */
export const walkthroughLeadEvent = (bookingId: string) =>
  safely(async () => {
    if (!(await listening(await bookingTenant(bookingId), 'lead.created'))) return;
    const d = await bookingData(bookingId);
    if (d) await send(d.tenantId, 'lead.created', { lead: { source: 'website', client: d.booking.client, service: d.booking.service, address: d.booking.address, walkthrough: { id: d.booking.id, starts_at: d.booking.starts_at, ends_at: d.booking.ends_at } } });
  });

export const jobEvent = (type: 'job.started' | 'job.completed', jobId: string) =>
  safely(async () => {
    const [j] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!j || !(await listening(await bookingTenant(j.bookingId), type))) return;
    const d = await bookingData(j.bookingId);
    if (!d) return;
    await send(d.tenantId, type, {
      job: { id: j.id, status: j.status.toLowerCase(), crew_id: j.crewId, started_at: j.startedAt?.toISOString() ?? null, completed_at: j.completedAt?.toISOString() ?? null },
      booking: d.booking,
    });
  });

export const invoiceEvent = (type: 'invoice.sent' | 'invoice.paid', invoiceId: string) =>
  safely(async () => {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!inv || !(await listening(inv.tenantId, type))) return;
    await send(inv.tenantId, type, {
      invoice: {
        id: inv.id,
        number: inv.invoiceNumber,
        status: inv.status.toLowerCase(),
        total_cents: inv.totalCents,
        tip_cents: inv.tipCents,
        booking_id: inv.bookingId,
        hosted_url: inv.hostedInvoiceUrl,
        sent_at: inv.sentAt?.toISOString() ?? null,
        paid_at: inv.paidAt?.toISOString() ?? null,
        client: await clientData(inv.clientId),
      },
    });
  });

export const reviewEvent = (reviewId: string) =>
  safely(async () => {
    const [r] = await db.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
    if (!r || !(await listening(r.tenantId, 'review.created'))) return;
    await send(r.tenantId, 'review.created', {
      review: { id: r.id, rating: r.rating, comment: r.comment, booking_id: r.bookingId, created_at: r.createdAt.toISOString(), client: await clientData(r.clientId) },
    });
  });

/** Generic: a payload already built by the caller (inbound leads). */
export const rawEvent = (tenantId: string, type: WebhookEventType, data: Record<string, unknown>) => safely(() => send(tenantId, type, data));

/** Several visits cancelled at once (a series paused, ended or changed). */
export const bookingsCancelled = (tenantId: string, bookingIds: string[]) =>
  safely(async () => {
    if (!bookingIds.length || !(await listening(tenantId, 'booking.cancelled'))) return;
    for (const id of bookingIds) await bookingEvent('booking.cancelled', id, { sendNow: false });
    await processDueDeliveries({ tenantId, limit: bookingIds.length + 10 });
  });

/** After a batch of queued events: send them. */
export const flushEvents = (tenantId: string) =>
  safely(async () => {
    await processDueDeliveries({ tenantId, limit: 100 });
  });

/**
 * Something on the schedule moved, was added, cancelled or restaffed:
 * bring connected Google Calendars in step (lib/googleCalendar.ts). A
 * no-op unless someone in the company connected a calendar.
 */
export const scheduleChanged = (tenantId: string | null | undefined) =>
  safely(async () => {
    if (tenantId) await syncTenantCalendars(tenantId);
  });
