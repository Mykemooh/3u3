import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { createEndpoint, listEndpoints, listDeliveries } from '@/lib/webhooks';
import { developersError } from '@/lib/developersApi';

export async function GET() {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const [endpoints, deliveries] = await Promise.all([listEndpoints(admin.tenantId), listDeliveries(admin.tenantId)]);
  return NextResponse.json({ endpoints, deliveries });
}

const schema = z.object({ url: z.string().min(1).max(500), description: z.string().max(120).nullable().optional(), events: z.array(z.string()).max(20).optional() });

/** The signing secret is in this response once; after that it can only be replaced. */
export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Enter the address to send events to.' }, { status: 400 });
  try {
    const created = await createEndpoint(admin.tenantId, parsed.data, { id: admin.userId, name: admin.name });
    return NextResponse.json(created, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return developersError(err);
  }
}
