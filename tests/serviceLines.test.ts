import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, makeUser, db } from './helpers/fixtures';
import { ensureServiceLines, backfillServiceLines } from '@/lib/serviceLines';
import { intakeSchema, describeIntake, parseIntake, needsIntake } from '@/lib/intake';
import { postConstructionPrice, commercialPrice, productionGuideFor, parsePricing } from '@/lib/pricingGuides';
import { createDraftEstimate, updateDraftEstimate, sendEstimate, respondToEstimate } from '@/lib/estimates';
import { createQuoteVisitBooking } from '@/lib/bookings';
import { listTemplates } from '@/lib/scheduleTemplates';
import { addDays } from '@/lib/recurring';
import { businessTodayISO } from '@/lib/time';
import { serviceTypes, checklistTemplates, clientRates, users, quotes, bookings } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

test('every company has the post-construction and commercial lines, with checklists, exactly once', async () => {
  const { tenant } = await seeded();
  await backfillServiceLines();
  await ensureServiceLines(tenant.id);
  const rows = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenant.id));
  for (const key of ['POST_CONSTRUCTION', 'COMMERCIAL'] as const) {
    const matches = rows.filter((r) => r.key === key);
    assert.equal(matches.length, 1, `${key} exists once`);
    assert.equal(matches[0].offered, true);
    const tpl = await db.select().from(checklistTemplates).where(eq(checklistTemplates.serviceTypeId, matches[0].id));
    assert.equal(tpl.length, 1, `${key} has a checklist`);
  }
  const templates = await listTemplates(tenant.id);
  const postCon = rows.find((r) => r.key === 'POST_CONSTRUCTION')!;
  assert.ok(templates.filter((t) => t.serviceTypeId === postCon.id).length >= 3, 'rough, final and touch-up templates');
});

test('intake: the questions that change the price are required; answers read back in plain words', () => {
  assert.equal(needsIntake('COMMERCIAL'), true);
  assert.equal(needsIntake('STANDARD'), false);
  const bad = intakeSchema.safeParse({ kind: 'POST_CONSTRUCTION', projectType: 'NEW_BUILD', squareFeet: 50, phases: [] });
  assert.equal(bad.success, false);
  const ok = intakeSchema.parse({ kind: 'POST_CONSTRUCTION', projectType: 'NEW_BUILD', squareFeet: 2400, phases: ['ROUGH', 'FINAL'], tradesOnSite: true, floors: ['TILE'] });
  const rows = describeIntake(ok);
  assert.ok(rows.some((r) => r.label === 'Phases' && r.value === 'Rough clean, Final clean'));
  assert.ok(rows.some((r) => r.label === 'Size' && r.value.startsWith('2,400 sq ft')));
  const c = intakeSchema.parse({ kind: 'COMMERCIAL', businessName: 'Katy Dental', facilityType: 'MEDICAL', squareFeet: 3000, visitsPerWeek: 3, suppliesBy: 'US' });
  assert.ok(describeIntake(c).some((r) => r.value === '3 visits a week'));
  assert.equal(parseIntake(JSON.stringify(c))?.kind, 'COMMERCIAL');
  assert.equal(parseIntake('{nope'), null);
});

test('pricing math: phases by square foot; commercial hours × visits × 52 ÷ 12', () => {
  const pc = postConstructionPrice({ squareFeet: 2000, phases: [{ key: 'ROUGH', label: 'Rough clean', ratePerSqFt: 0.2 }, { key: 'FINAL', label: 'Final clean', ratePerSqFt: 0.3 }] });
  assert.deepEqual(pc.phases.map((p) => p.amountCents), [40000, 60000]);
  assert.equal(pc.totalCents, 100000);
  const cm = commercialPrice({ squareFeet: 7000, productionRate: 3500, visitsPerWeek: 3, hourlyRateCents: 4000, suppliesMonthlyCents: 5000 });
  assert.equal(cm.hoursPerVisit, 2);
  assert.equal(cm.laborMonthlyCents, Math.round(8000 * 3 * 52 / 12)); // $80 a visit
  assert.equal(cm.monthlyCents, cm.laborMonthlyCents + 5000);
  assert.ok(Math.abs(cm.perVisitCents * 3 * 52 / 12 - cm.monthlyCents) < 100, 'a month of visits adds up to the monthly price');
  assert.equal(commercialPrice({ squareFeet: 500, productionRate: 3500, visitsPerWeek: 0, hourlyRateCents: 4000 }).perVisitCents, 4000, 'one hour minimum');
  assert.equal(productionGuideFor('MEDICAL').suggested, 2000);
  assert.equal(productionGuideFor('FITNESS').guided, false, 'no published range — owner sets it');
});

