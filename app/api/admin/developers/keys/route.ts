import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { createApiKey, listApiKeys } from '@/lib/apiKeys';
import { developersError } from '@/lib/developersApi';

export async function GET() {
  const admin = await adminSession();
  if (!admin) return forbidden();
  return NextResponse.json({ keys: await listApiKeys(admin.tenantId) });
}

/** The full key is in this response and nowhere else, ever. */
export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = z.object({ name: z.string().max(80) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Give the key a name.' }, { status: 400 });
  try {
    const { id, key } = await createApiKey(admin.tenantId, parsed.data.name, { id: admin.userId, name: admin.name });
    return NextResponse.json({ id, key }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return developersError(err);
  }
}
