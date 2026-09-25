import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getAccountBookings } from '@/lib/account';
import { formatMoney, SERVICE_LABELS } from '@/lib/data';
import { formatDateLabel } from '@/lib/scheduling';
import { invoiceLabel } from '@/lib/invoices';

export const dynamic = 'force-dynamic';

export default async function AccountInvoices() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id: string; role?: string };
  if (user.role === 'ADMIN') redirect('/admin/invoices');

  const rows = (await getAccountBookings(user.id)).filter((r) => r.invoice).reverse();
  const due = rows.filter((r) => r.invoice!.status === 'SENT');

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Billing</p>
        <h1 className="mt-1 text-3xl font-extrabold">Invoices</h1>
        {due.length > 0 && (
          <p className="mt-2 text-slate">
            {formatMoney(due.reduce((s, r) => s + r.invoice!.totalCents, 0))} due across {due.length} invoice{due.length === 1 ? '' : 's'}.
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="card text-slate">No invoices yet. After each cleaning, your invoice will appear here.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ invoice, booking, service }) => (
            <Link key={invoice!.id} href={`/account/invoices/${invoice!.id}`} className="card-interactive flex items-center justify-between gap-4 p-5">
              <div>
                <p className="font-semibold">
                  {invoiceLabel(invoice!)} · {formatMoney(invoice!.totalCents)}
                </p>
                <p className="text-sm text-slate">
                  {service ? SERVICE_LABELS[service.key] ?? service.name : 'Cleaning'} · {formatDateLabel(booking.slotStart.slice(0, 10))}
                </p>
              </div>
              <span className={`pill ${invoice!.status === 'PAID' ? 'bg-emerald-100 text-green' : 'bg-gold/20 text-bronze'}`}>
                {invoice!.status === 'PAID' ? 'Paid' : 'Due'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
