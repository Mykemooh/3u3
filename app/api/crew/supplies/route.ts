import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCrewForUser, getTenant } from '@/lib/data';
import { createSupplyReport } from '@/lib/supplies';

const schema = z.object({
  productName: z.string().trim().min(1).max(200),
  status: z.enum(['LOW', 'OUT', 'DAMAGED']),
  notes: z.string().max(500).optional(),
});

// "Report a supply issue" from the crew portal — deliberately just a
// free-text product name and a status, no catalog to maintain.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'CLEANER') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  const crew = await getCrewForUser(userId);
  if (!crew) return NextResponse.json({ error: "You're not on a team yet." }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a product name and status.' }, { status: 400 });

  const id = await createSupplyReport({
    tenantId: tenant.id,
    crewId: crew.id,
    reportedByUserId: userId,
    productName: parsed.data.productName,
    status: parsed.data.status,
    notes: parsed.data.notes,
  });
  return NextResponse.json({ ok: true, id });
}
