import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool } from './client';
import {
  tenants, users, addresses, serviceTypes, clientRates, crews, crewMembers,
  checklistTemplates, checklistTemplateItems,
} from './schema';

// Room-by-room checklist content. The PRD (6.5) says each service type's
// checklist should match "the room-by-room lists already defined in
// Homelume's Cleaning Checklists reference document" — that reference
// document's line-item detail wasn't available to pull from verbatim, so
// these are sensible, editable defaults grounded in the four named service
// types and standard residential-cleaning practice. Admins can add/reorder
// items later; this just seeds a working set so the app is usable end to end.
const CHECKLISTS: Record<string, { room: string; detail: string }[]> = {
  STANDARD: [
    { room: 'Kitchen', detail: 'Wipe counters & backsplash, exterior of appliances, sink, stovetop; empty trash' },
    { room: 'Bathrooms', detail: 'Sanitize toilet, tub/shower, sink & counters; mirrors; empty trash' },
    { room: 'Bedrooms', detail: 'Dust surfaces, make beds, vacuum/mop floors, empty trash' },
    { room: 'Living Areas', detail: 'Dust furniture & surfaces, vacuum/mop floors, tidy visible clutter' },
    { room: 'Entryway & Hallways', detail: 'Sweep/vacuum/mop, dust ledges and light switches' },
  ],
  DEEP: [
    { room: 'Kitchen', detail: 'Standard tasks plus inside microwave, backsplash detail, baseboards, under sink' },
    { room: 'Bathrooms', detail: 'Standard tasks plus grout detail, exhaust fan, baseboards, inside cabinets' },
    { room: 'Bedrooms', detail: 'Standard tasks plus baseboards, light fixtures, door/window frames' },
    { room: 'Living Areas', detail: 'Standard tasks plus baseboards, light fixtures, upholstery vacuum' },
    { room: 'Windows (interior)', detail: 'Interior glass, sills, and tracks' },
    { room: 'Entryway & Hallways', detail: 'Standard tasks plus baseboards and door frames' },
  ],
  MOVE_IN_OUT: [
    { room: 'Kitchen', detail: 'Empty-home deep clean: inside all cabinets/drawers, inside oven/fridge, appliance exteriors' },
    { room: 'Bathrooms', detail: 'Empty-home deep clean: inside cabinets, grout, fixtures, mirrors' },
    { room: 'Bedrooms', detail: 'Inside closets, baseboards, light fixtures, walls spot-clean' },
    { room: 'Living Areas', detail: 'Baseboards, light fixtures, walls spot-clean, floors detail' },
    { room: 'Windows (interior)', detail: 'Interior glass, sills, and tracks' },
    { room: 'Garage / Storage', detail: 'Sweep, remove debris' },
  ],
  AIRBNB: [
    { room: 'Kitchen', detail: 'Reset for next guest: dishes put away, counters, appliance exteriors, restock check' },
    { room: 'Bathrooms', detail: 'Full sanitize, fresh linens/towels staged, restock consumables' },
    { room: 'Bedrooms', detail: 'Fresh linens, beds made to staging standard, surfaces dusted' },
    { room: 'Living Areas', detail: 'Reset staging, vacuum/mop, remote controls & surfaces wiped' },
    { room: 'Guest Turnover Check', detail: 'Walkthrough for damage/missing items, trash out, doors locked' },
  ],
};

async function upsertUser(row: typeof users.$inferInsert) {
  const existing = row.phone
    ? (await db.select().from(users).where(eq(users.phone, row.phone)).limit(1))[0]
    : row.email
    ? (await db.select().from(users).where(eq(users.email, row.email)).limit(1))[0]
    : undefined;
  if (existing) return existing;
  await db.insert(users).values(row);
  return (await db.select().from(users).where(eq(users.id, row.id!)).limit(1))[0]!;
}

