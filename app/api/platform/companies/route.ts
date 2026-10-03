import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { superAdminId, forbidden } from '@/lib/adminApi';
import { provisionTenant, ProvisioningError } from '@/lib/tenantProvisioning';

const schema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  tagline: z.string().optional(),
  primaryColor: z.string().optional(),
  inkColor: z.string().optional(),
  bronzeColor: z.string().optional(),
  creamColor: z.string().optional(),
  adminName: z.string().trim().min(1),
  adminEmail: z.string().trim().email(),
  adminPassword: z.string().min(8),
});

// The whole point: a new company's complete starting stack — tenant,
// branding, service types + checklist templates, a default crew, and
// its first ADMIN login — provisioned in one request from Admin →
// Platform → New company.
export async function GET() {
  const superAdmin = await superAdminId();
  if (!superAdmin) return forbidden();
  const rows = await db.select().from(tenants).where(eq(tenants.isPlatform, false));
  return NextResponse.json({ companies: rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) });
}

export async function POST(req: Request) {
  const superAdmin = await superAdminId();
  if (!superAdmin) return forbidden();

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the required fields.' }, { status: 400 });

  try {
    const { tenantId } = await provisionTenant({
      name: parsed.data.name,
      slug: parsed.data.slug,
      tagline: parsed.data.tagline,
      primaryColor: parsed.data.primaryColor,
      inkColor: parsed.data.inkColor,
      bronzeColor: parsed.data.bronzeColor,
      creamColor: parsed.data.creamColor,
      admin: { name: parsed.data.adminName, email: parsed.data.adminEmail, password: parsed.data.adminPassword },
    });
    return NextResponse.json({ ok: true, tenantId });
  } catch (err) {
    if (err instanceof ProvisioningError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[platform] provision failed', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
