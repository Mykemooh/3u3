/**
 * Local-only demo data for trying the portals: a handful of clients with
 * homes and agreed rates, a second team, recurring cleans, today's visits
 * in different states, quotes and invoices. Refuses to run against
 * anything but a localhost database.
 *
 *   npx tsx --env-file=.env.local scripts/demo-data.ts
 */
import bcrypt from 'bcryptjs';
import { db, pool } from '@/db/client';
import { tenants, users, addresses, clientRates, crews, crewMembers, serviceTypes, quotes, quoteItems, invoices, jobs, bookings } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { createSeries, addDays } from '@/lib/recurring';
import { createBooking } from '@/lib/bookings';
import { businessTodayISO } from '@/lib/time';

async function main() {
  const url = process.env.POSTGRES_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Demo data is for local databases only.');
  const tenant = (await db.select().from(tenants).where(eq(tenants.isPlatform, false)).limit(1))[0]!;
  const services = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenant.id));
  const svc = (k: string) => services.find((s) => s.key === k)!;
  const crew1 = (await db.select().from(crews).where(eq(crews.tenantId, tenant.id)))[0]!;
  let crew2 = (await db.select().from(crews).where(and(eq(crews.tenantId, tenant.id), eq(crews.name, 'Crew 2'))))[0];
  if (!crew2) {
    const id = crypto.randomUUID();
    await db.insert(crews).values({ id, tenantId: tenant.id, name: 'Crew 2', workStartMinutes: 8 * 60, workEndMinutes: 17 * 60, homesPerDay: 4, commuteBufferMinutes: 30 });
    crew2 = (await db.select().from(crews).where(eq(crews.id, id)))[0]!;
  }
  const cleaners = [
    { name: 'Maria Lopez', email: 'maria@3u3cleaning.com', staffRole: 'CLEANER' as const, crew: crew1.id },
    { name: 'Ana Ruiz', email: 'ana@3u3cleaning.com', staffRole: 'TEAM_LEAD' as const, crew: crew2.id },
    { name: 'Grace Okafor', email: 'grace@3u3cleaning.com', staffRole: 'JR_CLEANER' as const, crew: crew2.id },
  ];
  for (const c of cleaners) {
    if ((await db.select().from(users).where(eq(users.email, c.email)))[0]) continue;
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, tenantId: tenant.id, role: 'CLEANER', staffRole: c.staffRole, name: c.name, email: c.email, passwordHash: bcrypt.hashSync('clean123', 10), payType: 'PER_CLEAN', payRateCentsPerClean: 4500 });
    await db.insert(crewMembers).values({ id: crypto.randomUUID(), crewId: c.crew, userId: id });
  }

  const people = [
    { name: 'Priya Shah', phone: '+12815550111', line1: '24310 Cinco Terrace Dr', zip: '77494', rate: 14500 },
    { name: 'Tom Becker', phone: '+12815550112', line1: '1902 Mason Rd', zip: '77450', rate: 12000 },
    { name: 'Lucia Moreno', phone: '+12815550113', line1: '5506 Firethorne Blvd', zip: '77494', rate: 16500 },
    { name: 'James Carter', phone: '+12815550114', line1: '27011 Kingsland Blvd', zip: '77494', rate: 13000 },
    { name: 'Hannah Lee', phone: '+12815550115', line1: '3310 Cane Island Pkwy', zip: '77493', rate: 15000 },
  ];
  const today = businessTodayISO();
  const ids: string[] = [];
  for (const p of people) {
    let u = (await db.select().from(users).where(eq(users.phone, p.phone)))[0];
    if (!u) {
      const id = crypto.randomUUID();
      await db.insert(users).values({ id, tenantId: tenant.id, role: 'CUSTOMER', name: p.name, phone: p.phone, email: `${p.name.split(' ')[0].toLowerCase()}@example.com`, passwordHash: bcrypt.hashSync('customer123', 10) });
      await db.insert(addresses).values({ id: crypto.randomUUID(), userId: id, line1: p.line1, city: 'Katy', state: 'TX', zip: p.zip, bedrooms: 3, bathrooms: 2 });
      await db.insert(clientRates).values({ id: crypto.randomUUID(), userId: id, serviceTypeId: svc('STANDARD').id, rateCents: p.rate });
      u = (await db.select().from(users).where(eq(users.id, id)))[0]!;
    }
    ids.push(u.id);
  }

  const existingSeries = await db.select().from(bookings).where(eq(bookings.clientId, ids[0]));
  if (existingSeries.length === 0) {
    await createSeries({ tenantId: tenant.id, clientId: ids[0], serviceTypeId: svc('STANDARD').id, crewId: crew1.id, pattern: 'EVERY_2_WEEKS', startDate: today, startMinutes: 8 * 60, durationMinutes: 150 });
    await createSeries({ tenantId: tenant.id, clientId: ids[1], serviceTypeId: svc('STANDARD').id, crewId: crew2.id, pattern: 'WEEKLY', startDate: today, startMinutes: 9 * 60, durationMinutes: 120 });
    await createSeries({ tenantId: tenant.id, clientId: ids[2], serviceTypeId: svc('STANDARD').id, crewId: crew1.id, pattern: 'MONTHLY_NTH_WEEKDAY', startDate: addDays(today, 3), startMinutes: 11 * 60 + 15, durationMinutes: 150 });
    // Today: one in progress, one done.
    const b1 = await createBooking({ tenantId: tenant.id, clientId: ids[3], serviceTypeId: svc('DEEP').id, crewId: crew2.id, slotStart: `${today}T13:00:00`, slotEnd: `${today}T16:00:00`, cadence: 'ONE_TIME', priceCents: 26000, addressId: (await db.select().from(addresses).where(eq(addresses.userId, ids[3])))[0]?.id });
    await db.update(jobs).set({ status: 'IN_PROGRESS', startedAt: new Date() }).where(eq(jobs.bookingId, b1));
    const j0 = (await db.select().from(bookings).where(and(eq(bookings.clientId, ids[0]), eq(bookings.slotStart, `${today}T08:00:00`))))[0];
    if (j0) await db.update(jobs).set({ status: 'COMPLETE', startedAt: new Date(Date.now() - 3 * 3600000), completedAt: new Date(Date.now() - 1800000) }).where(eq(jobs.bookingId, j0.id));
    // A quote waiting and a draft.
    for (const [status, cents] of [['SENT', 18500], ['DRAFT', 32000]] as const) {
      const qid = crypto.randomUUID();
      await db.insert(quotes).values({ id: qid, tenantId: tenant.id, clientId: ids[4], serviceTypeId: svc('DEEP').id, status, totalCents: cents, sentAt: status === 'SENT' ? new Date() : null, approvalToken: status === 'SENT' ? crypto.randomUUID() : null });
      await db.insert(quoteItems).values({ id: crypto.randomUUID(), quoteId: qid, description: 'Deep clean — 3 bed, 2 bath', amountCents: cents });
    }
    // An unpaid invoice from last week.
    const past = await createBooking({ tenantId: tenant.id, clientId: ids[4], serviceTypeId: svc('STANDARD').id, crewId: crew2.id, slotStart: `${addDays(today, -6)}T10:00:00`, slotEnd: `${addDays(today, -6)}T12:00:00`, cadence: 'ONE_TIME', priceCents: 15000 });
    await db.update(bookings).set({ status: 'COMPLETED' }).where(eq(bookings.id, past));
    await db.update(jobs).set({ status: 'COMPLETE', completedAt: new Date(Date.now() - 6 * 86400000) }).where(eq(jobs.bookingId, past));
    await db.insert(invoices).values({ id: crypto.randomUUID(), tenantId: tenant.id, bookingId: past, clientId: ids[4], status: 'SENT', totalCents: 15000, invoiceNumber: 1001, sentAt: new Date(Date.now() - 5 * 86400000) });
  }
  console.log('Demo data ready.');
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