async function main() {
  console.log('Seeding 3U3 Cleaning...');

  let tenant = (await db.select().from(tenants).limit(1))[0];
  if (!tenant) {
    const tenantId = crypto.randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      name: '3U3 Cleaning',
      tagline: 'Family Owned by Parents of Three boys, Built in Texas',
      primaryColor: '#D2961E',
      inkColor: '#1A1A1A',
      bronzeColor: '#8A6D1D',
      creamColor: '#FAEEDA',
      serviceAreaRadiusMiles: 25,
    });
    tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0]!;
  }

  // Service types
  const serviceDefs = [
    { key: 'STANDARD' as const, name: 'Standard Cleaning', defaultDurationMinutes: 150, recurringEligible: true },
    { key: 'DEEP' as const, name: 'Deep Cleaning', defaultDurationMinutes: 240, recurringEligible: false },
    { key: 'MOVE_IN_OUT' as const, name: 'Move-In / Move-Out', defaultDurationMinutes: 240, recurringEligible: false },
    { key: 'AIRBNB' as const, name: 'Airbnb / Rental Turnover', defaultDurationMinutes: 150, recurringEligible: false },
  ];
  const serviceRows: Record<string, typeof serviceTypes.$inferSelect> = {};
  for (const def of serviceDefs) {
    const existingServices = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenant.id));
    let row = existingServices.find((s) => s.key === def.key);
    if (!row) {
      const sid = crypto.randomUUID();
      await db.insert(serviceTypes).values({ id: sid, tenantId: tenant.id, ...def });
      row = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, sid)).limit(1))[0]!;
    }
    serviceRows[def.key] = row;

    // Checklist template + items
    const existingTemplates = await db
      .select()
      .from(checklistTemplates)
      .where(eq(checklistTemplates.serviceTypeId, row.id));
    let template = existingTemplates[0];
    if (!template) {
      const tid = crypto.randomUUID();
      await db.insert(checklistTemplates).values({
        id: tid, tenantId: tenant.id, serviceTypeId: row.id, name: `${def.name} Checklist`,
      });
      for (let idx = 0; idx < CHECKLISTS[def.key].length; idx += 1) {
        const item = CHECKLISTS[def.key][idx];
        await db.insert(checklistTemplateItems).values({
          id: crypto.randomUUID(),
          templateId: tid,
          roomName: item.room,
          taskDetail: item.detail,
          sortOrder: idx,
        });
      }
    }
  }

  // Crew — V1 defaults per PRD 6.4 (8:00-5:00, 2/crew, 3 homes/day, 45min buffer)
  const existingCrews = await db.select().from(crews).where(eq(crews.tenantId, tenant.id));
  let crew = existingCrews[0];
  if (!crew) {
    const cid = crypto.randomUUID();
    await db.insert(crews).values({
      id: cid, tenantId: tenant.id, name: 'Crew 1',
      workStartMinutes: 8 * 60, workEndMinutes: 17 * 60, homesPerDay: 3, commuteBufferMinutes: 45,
    });
    crew = (await db.select().from(crews).where(eq(crews.id, cid)).limit(1))[0]!;
  }

  // Admin user
  const admin = await upsertUser({
    id: crypto.randomUUID(), tenantId: tenant.id, role: 'ADMIN', name: 'Samuel (Owner/Admin)',
    email: 'admin@3u3cleaning.com', passwordHash: bcrypt.hashSync('admin123', 10),
  });

  // Cleaner user, linked to the crew
  const cleaner = await upsertUser({
    id: crypto.randomUUID(), tenantId: tenant.id, role: 'CLEANER', name: 'Jordan (Crew Lead)',
    email: 'jordan@3u3cleaning.com', phone: '+12815550101', passwordHash: bcrypt.hashSync('clean123', 10),
  });
  const existingMemberships = await db.select().from(crewMembers).where(eq(crewMembers.crewId, crew.id));
  if (!existingMemberships.find((m) => m.userId === cleaner.id)) {
    await db.insert(crewMembers).values({ id: crypto.randomUUID(), crewId: crew.id, userId: cleaner.id });
  }

  // Demo returning customer with an agreed Standard rate
  const customer = await upsertUser({
    id: crypto.randomUUID(), tenantId: tenant.id, role: 'CUSTOMER', name: 'Dana Reyes',
    phone: '+12815550199', passwordHash: bcrypt.hashSync('customer123', 10),
  });
  const existingAddresses = await db.select().from(addresses).where(eq(addresses.userId, customer.id));
  if (!existingAddresses[0]) {
    await db.insert(addresses).values({
      id: crypto.randomUUID(), userId: customer.id, line1: '2214 Willow Bend Ln', city: 'Katy', state: 'TX', zip: '77450',
    });
  }
  const existingRates = await db.select().from(clientRates).where(eq(clientRates.userId, customer.id));
  if (!existingRates.find((r) => r.serviceTypeId === serviceRows.STANDARD.id)) {
    await db.insert(clientRates).values({
      id: crypto.randomUUID(), userId: customer.id, serviceTypeId: serviceRows.STANDARD.id, rateCents: 12000,
    });
  }
  if (!existingRates.find((r) => r.serviceTypeId === serviceRows.DEEP.id)) {
    await db.insert(clientRates).values({
      id: crypto.randomUUID(), userId: customer.id, serviceTypeId: serviceRows.DEEP.id, rateCents: 22000,
    });
  }

  console.log('Seed complete.');
  console.log('---------------------------------------------');
  console.log('Admin login:    admin@3u3cleaning.com / admin123');
  console.log('Cleaner login:  jordan@3u3cleaning.com / clean123');
  console.log('Customer login: +12815550199 / customer123  (Dana Reyes, has an agreed Standard & Deep rate)');
  console.log('---------------------------------------------');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