test('commercial quote approval sets a per-visit rate and monthly billing; post-con keeps phases off self-booking', async () => {
  const { tenant, address } = await seeded();
  const services = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenant.id));
  const commercial = services.find((s) => s.key === 'COMMERCIAL')!;
  const postCon = services.find((s) => s.key === 'POST_CONSTRUCTION')!;

  const biz = await makeUser(tenant.id, 'CUSTOMER');
  const day = addDays(businessTodayISO(), 9);
  const visitId = await createQuoteVisitBooking({
    tenantId: tenant.id, clientId: biz.id, addressId: address.id, serviceTypeId: commercial.id,
    slotStart: `${day}T15:30:00`, slotEnd: `${day}T16:00:00`,
    intakeJson: JSON.stringify({ kind: 'COMMERCIAL', businessName: 'Katy Dental', facilityType: 'MEDICAL', squareFeet: 4000, visitsPerWeek: 2, floors: [], extras: [] }),
  });
  assert.ok(parseIntake((await db.select().from(bookings).where(eq(bookings.id, visitId)))[0].intakeJson));
  const quoteId = await createDraftEstimate({ tenantId: tenant.id, clientId: biz.id, serviceTypeId: commercial.id, quoteVisitBookingId: visitId });
  const price = commercialPrice({ squareFeet: 4000, productionRate: 2000, visitsPerWeek: 2, hourlyRateCents: 4500 });
  await updateDraftEstimate(quoteId, {
    items: [{ description: 'Commercial cleaning (per month)', amountCents: price.monthlyCents }],
    pricing: { kind: 'COMMERCIAL', squareFeet: 4000, productionRate: 2000, visitsPerWeek: 2, hourlyRateCents: 4500, hoursPerVisit: price.hoursPerVisit, suppliesMonthlyCents: 0, monthlyCents: price.monthlyCents, perVisitCents: price.perVisitCents },
  });
  await sendEstimate(quoteId);
  const token = (await db.select().from(quotes).where(eq(quotes.id, quoteId)))[0].approvalToken!;
  await respondToEstimate(token, 'APPROVE');
  const rate = (await db.select().from(clientRates).where(and(eq(clientRates.userId, biz.id), eq(clientRates.serviceTypeId, commercial.id))))[0];
  assert.equal(rate.rateCents, price.perVisitCents);
  assert.equal((await db.select().from(users).where(eq(users.id, biz.id)))[0].billingMode, 'MONTHLY_BATCH');
  assert.equal(parsePricing((await db.select().from(quotes).where(eq(quotes.id, quoteId)))[0].pricingJson)?.kind, 'COMMERCIAL');

  const builder = await makeUser(tenant.id, 'CUSTOMER');
  const pq = await createDraftEstimate({ tenantId: tenant.id, clientId: builder.id, serviceTypeId: postCon.id });
  const pc = postConstructionPrice({ squareFeet: 3000, phases: [{ key: 'ROUGH', label: 'Rough clean', ratePerSqFt: 0.2 }, { key: 'FINAL', label: 'Final clean', ratePerSqFt: 0.3 }] });
  await updateDraftEstimate(pq, { items: pc.phases.map((p) => ({ description: p.label, amountCents: p.amountCents })), pricing: { kind: 'POST_CONSTRUCTION', squareFeet: 3000, phases: pc.phases } });
  await sendEstimate(pq);
  await respondToEstimate((await db.select().from(quotes).where(eq(quotes.id, pq)))[0].approvalToken!, 'APPROVE');
  const noRate = await db.select().from(clientRates).where(and(eq(clientRates.userId, builder.id), eq(clientRates.serviceTypeId, postCon.id)));
  assert.equal(noRate.length, 0, 'phases are scheduled by the office, not self-booked');
  assert.equal((await db.select().from(users).where(eq(users.id, builder.id)))[0].billingMode, 'PER_CLEAN');
});
