import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import TeamNoteButton from '@/components/account/TeamNoteButton';

type Props = {
  next: { bookingId: string; slotStart: string; slotEnd: string; serviceName: string; note: string | null; onTheWay: boolean } | null;
  openQuotes: { id: string; href: string | null; totalCents: number; status: string }[];
  lastClean: { jobId: string; date: string; photoCount: number; reviewed: boolean } | null;
  balanceCents: number;
  unpaidHref: string | null;
  canBook: boolean;
};

function Card({ title, big, sub, children }: { title: string; big: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
      <p className="text-sm font-semibold text-slate">{title}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">{big}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
      {children && <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">{children}</div>}
    </div>
  );
}

/**
 * The client portal's dashboard: when is my next clean, is anything
 * waiting on me, how did the last one go, and do I owe anything — each
 * card with the one or two things a client actually does from it.
 */
export default function ClientDashboard(p: Props) {
  return (
    <section aria-label="Your dashboard" className="grid gap-3 sm:grid-cols-2">
      <Card
        title="Next clean"
        big={p.next ? formatDateLabel(p.next.slotStart.slice(0, 10)) : 'Nothing booked'}
        sub={p.next ? `${formatSlotLabel(p.next.slotStart, p.next.slotEnd)} · ${p.next.serviceName}` : undefined}
      >
        {p.next ? (
          <>
            {p.next.onTheWay && <p className="font-semibold text-green">Your crew is on the way — see the map below.</p>}
            <Link href="/account/settings#bookings" className="block font-semibold text-bronze hover:underline">Reschedule or change</Link>
            <TeamNoteButton bookingId={p.next.bookingId} initial={p.next.note} />
          </>
        ) : p.canBook ? (
          <Link href="/book" className="block font-semibold text-bronze hover:underline">Book a cleaning</Link>
        ) : (
          <p className="text-muted">You can book once your estimate is approved.</p>
        )}
      </Card>

      <Card
        title="Quotes"
        big={p.openQuotes.length ? `${p.openQuotes.length} waiting` : 'All answered'}
        sub={p.openQuotes.length ? 'Approve or ask for changes' : undefined}
      >
        {p.openQuotes.length === 0 ? (
          <Link href="/new" className="block font-semibold text-bronze hover:underline">Request a quote for something else</Link>
        ) : (
          p.openQuotes.slice(0, 2).map((q) =>
            q.href ? (
              <Link key={q.id} href={q.href} className="flex justify-between font-semibold text-bronze hover:underline">
                <span>Review quote</span>
                <span>{formatMoney(q.totalCents)}</span>
              </Link>
            ) : null,
          )
        )}
      </Card>

      <Card
        title="Last clean"
        big={p.lastClean ? formatDateLabel(p.lastClean.date) : 'Not yet'}
        sub={p.lastClean ? `${p.lastClean.photoCount} before & after photo${p.lastClean.photoCount === 1 ? '' : 's'}` : undefined}
      >
        {p.lastClean && (
          <>
            <Link href={`/account/jobs/${p.lastClean.jobId}`} className="block font-semibold text-bronze hover:underline">See before & after</Link>
            {!p.lastClean.reviewed && (
              <Link href={`/account/jobs/${p.lastClean.jobId}#rate`} className="block font-semibold text-bronze hover:underline">Rate this clean, room by room</Link>
            )}
          </>
        )}
      </Card>

      <Card title="Billing" big={formatMoney(p.balanceCents)} sub={p.balanceCents ? 'Due now' : 'Nothing owed'}>
        {p.unpaidHref && <Link href={p.unpaidHref} className="block font-semibold text-bronze hover:underline">Pay now</Link>}
        <Link href="/account/invoices" className="block font-semibold text-bronze hover:underline">Invoices & receipts</Link>
        <Link href="/account/settings#payment" className="block text-slate hover:text-ink">Card on file & autopay</Link>
      </Card>
    </section>
  );
}
