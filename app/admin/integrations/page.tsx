import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { quickbooksConfigured, quickbooksConnection } from '@/lib/quickbooks';
import DisconnectQuickbooksButton from '@/components/admin/DisconnectQuickbooksButton';

export const dynamic = 'force-dynamic';

export default async function AdminIntegrations({ searchParams }: { searchParams: { qb_connected?: string; qb_error?: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { tenantId?: string } | undefined;
  if (!user?.tenantId) redirect('/admin');

  const connection = await quickbooksConnection(user.tenantId);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-3xl font-extrabold">Integrations</h1>
      </div>

      {searchParams.qb_connected && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">QuickBooks connected.</p>
      )}
      {searchParams.qb_error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{searchParams.qb_error}</p>
      )}

      <div className="card space-y-3">
        <h2 className="font-semibold text-ink">QuickBooks Online</h2>
        <p className="text-sm text-slate">
          When connected, every invoice the moment it's paid is pushed to QuickBooks as a sales receipt — the
          customer (created there if needed), each line item, and any tip — so your books stay current without
          re-entering anything by hand.
        </p>
        {!quickbooksConfigured() ? (
          <p className="rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
            Not available yet — this deployment needs <code>QUICKBOOKS_CLIENT_ID</code> and{' '}
            <code>QUICKBOOKS_CLIENT_SECRET</code> set (free from{' '}
            <a href="https://developer.intuit.com" target="_blank" rel="noreferrer" className="underline">
              developer.intuit.com
            </a>
            ).
          </p>
        ) : connection ? (
          <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
            <div className="text-sm">
              <p className="font-semibold text-green">Connected</p>
              <p className="text-muted">Company file: {connection.externalAccountId}</p>
            </div>
            <DisconnectQuickbooksButton />
          </div>
        ) : (
          <a href="/api/admin/integrations/quickbooks/connect" className="btn-primary !px-4 !py-2 text-sm">
            Connect QuickBooks
          </a>
        )}
        <p className="text-xs text-muted">
          Line items currently post against QuickBooks item id "1" (a fresh company's default "Services" item).
          If your chart of accounts uses a different item for cleaning revenue, update{' '}
          <code>lib/quickbooks.ts</code> (<code>findOrCreateQbCustomer</code> / <code>pushPaidInvoice</code>) to
          match before relying on this in production.
        </p>
      </div>
    </div>
  );
}
