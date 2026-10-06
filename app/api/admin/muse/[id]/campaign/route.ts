import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { toCampaign, MuseError } from '@/lib/muse';
import { MarketingError } from '@/lib/marketing';

/** An approved idea becomes an unsent email/text campaign draft in Growth. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession('marketing.manage');
  if (!admin) return forbidden();
  try {
    return NextResponse.json({ campaignId: await toCampaign(admin.tenantId, params.id, { id: admin.userId, name: admin.name }) });
  } catch (err) {
    if (err instanceof MuseError || err instanceof MarketingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
