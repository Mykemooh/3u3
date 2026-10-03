import { listPromoCodes } from '@/lib/platform';
import PromoCodeCreateForm from '@/components/platform/PromoCodeCreateForm';
import PromoCodeToggle from '@/components/platform/PromoCodeToggle';

export const dynamic = 'force-dynamic';

const TIER_LABELS: Record<string, string> = {
  TRIAL_1MO: '1 month trial',
  TRIAL_3MO: '3 month trial',
  FOREVER: 'Forever',
};

export default async function PromoCodesPage() {
  const codes = await listPromoCodes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Promo codes</h1>
        <p className="text-slate">Free platform access a company can redeem instead of paying — 1 month, 3 months, or forever.</p>
      </div>

      <div className="card">
        <PromoCodeCreateForm />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Tier</th>
              <th className="px-4 py-3 font-medium">Redeemed</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-mono font-semibold text-ink">{c.code}</td>
                <td className="px-4 py-3 text-slate">{TIER_LABELS[c.tier]}</td>
                <td className="px-4 py-3 text-slate">
                  {c.redemptionCount}
                  {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}
                </td>
                <td className="px-4 py-3">
                  <span className={`pill ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-line text-muted'}`}>{c.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="px-4 py-3">
                  <PromoCodeToggle id={c.id} active={c.active} />
                </td>
              </tr>
            ))}
            {codes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">No codes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
