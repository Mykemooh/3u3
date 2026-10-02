import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { optimizeRouteForCrew, RouteOptimizationError } from '@/lib/routeOptimization';

const schema = z.object({ crewId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function POST(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const route = await optimizeRouteForCrew(tenantId, parsed.data.crewId, parsed.data.date);
    return NextResponse.json({ route });
  } catch (err) {
    if (err instanceof RouteOptimizationError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
