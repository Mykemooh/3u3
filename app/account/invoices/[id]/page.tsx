import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getInvoiceWithItems, invoiceLabel } from '@/lib/invoices';
import { formatMoney, SERVICE_LABELS } from '@/lib/data';
import { formatSlotDateLong } from '@/lib/time';
import { db } from '@/db/client';
import { jobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import PrintButton from '@/components/account/PrintButton';

export const dynamic = 'force-dynamic';

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : phone;
}

function longDate(d: Date | null | undefined) {
  return d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : '—';
}

export default async function InvoiceView({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) redirect(`/signin?next=/account/invoices/${params.id}`);

  const data = await getInvoiceWithItems(params.id);
  if (!data) notFound();
  const { invoice, items, client, booking, address, service } = data;
  // A client sees only their own invoices, and only once sent — a draft is
  // the office's working copy.
  if (user.role !== 'ADMIN' && (invoice.clientId !== user.id || invoice.status === 'DRAFT' || invoice.status === 'VOID')) notFound();

  const job = booking ? (await db.select().from(jobs).where(eq(jobs.bookingId, booking.id)).limit(1))[0] : undefined;
  const issued = invoice.sentAt ?? invoice.createdAt;
  const dueDate = new Date(issued.getTime() + 7 * 24 * 60 * 60 * 1000);
  const subtotal = items.reduce((s, i) => s + i.amountCents, 0);
  const serviceName = service ? SERVICE_LABELS[service.key] ?? service.name : 'Cleaning service';

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={user.role === 'ADMIN' ? `/admin/invoices/${invoice.id}` : '/account/invoices'}
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
        >
          <span aria-hidden="true">←</span> {user.role === 'ADMIN' ? 'Back to admin' : 'All invoices'}
        </Link>
        <div className="flex flex-wrap gap-2">
          {invoice.status === 'SENT' && invoice.hostedInvoiceUrl && user.role !== 'ADMIN' && (
            <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
              Pay {formatMoney(invoice.totalCents)}
            </a>
          )}
          {job && (
            <Link href={`/account/jobs/${job.id}`} className="btn-secondary btn-sm">
              Before and after
            </Link>
          )}
          <PrintButton />
        </div>
      </div>

      {user.role === 'ADMIN' && invoice.status === 'DRAFT' && (
        <p className="no-print rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
          Draft preview — this is exactly what the client will see once you send it.
        </p>
      )}

      <article className="print-sheet overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <header className="flex items-center justify-between gap-4 bg-ink px-6 py-5 text-white sm:px-8">
          <img src="/brand/logo-640.png" alt="3U3 Cleaning" className="h-auto w-36 sm:w-44" />
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Invoice</p>
            <p className="mt-1 text-xl font-bold text-white">{invoiceLabel(invoice)}</p>
          </div>
        </header>
        <div className="flow-line" aria-hidden="true" />

        <div className="space-y-8 px-6 py-7 sm:px-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Billed to</p>
              <p className="mt-1 font-semibold">{client?.name}</p>
              {address && (
                <p className="text-slate">
                  {address.line1}
                  <br />
                  {address.city}, {address.state} {address.zip ?? ''}
                </p>
              )}
              {client?.email && <p className="text-slate">{client.email}</p>}
              {client?.phone && <p className="text-slate">{formatPhone(client.phone)}</p>}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:text-right">
              <dt className="text-muted">Service date</dt>
              <dd className="font-semibold">{booking ? formatSlotDateLong(booking.slotStart) : '—'}</dd>
              <dt className="text-muted">Issued</dt>
              <dd className="font-semibold">{longDate(issued)}</dd>
              <dt className="text-muted">{invoice.status === 'PAID' ? 'Paid' : 'Due'}</dt>
              <dd className="font-semibold">{invoice.status === 'PAID' ? longDate(invoice.paidAt) : longDate(dueDate)}</dd>
              <dt className="text-muted">Service</dt>
              <dd className="font-semibold">{serviceName}</dd>
            </dl>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-ink text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-bold">Description</th>
                <th className="pb-2 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-3 pr-4">{item.description}</td>
                  <td className="py-3 text-right tabular-nums">{formatMoney(item.amountCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-4 text-right text-slate">Subtotal</td>
                <td className="pt-4 text-right tabular-nums">{formatMoney(subtotal)}</td>
              </tr>
              <tr>
                <td className="pt-2 text-right text-lg font-bold">Total</td>
                <td className="pt-2 text-right text-lg font-bold tabular-nums">{formatMoney(invoice.totalCents)}</td>
              </tr>
            </tfoot>
          </table>

          {invoice.status === 'PAID' ? (
            <p className="inline-flex rounded-full border-2 border-green px-4 py-1 text-sm font-bold uppercase tracking-wide text-green">Paid — thank you</p>
          ) : (
            <p className="text-sm text-slate">Payment is due within 7 days. Pay securely by card from the link in your invoice email, or from your 3U3 account.</p>
          )}

          <footer className="border-t border-line pt-5 text-sm text-muted">
            <p className="font-semibold text-slate">3U3 Cleaning — Family Owned by Parents of Three boys, Built in Texas.</p>
            <p>Katy, TX · Thank you for trusting us with your home.</p>
          </footer>
        </div>
      </article>

      <div className="no-print flex flex-wrap gap-2">
        {invoice.status === 'SENT' && invoice.hostedInvoiceUrl && (
          <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="btn-primary">
            Pay {formatMoney(invoice.totalCents)}
          </a>
        )}
        {invoice.status === 'PAID' && invoice.receiptUrl && (
          <a href={invoice.receiptUrl} target="_blank" rel="noreferrer" className="btn-secondary">
            Card receipt
          </a>
        )}
      </div>
    </div>
  );
}
