import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { startConnectOnboarding, refreshConnectStatus, connectDashboardLink, ConnectError } from '@/lib/connect';
import { logChange } from '@/lib/audit';

/** POST: start (or resume) Stripe onboarding. GET: re-check status. PUT: open the Stripe Express dashboard. */
export async function POST() {
  const admin = await adminSession('billing.manage');
  if (!admin) return forbidden();
  try {
    const r = await startConnectOnboarding(admin.tenantId);
    await logChange({ tenantId: admin.tenantId, actor: { id: admin.userId, name: admin.name }, entityType: 'settings', entityId: 'stripe-connect', action: 'updated', summary: 'Started connecting a Stripe account' });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof ConnectError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Stripe didn’t accept that — try again in a minute.' }, { status: 502 });
  }
}

export async function GET() {
  const admin = await adminSession('billing.manage');
  if (!admin) return forbidden();
  try {
    return NextResponse.json(await refreshConnectStatus(admin.tenantId));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Couldn’t reach Stripe.' }, { status: 502 });
  }
}

export async function PUT() {
  const admin = await adminSession('billing.manage');
  if (!admin) return forbidden();
  try {
    return NextResponse.json(await connectDashboardLink(admin.tenantId));
  } catch (err) {
    if (err instanceof ConnectError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Couldn’t reach Stripe.' }, { status: 502 });
  }
}
