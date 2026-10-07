import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { createSeries } from '@/lib/recurring';
import { createBooking, sendBookingConfirmationEmails } from '@/lib/bookings';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { statusApiError } from '@/lib/api';
import { logChange } from '@/lib/audit';
import { db } from '@/db/client';
import { serviceTypes, addresses } from '@/db/schema';
import { eq } from 'drizzle-orm';

const schema = z.object({
  clientId: z.string(),
  serviceTypeId: z.string(),
  crewId: z.string(),
  addressId: z.string().nullish(),
  pattern: z.enum(['ONE_TIME', 'WEEKLY', 'EVERY_2_WEEKS', 'EVERY_4_WEEKS', 'MONTHLY_NTH_WEEKDAY', 'CUSTOM_WEEKDAYS']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  weekdays: z.string().nullish(),
  startMinutes: z.number().int().min(0).max(24 * 60),
  durationMinutes: z.number().int().min(15).max(16 * 60),
  priceCents: z.number().int().min(0).nullish(),
  templateId: z.string().nullish(),
  notes: z.string().max(2000).nullish(),
  skipHolidays: z.boolean().optional(),
  sendConfirmation: z.boolean().optional(),
});

const slot = (date: string, min: number) => `${date}T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

/** "Schedule a clean": one visit, or a recurring series. */
export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Some details are missing — check client, service, team, date and time.' }, { status: 400 });
  const input = parsed.data;
  if (!(await belongsTo(admin.tenantId, 'user', input.clientId))) return notFound();
  const actor = { id: admin.userId, name: admin.name };
  try {
    if (input.pattern === 'ONE_TIME') {
      const addressId = input.addressId ?? (await db.select().from(addresses).where(eq(addresses.userId, input.clientId)))[0]?.id;
      const bookingId = await createBooking({
        tenantId: admin.tenantId,
        clientId: input.clientId,
        serviceTypeId: input.serviceTypeId,
        crewId: input.crewId,
        addressId: addressId ?? undefined,
        slotStart: slot(input.startDate, input.startMinutes),
        slotEnd: slot(input.startDate, input.startMinutes + input.durationMinutes),
        cadence: 'ONE_TIME',
        priceCents: input.priceCents ?? undefined,
        clientNotes: input.notes ?? null,
      });
      await logChange({ tenantId: admin.tenantId, actor, entityType: 'booking', entityId: bookingId, action: 'created', summary: `Scheduled a one-time clean on ${input.startDate}` });
      if (input.sendConfirmation !== false) {
        const svc = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, input.serviceTypeId)).limit(1))[0];
        const address = addressId ? (await db.select().from(addresses).where(eq(addresses.id, addressId)).limit(1))[0] : undefined;
        await sendBookingConfirmationEmails({
          tenantId: admin.tenantId,
          bookingId,
          clientId: input.clientId,
          serviceName: svc?.name ?? 'Cleaning',
          serviceKey: svc?.key,
          slotStart: slot(input.startDate, input.startMinutes),
          slotEnd: slot(input.startDate, input.startMinutes + input.durationMinutes),
          priceCents: input.priceCents ?? null,
          address: address ? { line1: address.line1, city: address.city, state: address.state, zip: address.zip } : undefined,
        }).catch((err) => console.error('[series] confirmation failed', err));
      }
      return NextResponse.json({ bookingId });
    }
    const result = await createSeries({ ...input, pattern: input.pattern, tenantId: admin.tenantId }, actor);
    return NextResponse.json({ seriesId: result.series.id, created: result.created.length, conflicts: result.conflicts });
  } catch (err) {
    return statusApiError(err);
  }
}
