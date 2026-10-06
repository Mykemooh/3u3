import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { logChange, type Actor } from '@/lib/audit';

/**
 * Finds a company's Google Business Profile with the Places API (New)
 * and turns its Place ID into the "leave a review" link that happy
 * clients are sent to (tenants.googleReviewUrl, lib/quality.ts).
 *
 * Needs GOOGLE_MAPS_API_KEY with "Places API (New)" enabled — server-side
 * only, never sent to the browser. Pasting the link by hand on Settings
 * keeps working without it.
 */

export class PlacesError extends Error {}

export const placesConfigured = () => !!process.env.GOOGLE_MAPS_API_KEY?.trim();

export type PlaceCandidate = { placeId: string; name: string; address: string | null };

export const reviewUrlFor = (placeId: string) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

export async function searchPlaces(query: string): Promise<PlaceCandidate[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new PlacesError('Google Places isn’t set up for this site yet.');
  const textQuery = query.trim().slice(0, 200);
  if (textQuery.length < 3) throw new PlacesError('Type your business name and city.');
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery, maxResultCount: 5 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new PlacesError(res.status === 403 ? 'Google refused the key. Check that Places API (New) is enabled for it.' : `Google search failed (${res.status}).`);
  const data = (await res.json()) as { places?: { id: string; displayName?: { text?: string }; formattedAddress?: string }[] };
  return (data.places ?? [])
    .filter((p) => PLACE_ID.test(p.id))
    .map((p) => ({ placeId: p.id, name: p.displayName?.text ?? 'Unnamed place', address: p.formattedAddress ?? null }));
}

export async function applyReviewPlace(tenantId: string, placeId: string, actor: Actor) {
  if (!PLACE_ID.test(placeId)) throw new PlacesError('That doesn’t look like a Google Place ID.');
  const [before] = await db.select({ url: tenants.googleReviewUrl }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const url = reviewUrlFor(placeId);
  await db.update(tenants).set({ googleReviewUrl: url }).where(eq(tenants.id, tenantId));
  await logChange({ tenantId, actor, entityType: 'settings', entityId: tenantId, action: 'updated', summary: 'Set the Google review link from Google Places', changes: [{ field: 'googleReviewUrl', from: before?.url ?? null, to: url }] });
  return url;
}
