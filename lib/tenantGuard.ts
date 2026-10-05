import { db } from '@/db/client';
import { bookings, invoices, quotes, serviceTypes, addOnServices, users, jobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

/**
 * Does this record belong to this company? Every admin route that takes an
 * id from the URL checks it, so an admin of one company can never read or
 * change another's records by guessing an id (the Phase 3 multi-tenant
 * rule). A job is checked through its booking.
 */
export type GuardedRecord = 'booking' | 'invoice' | 'quote' | 'service' | 'addon' | 'user' | 'job';

export async function belongsTo(tenantId: string, kind: GuardedRecord, id: string): Promise<boolean> {
  switch (kind) {
    case 'booking':
      return (await db.select({ t: bookings.tenantId }).from(bookings).where(eq(bookings.id, id)).limit(1))[0]?.t === tenantId;
    case 'invoice':
      return (await db.select({ t: invoices.tenantId }).from(invoices).where(eq(invoices.id, id)).limit(1))[0]?.t === tenantId;
    case 'quote':
      return (await db.select({ t: quotes.tenantId }).from(quotes).where(eq(quotes.id, id)).limit(1))[0]?.t === tenantId;
    case 'service':
      return (await db.select({ t: serviceTypes.tenantId }).from(serviceTypes).where(eq(serviceTypes.id, id)).limit(1))[0]?.t === tenantId;
    case 'addon':
      return (await db.select({ t: addOnServices.tenantId }).from(addOnServices).where(eq(addOnServices.id, id)).limit(1))[0]?.t === tenantId;
    case 'user':
      return (await db.select({ t: users.tenantId }).from(users).where(eq(users.id, id)).limit(1))[0]?.t === tenantId;
    case 'job': {
      const job = (await db.select({ b: jobs.bookingId }).from(jobs).where(eq(jobs.id, id)).limit(1))[0];
      return job ? belongsTo(tenantId, 'booking', job.b) : false;
    }
  }
}

export const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
