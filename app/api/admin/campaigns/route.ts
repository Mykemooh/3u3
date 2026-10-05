import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { createCampaign, MarketingError } from '@/lib/marketing';

const schema = z.object({
  name: z.string().min(1).max(120),
  segment: z.enum(['ALL_ACTIVE', 'LAPSED', 'RECURRING', 'ONE_TIME', 'LEADS']),
  subject: z.string().min(1).max(140),
  body: z.string().min(1).max(5000),
});

export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Fill in the name, who it goes to, the subject and the message.' }, { status: 400 });
  try {
    return NextResponse.json({ id: await createCampaign(admin.tenantId, parsed.data, { id: admin.userId, name: admin.name }) });
  } catch (err) {
    if (err instanceof MarketingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
