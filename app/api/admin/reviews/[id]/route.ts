import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { setReviewFeatured, ReviewError } from '@/lib/reviews';
import { setRecleanStatus } from '@/lib/quality';

const schema = z.object({ featured: z.boolean().optional(), recleanStatus: z.enum(['SCHEDULED', 'DONE', 'DISMISSED']).optional() });

// Commit a review to the landing page's testimonial carousel (featured),
// or pull it back (unfeatured).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    if (parsed.data.featured !== undefined) await setReviewFeatured(tenantId, params.id, parsed.data.featured);
    if (parsed.data.recleanStatus) await setRecleanStatus(tenantId, params.id, parsed.data.recleanStatus);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReviewError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
