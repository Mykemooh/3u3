import Link from 'next/link';
import { db } from '@/db/client';
import { invoices, jobs } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getTenant, getAllBookings, getPrimaryCrew, getClientsForTenant, formatMoney } from '@/lib/data';
import { businessNowISO, businessTodayISO } from '@/lib/time';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { invoiceLabel } from '@/lib/invoices';

/**
 * The owner's morning view: what needs a decision first (drafts to send,
 * jobs underway), then what's coming. Every number links to where it's
 * dealt with.
 */
export default async function AdminOverview() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const [allBookings, crew, clients, invoiceRows] = await Promise.all([
    getAllBookings(tenant.id),
    getPrimaryCrew(tenant.id),
    getClientsForTenant(tenant.id),
    db.select().from(invoices).where(eq(invoices.tenantId, tenant.id)),
  ]);

  const now = businessNowISO();
  const today = businessTodayISO();
  const live = allBookings.filter((b) => b.status !== 'CANCELLED');
  const upcomingQuoteVisits = live.filter((b) => b.isQuoteVisit && b.slotEnd >= now);
  const cleaning = live.filter((b) => !b.isQuoteVisit);
  const upcomingJobs = cleaning.filter((b) => b.slotEnd >= now && b.status !== 'COMPLETED');

  const jobRows = cleaning.length ? await db.select().from(jobs).where(inArray(jobs.bookingId, cleaning.map((b) => b.id))) : [];
  const inProgress = jobRows.filter((j) => j.status === 'IN_PROGRESS');
  const drafts = invoiceRows.filter((i) => i.status === 'DRAFT');
  const unpaid = invoiceRows.filter((i) => i.status === 'SENT');
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const bookingById = new Map(cleaning.map((b) => [b.id, b]));

  const stats = [
    { label: 'Invoices to review', value: drafts.length, href: '/admin/invoices', hot: drafts.length > 0 },
    { label: 'Awaiting payment', value: formatMoney(unpaid.reduce((s, i) => s + i.totalCents, 0)), href: '/admin/invoices', hot: false },
    { label: 'Upcoming cleanings', value: upcomingJobs.length, href: '/admin/schedule', hot: false },
    { label: 'Upcoming quote visits', value: upcomingQuoteVisits.length, href: '/admin/leads', hot: false },
  ];

  const nextUp = [...upcomingQuoteVisits, ...upcomingJobs].sort((a, b) => a.slotStart.localeCompare(b.slotStart)).slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{formatDateLabel(today)}</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Good to see you</h1>
        <p className="text-slate">{clients.length} client{clients.length === 1 ? "" : "s"} on file.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className={`card-interactive block p-5 ${s.hot ? 'border-gold bg-cream/40' : ''}`}>
            <p className="text-3xl font-black text-bronze">{s.value}</p>
            <p className="text-sm text-slate">{s.label}</p>
          </Link>
        ))}
      </div>

      {(drafts.length > 0 || inProgress.length > 0) && (
        <section className="card">
          <h2 className="mb-3 font-semibold text-ink">Needs you</h2>
          <ul className="divide-y divide-line">
            {inProgress.map((j) => {
              const b = bookingById.get(j.bookingId);
              return (
                <li key={j.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    <span className="pill mr-2 bg-gold/20 text-bronze">Cleaning now</span>
                    {b ? clientName.get(b.clientId) : 'Job'}
                  </span>
                  <Link href={`/crew/jobs/${j.id}`} className="font-semibold text-bronze hover:underline">
                    Watch progress
                  </Link>
                </li>
              );
            })}
            {drafts.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="pill mr-2 bg-surface text-slate">Draft</span>
                  {invoiceLabel(i)} · {clientName.get(i.clientId)} · {formatMoney(i.totalCents)}
                </span>
                <Link href={`/admin/invoices/${i.id}`} className="font-semibold text-bronze hover:underline">
                  Review and send
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 font-semibold text-ink">Next up</h2>
        {nextUp.length === 0 ? (
          <p className="text-sm text-muted">Nothing scheduled yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {nextUp.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className={`pill mr-2 ${b.isQuoteVisit ? 'bg-cream text-bronze' : 'bg-surface text-slate'}`}>
                    {b.isQuoteVisit ? 'Quote visit' : 'Cleaning'}
                  </span>
                  {clientName.get(b.clientId) ?? ''}
                </span>
                <span className="text-slate">
                  {b.slotStart.startsWith(today) ? 'Today' : formatDateLabel(b.slotStart.slice(0, 10))} · {formatSlotLabel(b.slotStart, b.slotEnd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {crew && (
        <div className="card">
          <h2 className="mb-2 font-semibold text-ink">Crew schedule (default)</h2>
          <p className="text-sm text-slate">
            {Math.floor(crew.workStartMinutes / 60)}:00 – {Math.floor(crew.workEndMinutes / 60)}:00 · {crew.homesPerDay} homes a day ·{' '}
            {crew.commuteBufferMinutes} min between homes
          </p>
          <Link href="/admin/crew" className="mt-3 inline-block text-sm font-semibold text-bronze underline">
            Adjust settings
          </Link>
        </div>
      )}
    </div>
  );
}
