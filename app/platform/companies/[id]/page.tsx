import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import CompanyEditForm from '@/components/platform/CompanyEditForm';
import CompanyBilling from '@/components/platform/CompanyBilling';
import { getWallet, ledgerFor } from '@/lib/billing/wallet';
import { PLANS, dollars, effectivePlanKey, feeLabel } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

export default async function CompanyDetail({ params }: { params: { id: string } }) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, params.id)).limit(1))[0];
  if (!tenant || tenant.isPlatform) notFound();
  const [wallet, ledger] = await Promise.all([getWallet(tenant.id), ledgerFor(tenant.id, 8)]);
  const plan = PLANS[effectivePlanKey(tenant)];

  return (
    <div className="space-y-6">
      <Link href="/platform/companies" className="inline-flex items-center gap-1 text-sm font-semibold text-tc-500 hover:text-tc-black">
        <span aria-hidden="true">←</span> Companies
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-tc-display text-[28px] font-extrabold tracking-[-0.03em]">{tenant.name}</h1>
        <span className="tc-status bg-tc-100 text-tc-700">{tenant.billingExempt ? 'House account' : `${plan.name} plan`}</span>
        {tenant.stripeConnectReady ? <span className="tc-status bg-emerald-50 text-emerald-700">Stripe connected</span> : <span className="tc-status bg-amber-50 text-amber-700">Stripe not connected</span>}
      </div>
      <p className="text-sm text-tc-500">Slug: {tenant.slug} · Created {tenant.createdAt.toLocaleDateString()}</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="tc-card p-5">
          <h2 className="text-[16px] font-bold">Billing</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[14px]">
            <div className="rounded-tc-md bg-tc-50 p-3"><dt className="text-tc-500">Plan</dt><dd className="font-semibold">{plan.name} · {dollars(plan.monthlyCents)}/mo</dd><dd className="text-[12px] text-tc-500">{tenant.billingExempt ? 'No platform fee' : feeLabel(plan)}</dd></div>
            <div className="rounded-tc-md bg-tc-50 p-3"><dt className="text-tc-500">Credits</dt><dd className="font-semibold tabular-nums">{dollars(wallet.balanceCents, { cents: true })}</dd><dd className="text-[12px] text-tc-500">Texting: {wallet.textingStatus.toLowerCase().replace('_', ' ')}{tenant.smsNumber ? ` · ${tenant.smsNumber}` : ''}</dd></div>
          </dl>
          <div className="mt-5">
            <CompanyBilling id={tenant.id} exempt={tenant.billingExempt} textingStatus={wallet.textingStatus} hasNumber={!!tenant.smsNumber} />
          </div>
          {ledger.length > 0 && (
            <ul className="mt-5 divide-y divide-tc-100 border-t border-tc-100 text-[13px]">
              {ledger.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 py-2">
                  <span className="text-tc-700">{r.createdAt.toLocaleDateString()} · {r.reason.toLowerCase().replace('_', ' ')}{r.note ? ` · ${r.note}` : ''}</span>
                  <span className="font-semibold tabular-nums">{r.amountCents === 0 ? '—' : dollars(r.amountCents, { cents: true })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
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
        </section>
      </div>
    </div>
  );
}
