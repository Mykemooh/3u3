import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { setReviewFeatured, ReviewError } from '@/lib/reviews';

const schema = z.object({ featured: z.boolean() });

// Commit a review to the landing page's testimonial carousel (featured),
// or pull it back (unfeatured).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    await setReviewFeatured(tenantId, params.id, parsed.data.featured);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReviewError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
