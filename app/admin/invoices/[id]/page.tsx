import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getInvoiceWithItems } from '@/lib/invoices';
import { getServiceType, formatMoney } from '@/lib/data';
import { isStripeConfigured } from '@/lib/stripe';
import InvoiceEditor from '@/components/InvoiceEditor';

export default async function AdminInvoiceDetail({ params }: { params: { id: string } }) {
  const data = await getInvoiceWithItems(params.id);
  if (!data) notFound();
  const { invoice, items, client, booking } = data;
  const service = booking?.serviceTypeId ? await getServiceType(booking.serviceTypeId) : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/invoices" className="mb-4 inline-block text-sm text-muted hover:text-ink">
        ← All invoices
      </Link>

      <div className="card">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">Invoice — {client?.name ?? 'Unknown client'}</h1>
            <p className="text-sm text-slate">
              {service?.name ?? 'Cleaning service'}
              {booking && ` · ${booking.slotStart.replace('T', ' ')}`}
            </p>
          </div>
          <span className="pill bg-gold/15 text-bronze">{invoice.status}</span>
        </div>

        {invoice.status === 'DRAFT' ? (
          <InvoiceEditor
            invoiceId={invoice.id}
            initialItems={items.map((i) => ({ description: i.description, amountCents: i.amountCents }))}
            clientHasEmail={!!client?.email}
            stripeConfigured={isStripeConfigured()}
          />
        ) : (
          <div>
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
                  <td className="py-2 text-right font-semibold">{formatMoney(invoice.totalCents)}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-6 space-y-2 text-sm">
              {invoice.sentAt && <p className="text-slate">Sent {invoice.sentAt.toLocaleString()}</p>}
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
                  <p className="text-emerald-700">Paid {invoice.paidAt?.toLocaleString()}</p>
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
    </div>
  );
}
