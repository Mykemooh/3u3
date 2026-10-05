import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { sendCampaign, MarketingError } from '@/lib/marketing';

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  try {
    return NextResponse.json(await sendCampaign(admin.tenantId, params.id, { id: admin.userId, name: admin.name }));
  } catch (err) {
    if (err instanceof MarketingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
