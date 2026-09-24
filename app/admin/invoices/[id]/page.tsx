import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getInvoiceWithItems, invoiceLabel } from '@/lib/invoices';
import { db } from '@/db/client';
import { jobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getServiceType, formatMoney } from '@/lib/data';
import { isStripeConfigured } from '@/lib/stripe';
import InvoiceEditor from '@/components/InvoiceEditor';

export default async function AdminInvoiceDetail({ params }: { params: { id: string } }) {
  const data = await getInvoiceWithItems(params.id);
  if (!data) notFound();
  const { invoice, items, client, booking, address } = data;
  const service = booking?.serviceTypeId ? await getServiceType(booking.serviceTypeId) : undefined;
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
              {booking && ` · ${booking.slotStart.replace('T', ' ').slice(0, 16)}`}
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
