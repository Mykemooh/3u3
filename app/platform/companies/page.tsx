import Link from 'next/link';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isPlatformAccessActive } from '@/lib/platform';

export const dynamic = 'force-dynamic';

const PLAN_STYLE: Record<string, string> = {
  TRIALING: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PAST_DUE: 'bg-red-100 text-red-700',
  CANCELED: 'bg-line text-muted',
};

export default async function PlatformCompanies() {
  const companies = (await db.select().from(tenants).where(eq(tenants.isPlatform, false))).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-ink">Companies</h1>
          <p className="text-slate">Every company running on the platform.</p>
        </div>
        <Link href="/platform/companies/new" className="btn-primary">
          + New company
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Access</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const active = isPlatformAccessActive(c);
              return (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-cream/40">
                  <td className="px-4 py-3">
                    <Link href={`/platform/companies/${c.id}`} className="font-semibold text-ink hover:text-bronze">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate">{c.slug}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${PLAN_STYLE[c.planStatus]}`}>{c.planStatus}</span>
                  </td>
                  <td className="px-4 py-3">
                    {active ? (
                      <span className="text-emerald-700">
                        {c.accessExpiresAt ? `Until ${c.accessExpiresAt.toLocaleDateString()}` : 'Unlimited'}
                      </span>
                    ) : (
                      <span className="text-red-600">Expired</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate">{c.createdAt.toLocaleDateString()}</td>
                </tr>
              );
            })}
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No companies yet — create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
