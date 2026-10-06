import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { searchPlaces, applyReviewPlace, PlacesError } from '@/lib/googlePlaces';

/** Search Google for the company's listing. */
export async function GET(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const q = new URL(req.url).searchParams.get('q') ?? '';
  try {
    return NextResponse.json({ places: await searchPlaces(q) });
  } catch (err) {
    if (err instanceof PlacesError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[google-place]', err);
    return NextResponse.json({ error: 'Google search failed.' }, { status: 502 });
  }
}

/** Use one result's Place ID for the review link. */
export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = z.object({ placeId: z.string().max(300) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pick a result.' }, { status: 400 });
  try {
    const url = await applyReviewPlace(admin.tenantId, parsed.data.placeId, { id: admin.userId, name: admin.name });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof PlacesError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
