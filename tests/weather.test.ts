import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, seeded } from './helpers/fixtures';
import { addOnServices, bookingAddOns, bookings } from '@/db/schema';
import { isOutdoorAddOn, flagsFor, weatherWatch } from '@/lib/weather';

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

test('outdoor add-ons are recognised by name unless marked', () => {
  assert.equal(isOutdoorAddOn('Patio sweep', null), true);
  assert.equal(isOutdoorAddOn('Pressure washing', null), true);
  assert.equal(isOutdoorAddOn('Inside windows', null), false);
  assert.equal(isOutdoorAddOn('Inside fridge', null), false);
  assert.equal(isOutdoorAddOn('Inside fridge', true), true);
  assert.equal(isOutdoorAddOn('Patio sweep', false), false);
});

test('rain and heat thresholds', () => {
  assert.deepEqual(flagsFor({ date: 'x', highF: 80, rainChance: 20, rainInches: 0, code: 1 }), { rain: false, heat: false, text: '' });
  assert.equal(flagsFor({ date: 'x', highF: 80, rainChance: 70, rainInches: 0.1, code: 61 }).rain, true);
  assert.equal(flagsFor({ date: 'x', highF: 98, rainChance: 0, rainInches: 0, code: 0 }).heat, true);
});

test('the schedule flags only days with outdoor work and bad weather', async () => {
  const { tenant, client, crew, standard, address } = await seeded();
  const addon = crypto.randomUUID();
  await db.insert(addOnServices).values({ id: addon, tenantId: tenant.id, name: 'Patio sweep', defaultPriceCents: 4000 });
  const wet = crypto.randomUUID();
  const dry = crypto.randomUUID();
  await db.insert(bookings).values([
    { id: wet, tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, addressId: address.id, slotStart: '2031-05-06T09:00:00', slotEnd: '2031-05-06T11:00:00' },
    { id: dry, tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, addressId: address.id, slotStart: '2031-05-07T09:00:00', slotEnd: '2031-05-07T11:00:00' },
  ]);
  await db.insert(bookingAddOns).values([
    { id: crypto.randomUUID(), bookingId: wet, addOnServiceId: addon, name: 'Patio sweep', priceCents: 4000 },
    { id: crypto.randomUUID(), bookingId: dry, addOnServiceId: addon, name: 'Patio sweep', priceCents: 4000 },
  ]);

  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    if (String(url).includes('geocoding')) return Response.json({ results: [{ name: 'Katy', admin1: 'Texas', latitude: 29.78, longitude: -95.82 }] });
    return Response.json({
      daily: {
        time: ['2031-05-05', '2031-05-06', '2031-05-07'],
        temperature_2m_max: [99, 84, 85],
        precipitation_probability_max: [90, 80, 10],
        precipitation_sum: [1, 0.5, 0],
        weather_code: [61, 61, 1],
      },
    });
  }) as typeof fetch;

  const w = await weatherWatch(tenant.id, '2031-05-05', '2031-05-11');
  assert.equal(w.days.length, 1, 'the 5th is stormy but has no outdoor job; the 7th is dry');
  assert.equal(w.days[0].date, '2031-05-06');
  assert.equal(w.days[0].rain, true);
  assert.equal(w.days[0].jobs[0].bookingId, wet);
  assert.ok(urls.every((u) => !u.includes('apikey')), 'free endpoint without a key');

  process.env.OPEN_METEO_API_KEY = 'k';
  urls.length = 0;
  await weatherWatch(tenant.id, '2031-05-05', '2031-05-11');
  assert.ok(urls.every((u) => u.includes('customer-') && u.includes('apikey=k')));
  delete process.env.OPEN_METEO_API_KEY;

  globalThis.fetch = (async () => new Response('down', { status: 503 })) as typeof fetch;
  assert.deepEqual((await weatherWatch(tenant.id, '2031-05-05', '2031-05-11')).days, [], 'an outage never breaks the schedule');
});
