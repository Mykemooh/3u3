import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { changeFuture } from '@/lib/recurring';
import { statusApiError } from '@/lib/api';

const schema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMinutes: z.number().int().min(0).max(24 * 60).optional(),
  durationMinutes: z.number().int().min(15).max(16 * 60).optional(),
  crewId: z.string().optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  pattern: z.enum(['WEEKLY', 'EVERY_2_WEEKS', 'EVERY_4_WEEKS', 'MONTHLY_NTH_WEEKDAY', 'CUSTOM_WEEKDAYS']).optional(),
  weekdays: z.string().nullable().optional(),
  newStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** Change this visit and every one after it. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid change' }, { status: 400 });
  const { fromDate, ...change } = parsed.data;
  try {
    return NextResponse.json(await changeFuture(admin.tenantId, params.id, fromDate, change, { id: admin.userId, name: admin.name }));
  } catch (err) {
    return statusApiError(err);
  }
}
