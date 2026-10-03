import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isPlatformAccessActive } from '@/lib/platform';
import CompanyEditForm from '@/components/platform/CompanyEditForm';

export const dynamic = 'force-dynamic';

export default async function CompanyDetail({ params }: { params: { id: string } }) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, params.id)).limit(1))[0];
  if (!tenant || tenant.isPlatform) notFound();
  const active = isPlatformAccessActive(tenant);

  return (
    <div className="space-y-6">
      <Link href="/platform/companies" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> Companies
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">{tenant.name}</h1>
        <span className={`pill ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {active ? 'Access active' : 'Access expired'}
        </span>
      </div>
      <p className="text-sm text-slate">Slug: {tenant.slug} · Created {tenant.createdAt.toLocaleDateString()}</p>

      <CompanyEditForm
        tenant={{
          id: tenant.id,
          name: tenant.name,
          tagline: tenant.tagline,
          primaryColor: tenant.primaryColor,
          bronzeColor: tenant.bronzeColor,
          customDomain: tenant.customDomain,
          logoUrl: tenant.logoUrl,
          planStatus: tenant.planStatus,
          accessExpiresAt: tenant.accessExpiresAt ? tenant.accessExpiresAt.toISOString() : null,
        }}
      />
    </div>
  );
}
