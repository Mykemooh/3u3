import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { listThreads, sendText, MessagingError } from '@/lib/messaging';
import { phoneDigits } from '@/lib/sms';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await adminSession();
  if (!admin) return forbidden();
  return NextResponse.json({ threads: await listThreads(admin.tenantId) });
}

const schema = z.object({
  clientId: z.string().min(1).optional(),
  phone: z.string().min(7).max(30).optional(),
  body: z.string().min(1).max(1000),
});

export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || (!parsed.data.clientId && !parsed.data.phone)) {
    return NextResponse.json({ error: 'Pick who to text and type a message.' }, { status: 400 });
  }
  try {
    const sent = await sendText({ tenantId: admin.tenantId, clientId: parsed.data.clientId, phone: parsed.data.phone, body: parsed.data.body, userId: admin.userId });
    return NextResponse.json({ ok: true, id: sent.id, key: phoneDigits(parsed.data.phone) });
  } catch (err) {
    if (err instanceof MessagingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
