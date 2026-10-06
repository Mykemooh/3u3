import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { pushRunToGusto, GustoError } from '@/lib/gusto';

/** Writes this run's hours, pay and tips into the open Gusto payroll for its period. Nothing is submitted. */
export async function POST(_req: Request, { params }: { params: { runId: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  try {
    // pushRunToGusto only finds the run within this company.
    return NextResponse.json(await pushRunToGusto(admin.tenantId, params.runId, { id: admin.userId, name: admin.name }));
  } catch (err) {
    if (err instanceof GustoError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[gusto] push failed', err);
    return NextResponse.json({ error: 'Couldn’t reach Gusto. Please try again.' }, { status: 502 });
  }
}
