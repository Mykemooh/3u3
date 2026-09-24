import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getAccountBookings, cleaningJourney, type AccountBooking } from '@/lib/account';
import { getClientRatesFor, formatMoney, SERVICE_LABELS } from '@/lib/data';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { businessNowISO } from '@/lib/time';
import { invoiceLabel } from '@/lib/invoices';
import JourneyRail from '@/components/app/JourneyRail';

export const dynamic = 'force-dynamic';

function serviceName(row: AccountBooking) {
  return row.service ? SERVICE_LABELS[row.service.key] ?? row.service.name : 'Cleaning';
}

export default async function AccountHome() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id: string; name?: string; role?: string };
  if (user.role === 'ADMIN') redirect('/admin');

  const [rows, rates] = await Promise.all([getAccountBookings(user.id), getClientRatesFor(user.id)]);
  const now = businessNowISO();

  // The "live" cleaning: one in progress, else the next one booked, else the
  // most recent that still has something to act on (photos, invoice).
  const active = rows.find((r) => r.job?.status === 'IN_PROGRESS');
  const upcoming = rows.filter((r) => r.booking.slotEnd >= now && r.job?.status !== 'COMPLETE');
  const past = rows.filter((r) => r.job?.status === 'COMPLETE').reverse();
  const needsPayment = rows.filter((r) => r.invoice?.status === 'SENT');
  const focus = active ?? upcoming[0] ?? past[0];
  const first = (user.name ?? 'there').split(' ')[0];

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Your home, cared for</p>
        <h1 className="mt-1 text-3xl font-extrabold">Hi {first}</h1>
      </div>

      {needsPayment.length > 0 && (
        <Link href={`/account/invoices/${needsPayment[0].invoice!.id}`} className="flex items-center justify-between gap-4 rounded-2xl bg-cream px-5 py-4 transition hover:-translate-y-0.5">
          <div>
            <p className="font-semibold text-ink">
              {needsPayment.length === 1 ? 'An invoice is ready' : `${needsPayment.length} invoices are ready`}
            </p>
            <p className="text-sm text-bronze">
              {invoiceLabel(needsPayment[0].invoice!)} · {formatMoney(needsPayment[0].invoice!.totalCents)}
            </p>
          </div>
          <span className="btn-primary btn-sm">View and pay</span>
        </Link>
      )}

      {focus ? (
        <FocusCard row={focus} isPast={focus.job?.status === 'COMPLETE' && focus === past[0] && !active && upcoming.length === 0} />
      ) : (
        <div className="card text-center">
          <h2 className="text-xl font-bold">Ready when you are</h2>
          <p className="mx-auto mt-2 max-w-sm text-slate">
            {rates.length
              ? 'Pick a time that suits you. Our crew of three has most homes done in under three hours.'
              : "Once your estimate is approved, you'll be able to book here."}
          </p>
          {rates.length > 0 && (
            <Link href="/book" className="btn-primary mt-5">
              Book a cleaning
            </Link>
          )}
        </div>
      )}

      {upcoming.filter((r) => r !== focus).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Also booked</h2>
          <div className="space-y-3">
            {upcoming
              .filter((r) => r !== focus)
              .map((r) => (
                <div key={r.booking.id} className="card flex items-center justify-between p-5">
                  <div>
                    <p className="font-semibold">{formatDateLabel(r.booking.slotStart.slice(0, 10))}</p>
                    <p className="text-sm text-slate">
                      {formatSlotLabel(r.booking.slotStart, r.booking.slotEnd)} · {serviceName(r)}
                    </p>
                  </div>
                  <span className="pill bg-surface text-slate">Booked</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {past.filter((r) => r !== focus).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Past cleanings</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {past
              .filter((r) => r !== focus)
              .map((r) => (
                <Link key={r.booking.id} href={`/account/jobs/${r.job!.id}`} className="card-interactive flex items-center gap-4 p-4">
                  <Thumb url={r.cover} />
                  <div className="min-w-0">
                    <p className="font-semibold">{formatDateLabel(r.booking.slotStart.slice(0, 10))}</p>
                    <p className="text-sm text-slate">{serviceName(r)}</p>
                    <p className="text-xs font-semibold text-bronze">See before and after</p>
                  </div>
                </Link>
              ))}
          </div>
        </section>
      )}

      {rates.length > 0 && focus && (
        <Link href="/book" className="btn-dark w-full">
          Book another cleaning
        </Link>
      )}
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />
  ) : (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface text-xs text-muted">No photo</span>
  );
}

function FocusCard({ row, isPast }: { row: AccountBooking; isPast: boolean }) {
  const { booking, job, invoice } = row;
  const status = job?.status;
  const heading =
    status === 'IN_PROGRESS'
      ? 'Your crew is cleaning now'
      : status === 'COMPLETE'
      ? isPast
        ? 'Your last cleaning'
        : 'All done'
      : 'Your next cleaning';

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="p-6">
        <p className="eyebrow">{heading}</p>
        <p className="mt-2 text-2xl font-bold">{formatDateLabel(booking.slotStart.slice(0, 10))}</p>
        <p className="mt-1 text-slate">
          {formatSlotLabel(booking.slotStart, booking.slotEnd)} · {serviceName(row)}
          {booking.priceCents != null ? ` · ${formatMoney(booking.priceCents)}` : ''}
        </p>
        {row.address && <p className="text-slate">{row.address.line1}, {row.address.city}</p>}
        <div className="mt-6">
          <JourneyRail steps={cleaningJourney(row)} />
        </div>
      </div>
      {status === 'COMPLETE' && job && (
        <Link href={`/account/jobs/${job.id}`} className="flex items-center gap-4 border-t border-line bg-surface p-4 transition hover:bg-cream/60">
          <Thumb url={row.cover} />
          <div>
            <p className="font-semibold">See your before and after</p>
            <p className="text-sm text-slate">
              {row.photoCount} photo{row.photoCount === 1 ? '' : 's'}
              {row.videoCount ? ` · ${row.videoCount} video${row.videoCount === 1 ? '' : 's'}` : ''}
            </p>
          </div>
        </Link>
      )}
      {invoice && (
        <Link href={`/account/invoices/${invoice.id}`} className="flex items-center justify-between border-t border-line px-6 py-4 text-sm font-semibold transition hover:bg-cream/60">
          <span>
            {invoiceLabel(invoice)} · {formatMoney(invoice.totalCents)}
          </span>
          <span className={invoice.status === 'PAID' ? 'text-green' : 'text-bronze'}>{invoice.status === 'PAID' ? 'Paid' : 'View and pay'}</span>
        </Link>
      )}
      {status === 'IN_PROGRESS' && (
        <p className="border-t border-line bg-cream/60 px-6 py-3 text-sm text-bronze">
          We'll email you before-and-after photos of every room as soon as the crew finishes.
        </p>
      )}
    </section>
  );
}
