import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { setSeriesStatus } from '@/lib/recurring';
import { statusApiError } from '@/lib/api';

/** Pause, resume or end a recurring clean. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const body = await req.json().catch(() => ({}));
  const status = ({ pause: 'PAUSED', resume: 'ACTIVE', end: 'ENDED' } as const)[body.action as 'pause' | 'resume' | 'end'];
  if (!status) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  try {
    return NextResponse.json(await setSeriesStatus(admin.tenantId, params.id, status, { id: admin.userId, name: admin.name }));
  } catch (err) {
    return statusApiError(err);
  }
}
