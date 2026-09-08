import Link from 'next/link';
import { getTenant, getAllBookings, getPrimaryCrew } from '@/lib/data';

export default async function AdminOverview() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const bookings = await getAllBookings(tenant.id);
  const crew = await getPrimaryCrew(tenant.id);

  const now = new Date().toISOString();
  const quoteVisits = bookings.filter((b) => b.isQuoteVisit && b.status !== 'CANCELLED');
  const upcomingQuoteVisits = quoteVisits.filter((b) => b.slotStart >= now);
  const jobs = bookings.filter((b) => !b.isQuoteVisit && b.status !== 'CANCELLED');
  const upcomingJobs = jobs.filter((b) => b.slotStart >= now);

  const stats = [
    { label: 'Upcoming quote visits', value: upcomingQuoteVisits.length },
    { label: 'Upcoming cleaning jobs', value: upcomingJobs.length },
    { label: 'Total bookings on file', value: bookings.length },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Good to see you</h1>
        <p className="text-ink/60">Here's what's happening across 3U3 Cleaning.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className="text-3xl font-black text-bronze">{s.value}</p>
            <p className="text-sm text-ink/60">{s.label}</p>
          </div>
        ))}
      </div>

      {crew && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-ink">Crew schedule (default)</h2>
          <p className="text-sm text-ink/60">
            {Math.floor(crew.workStartMinutes / 60)}:00 – {Math.floor(crew.workEndMinutes / 60)}:00 ·{' '}
            {crew.homesPerDay} homes/day · {crew.commuteBufferMinutes}min commute buffer
          </p>
          <Link href="/admin/crew" className="mt-3 inline-block text-sm font-semibold text-bronze underline">
            Adjust settings →
          </Link>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-semibold text-ink">Next up</h2>
        {[...upcomingQuoteVisits, ...upcomingJobs]
          .sort((a, b) => a.slotStart.localeCompare(b.slotStart))
          .slice(0, 5)
          .map((b) => (
            <div key={b.id} className="flex items-center justify-between border-b border-ink/5 py-2 text-sm last:border-0">
              <span>{b.isQuoteVisit ? 'Quote visit' : 'Cleaning job'}</span>
              <span className="text-ink/60">{b.slotStart.replace('T', ' ')}</span>
            </div>
          ))}
        {upcomingQuoteVisits.length + upcomingJobs.length === 0 && (
          <p className="text-sm text-ink/50">Nothing scheduled yet.</p>
        )}
      </div>
    </div>
  );
}
