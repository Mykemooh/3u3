import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { homeForRole } from '@/lib/nav';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isPlatformAccessActive } from '@/lib/platform';
import { isStripeConfigured } from '@/lib/stripe';
import SignOutButton from '@/components/SignOutButton';
import BillingPanel from '@/components/admin/BillingPanel';

export const dynamic = 'force-dynamic';

const PLAN_LABEL: Record<string, string> = {
  TRIALING: 'Free trial',
  ACTIVE: 'Active',
  PAST_DUE: 'Past due',
  CANCELED: 'Canceled',
};

// Deliberately outside app/admin's own layout, which locks itself the
// moment platform access lapses (lib/platform.ts) — this page can never
// be the thing that gate blocks.
export default async function BillingPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const tenantId = (session?.user as { tenantId?: string } | undefined)?.tenantId;
  if (!session?.user) redirect('/signin?next=/billing');
  if (role !== 'ADMIN') redirect(`${homeForRole(role)}?denied=1`);

  const tenant = tenantId ? (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0] : undefined;
  if (!tenant) redirect('/admin');
  const active = isPlatformAccessActive(tenant);

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
        <Link href="/admin" className="text-sm font-semibold text-muted hover:text-ink">
          ← Admin
        </Link>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-xl space-y-6 px-6 py-10">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-ink">Billing</h1>
          <p className="text-slate">{tenant.name}'s platform access.</p>
        </div>

        <div className={`card flex items-center justify-between ${active ? '' : 'border-2 border-red-300'}`}>
          <div>
            <p className="text-sm text-muted">Status</p>
            <p className="text-lg font-bold text-ink">{PLAN_LABEL[tenant.planStatus]}</p>
            {tenant.accessExpiresAt && (
              <p className="text-sm text-slate">
                {active ? 'Renews or expires' : 'Expired'} {tenant.accessExpiresAt.toLocaleDateString()}
              </p>
            )}
          </div>
          <span className={`pill ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {active ? 'Active' : 'Locked'}
          </span>
        </div>

        <BillingPanel stripeConfigured={isStripeConfigured()} />
      </main>
    </div>
  );
}
