import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEstimateWithItems, estimateUrl } from '@/lib/estimates';
import { getTenant, getServiceTypes, formatMoney } from '@/lib/data';
import EstimateEditor from '@/components/EstimateEditor';

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-surface text-slate',
  SENT: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  DECLINED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-line text-muted',
};

export default async function AdminEstimateDetail({ params }: { params: { id: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const data = await getEstimateWithItems(params.id);
  if (!data) notFound();
  const { quote, items, client, service, visit, address } = data;
  const services = await getServiceTypes(tenant.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/estimates" className="mb-4 inline-block text-sm text-muted hover:text-ink">
        ← All estimates
      </Link>

      <div className="card">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">Estimate — {client?.name ?? 'Unknown client'}</h1>
            <p className="text-sm text-slate">
              {client?.phone}
              {client?.email ? ` · ${client.email}` : ' · no email on file'}
            </p>
            {address && (
              <p className="text-sm text-slate">
                {address.line1}, {address.city}, {address.state}
              </p>
            )}
            {visit && <p className="text-sm text-muted">Walkthrough: {visit.slotStart.replace('T', ' ')}</p>}
          </div>
          <span className={`pill ${STATUS_STYLE[quote.status]}`}>{quote.status}</span>
        </div>

        {quote.status === 'DRAFT' ? (
          <EstimateEditor
            quoteId={quote.id}
            initialItems={items.map((i) => ({ description: i.description, amountCents: i.amountCents }))}
            initialNotes={quote.notes ?? ''}
            initialServiceTypeId={quote.serviceTypeId}
            services={services.map((s) => ({ id: s.id, name: s.name }))}
            clientHasEmail={!!client?.email}
          />
        ) : (
          <div>
            <p className="mb-3 text-sm text-slate">{service?.name}</p>
            <table className="w-full text-sm">
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line">
                    <td className="py-2">{item.description}</td>
                    <td className="py-2 text-right">{formatMoney(item.amountCents)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-semibold">Total</td>
                  <td className="py-2 text-right font-semibold">{formatMoney(quote.totalCents)}</td>
                </tr>
              </tbody>
            </table>

            {quote.notes && (
              <p className="mt-4 rounded-xl bg-gold/10 px-4 py-3 text-sm text-slate">{quote.notes}</p>
            )}

            <div className="mt-6 space-y-2 text-sm">
              {quote.sentAt && <p className="text-slate">Sent {quote.sentAt.toLocaleString()}</p>}
              {quote.expiresAt && quote.status === 'SENT' && (
                <p className="text-slate">Good through {quote.expiresAt.toLocaleDateString()}</p>
              )}
              {quote.respondedAt && (
                <p className={quote.status === 'APPROVED' ? 'text-emerald-700' : 'text-slate'}>
                  {quote.status === 'APPROVED' ? 'Approved' : 'Declined'} {quote.respondedAt.toLocaleString()}
                </p>
              )}
              {quote.status === 'APPROVED' && (
                <p className="text-slate">
                  {formatMoney(quote.totalCents)} is now this client's agreed rate for {service?.name} — they can
                  book it themselves at any time.
                </p>
              )}
              {quote.approvalToken && quote.status === 'SENT' && (
                <p className="break-all text-xs text-muted">
                  Client link: <span className="font-mono">{estimateUrl(quote.approvalToken)}</span>
                </p>
              )}
            </div>

            {client && (
              <Link
                href={`/admin/clients/${client.id}`}
                className="mt-6 inline-block text-sm font-semibold text-bronze hover:underline"
              >
                View client →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
