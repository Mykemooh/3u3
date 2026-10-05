import Link from 'next/link';
import { getTenant, formatMoney } from '@/lib/data';
import { SEGMENTS, listCampaigns, growthSnapshot } from '@/lib/marketing';
import { referralStats } from '@/lib/referrals';
import { automationStates } from '@/lib/automations';
import { qualitySummary } from '@/lib/quality';
import { emailConfigured } from '@/lib/email';
import CampaignsManager from '@/components/admin/CampaignsManager';

export const dynamic = 'force-dynamic';

export default async function MarketingPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const [snapshot, campaigns, referrals, states, quality] = await Promise.all([
    growthSnapshot(tenant.id),
    listCampaigns(tenant.id),
    referralStats(tenant.id),
    automationStates(tenant.id),
    qualitySummary(tenant.id),
  ]);
  const stat = (label: string, value: string | number, hint?: string) => (
    <div className="card !p-4">
      <p className="text-sm text-slate">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
  const onOff = (on: boolean) => <span className={`pill ${on ? 'bg-green/10 text-green' : 'bg-surface text-slate'}`}>{on ? 'On' : 'Off'}</span>;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Growth</h2>
        <p className="max-w-2xl text-slate">Bring clients back, reward the ones who send friends, and keep your reviews honest.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat('Active clients', snapshot.counts.ALL_ACTIVE, 'A clean in the last year or one booked')}
        {stat('On a repeating schedule', snapshot.counts.RECURRING)}
        {stat('Lapsed', snapshot.counts.LAPSED, `No clean in ${tenant.winbackDays}+ days, nothing booked`)}
        {stat('New in the last 30 days', snapshot.newLast30)}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Win back lapsed clients</h3>
            {onOff(states.winback.enabled)}
          </div>
          <p className="text-sm text-slate">One friendly note when a client goes {tenant.winbackDays} days without a clean and has nothing booked.</p>
          <Link href="/admin/automations" className="text-sm font-semibold text-gold hover:underline">Set it up →</Link>
        </div>
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Referral credit</h3>
            {onOff(states.referral_rewards.enabled)}
          </div>
          <p className="text-sm text-slate">
            {formatMoney(tenant.referralCreditCents)} each to the client and their friend after the friend’s first clean. Each client’s link is in their account.
          </p>
          <p className="text-sm text-slate">
            {referrals.referredClients} referred client{referrals.referredClients === 1 ? '' : 's'} · {formatMoney(referrals.outstandingCreditCents)} credit not yet used
          </p>
          {referrals.top.length > 0 && <p className="text-xs text-muted">Top referrers: {referrals.top.map((t) => `${t.name} (${t.referrals})`).join(', ')}</p>}
          <div className="flex gap-3 text-sm font-semibold">
            <Link href="/admin/automations" className="text-gold hover:underline">Turn on or off →</Link>
            <Link href="/admin/settings#growth" className="text-gold hover:underline">Change the amount →</Link>
          </div>
        </div>
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Reviews</h3>
            {onOff(states.review_request.enabled)}
          </div>
          <p className="text-sm text-slate">
            Clients rate each room. Happy ones get your Google link{tenant.googleReviewUrl ? '' : ' (not set yet)'}; anything at 2 stars or lower comes to you as a re-clean request instead.
          </p>
          <p className="text-sm text-slate">{quality.openRecleans} open re-clean request{quality.openRecleans === 1 ? '' : 's'}</p>
          <Link href="/admin/reviews" className="text-sm font-semibold text-gold hover:underline">See reviews →</Link>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-bold">Email campaigns</h3>
          <p className="text-sm text-slate">
            One-off emails to a group of clients. {snapshot.unsubscribed} client{snapshot.unsubscribed === 1 ? ' has' : 's have'} unsubscribed and won’t get them.
          </p>
        </div>
        <CampaignsManager
          campaigns={campaigns.map((c) => ({ ...c, sentAt: c.sentAt ? c.sentAt.toISOString() : null }))}
          segments={SEGMENTS.map((s) => ({ ...s, count: snapshot.counts[s.key] }))}
          company={tenant.name}
          emailReady={emailConfigured()}
        />
      </section>
    </div>
  );
}
