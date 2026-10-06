import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, seeded } from './helpers/fixtures';
import { tenants } from '@/db/schema';
import { searchPlaces, applyReviewPlace, reviewUrlFor, PlacesError } from '@/lib/googlePlaces';
import { eq } from 'drizzle-orm';

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_MAPS_API_KEY;
});

test('without a key, lookup is off and says so', async () => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  await assert.rejects(searchPlaces('3U3 Cleaning Katy'), PlacesError);
});

test('finds the listing and sets the review link from its Place ID', async () => {
  const { tenant, admin } = await seeded();
  process.env.GOOGLE_MAPS_API_KEY = 'maps-key';
  let headers: Record<string, string> = {};
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    headers = init.headers as Record<string, string>;
    return Response.json({ places: [{ id: 'ChIJabc123XYZ_-0', displayName: { text: '3U3 Cleaning' }, formattedAddress: 'Katy, TX' }, { id: 'bad id!', displayName: { text: 'x' } }] });
  }) as typeof fetch;
  const places = await searchPlaces('3U3 Cleaning Katy');
  assert.equal(headers['X-Goog-Api-Key'], 'maps-key');
  assert.deepEqual(places, [{ placeId: 'ChIJabc123XYZ_-0', name: '3U3 Cleaning', address: 'Katy, TX' }]);

  await assert.rejects(applyReviewPlace(tenant.id, 'not a place id', null), PlacesError);
  const url = await applyReviewPlace(tenant.id, 'ChIJabc123XYZ_-0', { id: admin.id, name: admin.name });
  assert.equal(url, reviewUrlFor('ChIJabc123XYZ_-0'));
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  assert.equal(t.googleReviewUrl, 'https://search.google.com/local/writereview?placeid=ChIJabc123XYZ_-0');
});
