import { randomBytes } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { standbyRequests, serviceTypes, addresses } from '@/db/schema';
import { bookableTeams } from '@/lib/capacity';
import { getBookingsForCrewOnOrAfter, getUserById } from '@/lib/data';
import { generateDaySlots, formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { createBooking, DoubleBookingError, sendBookingConfirmationEmails } from '@/lib/bookings';
import { notifyClient } from '@/lib/notify';
import { standbyOfferEmail, standbyOfferText, localizedServiceName } from '@/lib/email';
import { intlLocale, type Locale } from '@/lib/i18n';
import { appUrl } from '@/lib/url';

export class StandbyError extends Error {}

/**
 * Standby / waitlist: "I'd rather have this day." Created from the
 * booking wizard when a client's first-choice day has nothing open and
 * they book an alternative day instead (components/BookingCalendar.tsx).
 * Whenever a booking is cancelled or moved off a date (lib/bookings.ts
 * cancelBookingByClient, lib/dispatch.ts rescheduleBooking, the admin
 * cancel route), checkStandbyForFreedDate() looks for the oldest WAITING
 * request on that date that a newly-free slot can actually satisfy, and
 * makes a time-boxed offer — a capability-token link, the same pattern
 * as estimate approval (lib/estimates.ts). If it's declined or expires
 * unclaimed, the next WAITING request for that date gets offered the
 * same slot.
 */

const OFFER_WINDOW_HOURS = 24;

function offerUrl(token: string) {
  return appUrl(`/standby/${token}`);
}

/** Called from the booking wizard when the client takes an alternative day but wants to be held for their first choice too. */
export async function createStandbyRequest(input: {
  tenantId: string;
  clientId: string;
  serviceTypeId: string;
  addressId?: string;
  preferredDate: string; // YYYY-MM-DD
  cadence: 'ONE_TIME' | 'BIWEEKLY' | 'MONTHLY';
}): Promise<string> {
  // One open standby per (client, service, date) — asking twice just
  // confirms the existing hold rather than stacking duplicates.
  const existing = (
    await db
      .select()
      .from(standbyRequests)
      .where(
        and(
          eq(standbyRequests.clientId, input.clientId),
          eq(standbyRequests.serviceTypeId, input.serviceTypeId),
          eq(standbyRequests.preferredDate, input.preferredDate),
        ),
      )
  ).find((r) => r.status === 'WAITING' || r.status === 'OFFERED');
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db.insert(standbyRequests).values({
    id,
    tenantId: input.tenantId,
    clientId: input.clientId,
    serviceTypeId: input.serviceTypeId,
    addressId: input.addressId,
    preferredDate: input.preferredDate,
    cadence: input.cadence,
    status: 'WAITING',
  });
  return id;
}

export async function getStandbyRequestsForClient(clientId: string) {
  return db.select().from(standbyRequests).where(eq(standbyRequests.clientId, clientId));
}

export async function cancelStandbyRequest(id: string, clientId: string): Promise<void> {
  const row = (await db.select().from(standbyRequests).where(eq(standbyRequests.id, id)).limit(1))[0];
  if (!row || row.clientId !== clientId) throw new StandbyError('Not found');
  if (row.status === 'BOOKED') throw new StandbyError('This standby request already turned into a booking.');
  await db.update(standbyRequests).set({ status: 'CANCELLED' }).where(eq(standbyRequests.id, id));
}

/**
 * A slot just freed up on `dateISO` (a cancellation, or a booking moved
 * off that date). Finds the oldest WAITING standby request for that date
 * that the business can actually satisfy — real team availability, not a
 * guess — and offers it. One offer per call: if several requests are
 * waiting on the same date, the rest stay WAITING until this one is
 * declined/expires (cascadeStandbyOffer) or more capacity frees up.
 */
export async function checkStandbyForFreedDate(tenantId: string, dateISO: string): Promise<void> {
  const waiting = (
    await db
      .select()
      .from(standbyRequests)
      .where(and(eq(standbyRequests.tenantId, tenantId), eq(standbyRequests.preferredDate, dateISO), eq(standbyRequests.status, 'WAITING')))
  ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const request of waiting) {
    const offered = await tryOfferDate(request);
    if (offered) return; // oldest satisfiable request wins; stop here
  }
}

/** After a decline or expiry, give the same date another shot for the next person waiting. */
async function cascadeStandbyOffer(tenantId: string, dateISO: string): Promise<void> {
  await checkStandbyForFreedDate(tenantId, dateISO);
}

async function tryOfferDate(request: typeof standbyRequests.$inferSelect): Promise<boolean> {
  const service = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, request.serviceTypeId)).limit(1))[0];
  if (!service) return false;

  for (const team of await bookableTeams(request.tenantId)) {
    const existing = (await getBookingsForCrewOnOrAfter(team.id)).filter((b) => !b.isQuoteVisit);
    const slots = generateDaySlots(team, service.defaultDurationMinutes, request.preferredDate, existing);
    const open = slots.find((s) => s.available);
    if (!open) continue;

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + OFFER_WINDOW_HOURS * 60 * 60 * 1000);
    await db
      .update(standbyRequests)
      .set({ status: 'OFFERED', offerToken: token, offerCrewId: team.id, offerSlotStart: open.start, offerSlotEnd: open.end, offerExpiresAt: expiresAt })
      .where(eq(standbyRequests.id, request.id));

    const client = await getUserById(request.clientId);
    if (client) {
      const locale: Locale = client.locale === 'es' ? 'es' : 'en';
      const serviceName = localizedServiceName(locale, service.name, service.key);
      const dateLabel = formatDateLabel(request.preferredDate, locale);
      const timeLabel = formatSlotLabel(open.start, open.end, locale);
      const url = offerUrl(token);
      await notifyClient({
        tenantId: request.tenantId,
        client,
        triggerEvent: 'STANDBY_OFFER',
        text: standbyOfferText({ serviceName, dateLabel, timeLabel, url, locale }),
        email: standbyOfferEmail({
          name: client.name,
          serviceName,
          dateLabel,
          timeLabel,
          url,
          expiresLabel:
            locale === 'es'
              ? expiresAt.toLocaleString(intlLocale('es'), { weekday: 'long', hour: 'numeric', minute: '2-digit' })
              : expiresAt.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }),
          locale,
        }),
      });
    }
    return true;
  }
  return false;
}

