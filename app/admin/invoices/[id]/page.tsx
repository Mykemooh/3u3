import HistoryPanel from '@/components/admin/HistoryPanel';
import { getTenant } from '@/lib/data';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getInvoiceWithItems, invoiceLabel, onlinePaymentsReady } from '@/lib/invoices';
import { db } from '@/db/client';
import { jobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getServiceType, formatMoney } from '@/lib/data';
import RecordPayment from '@/components/admin/RecordPayment';
import { formatSlotLabel } from '@/lib/scheduling';
import { formatSlotDateLong } from '@/lib/time';
import InvoiceEditor from '@/components/InvoiceEditor';

export default async function AdminInvoiceDetail({ params }: { params: { id: string } }) {
  const tenant = await getTenant();
  const data = await getInvoiceWithItems(params.id);
  if (!data || !tenant || data.invoice.tenantId !== tenant.id) notFound();
  const { invoice, lines, client, booking, address } = data;
  const service = booking?.serviceTypeId ? await getServiceType(booking.serviceTypeId) : undefined;
  const online = await onlinePaymentsReady(tenant.id, invoice.totalCents).catch(() => false);
  const job = booking ? (await db.select().from(jobs).where(eq(jobs.bookingId, booking.id)).limit(1))[0] : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/invoices" className="mb-4 inline-block text-sm text-muted hover:text-ink">
        ← All invoices
      </Link>

      <div className="card">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-bronze">{invoiceLabel(invoice)}</p>
            <h1 className="text-xl font-bold text-ink">{client?.name ?? 'Unknown client'}</h1>
            <p className="text-sm text-slate">
              {service?.name ?? 'Cleaning service'}
              {booking && ` · ${formatSlotDateLong(booking.slotStart)}, ${formatSlotLabel(booking.slotStart, booking.slotEnd)}`}
            </p>
            {address ? (
              <p className="text-sm text-slate">
                {address.line1}, {address.city}, {address.state} {address.zip ?? ''}
              </p>
            ) : (
              <p className="text-sm text-amber-700">No service address on file — add one so it prints on the invoice.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
              {job && (
                <Link href={`/account/jobs/${job.id}`} className="text-bronze hover:underline">
                  Before-and-after photos
                </Link>
              )}
              <Link href={`/account/invoices/${invoice.id}`} className="text-bronze hover:underline">
                {invoice.status === 'DRAFT' ? "Preview the client's invoice" : "Client's invoice view"}
              </Link>
            </div>
          </div>
          <span className="pill bg-gold/15 text-bronze">{invoice.status}</span>
        </div>

        {invoice.status === 'DRAFT' ? (
          <InvoiceEditor
            invoiceId={invoice.id}
            initialItems={lines.map((i) => ({ description: i.description, amountCents: i.amountCents }))}
            clientHasEmail={!!client?.email}
            stripeConfigured={online}
          />
        ) : null}
        {invoice.status === 'DRAFT' && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-sm text-slate">Paid on the spot? Save your changes, then record it — no need to send first.</p>
            <RecordPayment invoiceId={invoice.id} amount={formatMoney(invoice.totalCents)} />
          </div>
        )}
        {invoice.status === 'DRAFT' ? null : (
          <div>
            <table className="w-full text-sm">
              <tbody>
                {lines.map((item) => (
                  <tr key={item.id} className="border-b border-line">
                    <td className="py-2">{item.description}{item.synthetic && <span className="ml-2 text-xs text-muted">(not itemised)</span>}</td>
                    <td className="py-2 text-right">{formatMoney(item.amountCents)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-semibold">Total</td>
                  <td className="py-2 text-right font-semibold">{formatMoney(invoice.totalCents)}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-6 space-y-2 text-sm">
              {invoice.sentAt && <p className="text-slate">Sent {invoice.sentAt.toLocaleString()}</p>}
              {invoice.status === 'SENT' && !invoice.hostedInvoiceUrl && (
                <p className="text-slate">No card payment link on this one — record the payment when the client pays you.</p>
              )}
              {invoice.status === 'SENT' && <RecordPayment invoiceId={invoice.id} amount={formatMoney(invoice.totalCents)} />}
              {invoice.hostedInvoiceUrl && invoice.status === 'SENT' && (
                <p>
                  <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="font-semibold text-bronze hover:underline">
                    View pay link →
                  </a>
                </p>
              )}
              {invoice.invoicePdfUrl && (
                <p>
                  <a href={invoice.invoicePdfUrl} target="_blank" rel="noreferrer" className="text-slate hover:underline">
                    Download PDF
                  </a>
                </p>
              )}
              {invoice.status === 'PAID' && (
                <>
                  <p className="text-emerald-700">
                    Paid {invoice.paidAt?.toLocaleString()}
                    {invoice.autopayCharged && ' · autopay'}
                  </p>
                  {invoice.tipCents > 0 && <p className="text-slate">Tip: {formatMoney(invoice.tipCents)}</p>}
                  {invoice.receiptUrl && (
                    <p>
                      <a href={invoice.receiptUrl} target="_blank" rel="noreferrer" className="font-semibold text-bronze hover:underline">
                        View Stripe receipt →
                      </a>
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="mt-6">
        <HistoryPanel tenantId={tenant.id} entityType="invoice" entityId={data.invoice.id} />
      </div>
    </div>
  );
}
