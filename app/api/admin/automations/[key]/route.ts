import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { AUTOMATIONS, AutomationError, saveAutomation, type AutomationKey } from '@/lib/automations';

const schema = z.object({
  enabled: z.boolean().optional(),
  offset: z.number().positive().nullable().optional(),
  subject: z.string().max(140).nullable().optional(),
  body: z.string().max(1200).nullable().optional(),
  reset: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { key: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  if (!AUTOMATIONS.some((a) => a.key === params.key)) return NextResponse.json({ error: 'Unknown reminder.' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
  const { reset, ...patch } = parsed.data;
  try {
    const state = await saveAutomation(
      admin.tenantId,
      params.key as AutomationKey,
      reset ? { ...patch, subject: null, body: null } : patch,
      { id: admin.userId, name: admin.name },
    );
    return NextResponse.json({ state });
  } catch (err) {
    if (err instanceof AutomationError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
