import Link from 'next/link';
import { db } from '@/db/client';
import { tenants, wallets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { PLANS, dollars, effectivePlanKey } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

export default async function PlatformCompanies() {
  const [companies, walletRows] = await Promise.all([
    db.select().from(tenants).where(eq(tenants.isPlatform, false)),
    db.select().from(wallets),
  ]);
  const walletOf = new Map(walletRows.map((w) => [w.tenantId, w]));
  companies.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const paying = companies.filter((c) => !c.billingExempt && c.plan !== 'FREE' && c.platformStripeSubscriptionId).length;
  const mrr = companies.filter((c) => !c.billingExempt && c.platformStripeSubscriptionId).reduce((s, c) => s + PLANS[c.plan as 'FREE' | 'CREW' | 'TEAM'].monthlyCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-tc-display text-[28px] font-extrabold tracking-[-0.03em]">Companies</h1>
          <p className="text-tc-700">Every company running on TRASHCAN.</p>
        </div>
        <Link href="/platform/companies/new" className="tc-btn-dark tc-btn-sm">+ New company</Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Companies', String(companies.length)],
          ['On a paid plan', String(paying)],
          ['Subscriptions / month', dollars(mrr)],
        ].map(([k, v]) => (
          <div key={k} className="tc-card p-4">
            <p className="text-[13px] font-semibold text-tc-500">{k}</p>
            <p className="mt-1 font-tc-display text-[28px] font-extrabold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="tc-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[14px]">
          <thead>
            <tr className="border-b border-tc-200 bg-tc-50 text-[12px] font-semibold text-tc-500">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Card payments</th>
              <th className="px-4 py-3 text-right">Credits</th>
              <th className="px-4 py-3">Texting</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tc-100">
            {companies.map((c) => {
              const w = walletOf.get(c.id);
              const plan = PLANS[effectivePlanKey(c)];
              const comped = !c.billingExempt && (c.planCompForever || (c.planCompUntil && c.planCompUntil > new Date()));
              return (
                <tr key={c.id} className="hover:bg-tc-50">
                  <td className="px-4 py-3">
                    <Link href={`/platform/companies/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                    <span className="block text-[12px] text-tc-500">{c.slug}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.billingExempt ? <span className="tc-status bg-tc-lime-wash text-tc-lime-ink">House</span> : <span className="tc-status bg-tc-100 text-tc-700">{plan.name}{comped ? ' · promo' : ''}</span>}
                  </td>
                  <td className="px-4 py-3">{c.stripeConnectReady ? <span className="text-emerald-700">Connected</span> : <span className="text-tc-500">Not connected</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{w ? dollars(w.balanceCents, { cents: true }) : '—'}</td>
                  <td className="px-4 py-3 text-tc-700">{c.smsNumber ?? (w?.textingStatus && w.textingStatus !== 'NONE' ? w.textingStatus.toLowerCase().replace('_', ' ') : '—')}</td>
                  <td className="px-4 py-3 text-tc-500">{c.createdAt.toLocaleDateString()}</td>
                </tr>
              );
            })}
            {companies.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-tc-500">No companies yet — create the first one.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