export type StandbyOfferView = {
  request: typeof standbyRequests.$inferSelect;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  expired: boolean;
};

export async function getStandbyOfferByToken(token: string): Promise<StandbyOfferView | null> {
  const request = (await db.select().from(standbyRequests).where(eq(standbyRequests.offerToken, token)).limit(1))[0];
  if (!request) return null;
  const service = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, request.serviceTypeId)).limit(1))[0];
  const expired = request.status === 'OFFERED' && (!request.offerExpiresAt || request.offerExpiresAt.getTime() < Date.now());
  return {
    request,
    serviceName: service?.name ?? 'Cleaning',
    dateLabel: formatDateLabel(request.preferredDate),
    timeLabel: request.offerSlotStart && request.offerSlotEnd ? formatSlotLabel(request.offerSlotStart, request.offerSlotEnd) : '',
    expired,
  };
}

/**
 * The client clicks "Claim this spot": re-verifies the exact offered slot
 * is still free (someone else may have booked it directly in the
 * meantime) and books it through the normal createBooking path — same
 * double-booking protection, same checklist instantiation, same
 * confirmation email, as any other booking.
 */
export async function acceptStandbyOffer(token: string): Promise<{ bookingId: string }> {
  const request = (await db.select().from(standbyRequests).where(eq(standbyRequests.offerToken, token)).limit(1))[0];
  if (!request) throw new StandbyError('This link is not valid.');
  if (request.status === 'BOOKED') throw new StandbyError('This spot was already booked.');
  if (request.status !== 'OFFERED') throw new StandbyError('This offer is no longer available.');
  if (!request.offerExpiresAt || request.offerExpiresAt.getTime() < Date.now()) {
    await expireOffer(request);
    throw new StandbyError('This offer has expired — we\'ve offered it to the next person waiting.');
  }
  if (!request.offerCrewId || !request.offerSlotStart || !request.offerSlotEnd) {
    throw new StandbyError('This offer is incomplete — please contact us.');
  }

  const service = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, request.serviceTypeId)).limit(1))[0];
  if (!service) throw new StandbyError('Service not found.');

  try {
    const bookingId = await createBooking({
      tenantId: request.tenantId,
      clientId: request.clientId,
      serviceTypeId: request.serviceTypeId,
      crewId: request.offerCrewId,
      addressId: request.addressId ?? undefined,
      slotStart: request.offerSlotStart,
      slotEnd: request.offerSlotEnd,
      cadence: request.cadence,
    });

    await db
      .update(standbyRequests)
      .set({ status: 'BOOKED', resultingBookingId: bookingId, respondedAt: new Date() })
      .where(eq(standbyRequests.id, request.id));

    const address = request.addressId
      ? (await db.select().from(addresses).where(eq(addresses.id, request.addressId)).limit(1))[0]
      : undefined;
    try {
      await sendBookingConfirmationEmails({
        tenantId: request.tenantId,
        bookingId,
        clientId: request.clientId,
        serviceName: service.name,
        serviceKey: service.key,
        slotStart: request.offerSlotStart,
        slotEnd: request.offerSlotEnd,
        priceCents: null,
        address,
      });
    } catch (err) {
      console.error('[standby] confirmation email failed', err);
    }

    return { bookingId };
  } catch (err) {
    if (err instanceof DoubleBookingError) {
      // Someone booked that exact slot directly in the meantime — give
      // the date another shot for the next person waiting.
      await expireOffer(request);
      throw new StandbyError('That spot was just taken. We\'ll keep watching for another opening.');
    }
    throw err;
  }
}

export async function declineStandbyOffer(token: string): Promise<void> {
  const request = (await db.select().from(standbyRequests).where(eq(standbyRequests.offerToken, token)).limit(1))[0];
  if (!request || request.status !== 'OFFERED') return;
  await db.update(standbyRequests).set({ status: 'CANCELLED', respondedAt: new Date() }).where(eq(standbyRequests.id, request.id));
  await cascadeStandbyOffer(request.tenantId, request.preferredDate);
}

async function expireOffer(request: typeof standbyRequests.$inferSelect): Promise<void> {
  await db.update(standbyRequests).set({ status: 'EXPIRED' }).where(eq(standbyRequests.id, request.id));
  await cascadeStandbyOffer(request.tenantId, request.preferredDate);
}

/** Daily cron sweep (app/api/cron/reminders/route.ts): expire stale offers and give the date to the next person waiting. */
export async function expireStaleStandbyOffers(): Promise<{ expired: number }> {
  const stale = (await db.select().from(standbyRequests).where(eq(standbyRequests.status, 'OFFERED'))).filter(
    (r) => r.offerExpiresAt && r.offerExpiresAt.getTime() < Date.now(),
  );
  for (const r of stale) await expireOffer(r);
  return { expired: stale.length };
}
