import Link from 'next/link';
import { getTenant } from '@/lib/data';
import { getWeekSchedule, startOfWeek, shiftWeek } from '@/lib/dispatch';
import DispatchJobCard from '@/components/DispatchJobCard';

function dayLabel(dateISO: string) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}

function weekLabel(dates: string[]) {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return `${fmt(dates[0])} – ${fmt(dates[6])}`;
}

function isToday(dateISO: string) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return dateISO === today;
}

// The dispatch board: crews down the side, the week across the top. Built
// by hand rather than pulling in a calendar library — the layout is a
// 7-column grid, and a dependency would add weight without adding
// anything this view actually needs.
export default async function AdminSchedule({ searchParams }: { searchParams: { week?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;

  const start = startOfWeek(searchParams.week);
  const { dates, crews, byCrew, unassigned, quoteVisits } = await getWeekSchedule(tenant.id, start);
  const crewOptions = crews.map((c) => ({ id: c.id, name: c.name }));

  const totalJobs = crews.reduce(
    (sum, crew) => sum + dates.reduce((s, d) => s + byCrew[crew.id][d].length, 0),
    0,
  );
  const unassignedCount = dates.reduce((s, d) => s + unassigned[d].length, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Schedule</h1>
          <p className="text-ink/60">
            {totalJobs} {totalJobs === 1 ? 'job' : 'jobs'} this week
            {unassignedCount > 0 && ` · ${unassignedCount} needing a crew`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/schedule?week=${shiftWeek(start, -1)}`} className="btn-secondary !px-4 !py-2 text-sm">
            ←
          </Link>
          <span className="min-w-[150px] text-center text-sm font-semibold text-ink">{weekLabel(dates)}</span>
          <Link href={`/admin/schedule?week=${shiftWeek(start, 1)}`} className="btn-secondary !px-4 !py-2 text-sm">
            →
          </Link>
          <Link href="/admin/schedule" className="ml-1 text-sm text-ink/50 hover:text-ink">
            Today
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[120px_repeat(7,1fr)] gap-2">
            <div />
            {dates.map((date) => (
              <div
                key={date}
                className={`rounded-lg px-2 py-1.5 text-center text-sm font-semibold ${
                  isToday(date) ? 'bg-gold/20 text-bronze' : 'text-ink/60'
                }`}
              >
                {dayLabel(date)}
              </div>
            ))}

            {crews.map((crew) => (
              <div key={crew.id} className="contents">
                <div className="flex items-center pr-2 text-sm font-semibold text-ink">{crew.name}</div>
                {dates.map((date) => (
                  <div
                    key={date}
                    className={`min-h-[90px] space-y-2 rounded-xl border border-ink/5 p-1.5 ${
                      isToday(date) ? 'bg-gold/5' : 'bg-ink/[0.02]'
                    }`}
                  >
                    {byCrew[crew.id][date].map((entry) => (
                      <DispatchJobCard
                        key={entry.bookingId}
                        bookingId={entry.bookingId}
                        clientId={entry.clientId}
                        clientName={entry.clientName}
                        serviceName={entry.serviceName}
                        slotStart={entry.slotStart}
                        slotEnd={entry.slotEnd}
                        addressLine={entry.addressLine}
                        jobStatus={entry.jobStatus}
                        crewId={entry.crewId}
                        crews={crewOptions}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}

            {unassignedCount > 0 && (
              <div className="contents">
                <div className="flex items-center pr-2 text-sm font-semibold text-amber-700">Needs a crew</div>
                {dates.map((date) => (
                  <div
                    key={date}
                    className="min-h-[70px] space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-1.5"
                  >
                    {unassigned[date].map((entry) => (
                      <DispatchJobCard
                        key={entry.bookingId}
                        bookingId={entry.bookingId}
                        clientId={entry.clientId}
                        clientName={entry.clientName}
                        serviceName={entry.serviceName}
                        slotStart={entry.slotStart}
                        slotEnd={entry.slotEnd}
                        addressLine={entry.addressLine}
                        jobStatus={entry.jobStatus}
                        crewId={entry.crewId}
                        crews={crewOptions}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="contents">
              <div className="flex items-center pr-2 text-sm font-semibold text-ink/50">Quote visits</div>
              {dates.map((date) => (
                <div
                  key={date}
                  className={`min-h-[70px] space-y-2 rounded-xl border border-dashed border-ink/10 p-1.5 ${
                    isToday(date) ? 'bg-gold/5' : ''
                  }`}
                >
                  {quoteVisits[date].map((entry) => (
                    <Link
                      key={entry.bookingId}
                      href={`/admin/leads`}
                      className="block rounded-xl border border-ink/10 bg-white p-2 text-xs hover:border-gold"
                    >
                      <span className="font-semibold text-ink">{entry.slotStart.split('T')[1].slice(0, 5)}</span>
                      <p className="font-medium text-ink">{entry.clientName}</p>
                      {entry.addressLine && <p className="truncate text-ink/40">{entry.addressLine}</p>}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-sm text-ink/50">
        Quote visits are your own calendar, not crew capacity — that's why they sit on their own row. Moving a job
        to a crew that's already busy at that time is refused, the same as when a customer books.
      </p>
    </div>
  );
}
