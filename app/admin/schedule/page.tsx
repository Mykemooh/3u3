import Link from 'next/link';
import { getTenant } from '@/lib/data';
import { getWeekSchedule, startOfWeek, shiftWeek } from '@/lib/dispatch';
import { getEmployees, staffForJobs } from '@/lib/team';
import { businessTodayISO } from '@/lib/time';
import ScheduleBoard from '@/components/team/ScheduleBoard';

export const dynamic = 'force-dynamic';

function weekLabel(dates: string[]) {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return `${fmt(dates[0])} – ${fmt(dates[6])}`;
}

// The dispatch board: teams down the side, the week across the top. Job
// cards drag between teams and days, and open to edit their time and who's
// on them (components/team/ScheduleBoard.tsx). Built by hand on dnd-kit
// rather than a calendar library — the layout is a 7-column grid.
export default async function AdminSchedule({ searchParams }: { searchParams: { week?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;

  const start = startOfWeek(searchParams.week);
  const [{ dates, crews, byCrew, unassigned, quoteVisits }, employees] = await Promise.all([
    getWeekSchedule(tenant.id, start),
    getEmployees(tenant.id),
  ]);
  const entries = [
    ...crews.flatMap((c) => dates.flatMap((d) => byCrew[c.id][d])),
    ...dates.flatMap((d) => unassigned[d]),
    ...dates.flatMap((d) => quoteVisits[d]),
  ];
  const staff = await staffForJobs(
    entries.filter((e) => e.jobId && e.crewId).map((e) => ({ id: e.jobId!, crewId: e.crewId! })),
  );

  const totalJobs = entries.filter((e) => !e.isQuoteVisit && e.crewId).length;
  const unassignedCount = entries.filter((e) => !e.isQuoteVisit && !e.crewId).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Schedule</h1>
          <p className="text-slate">
            {totalJobs} {totalJobs === 1 ? 'job' : 'jobs'} this week
            {unassignedCount > 0 && ` · ${unassignedCount} needing a team`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/schedule?week=${shiftWeek(start, -1)}`} className="btn-secondary !px-4 !py-2 text-sm" aria-label="Previous week">
            ←
          </Link>
          <span className="min-w-[150px] text-center text-sm font-semibold text-ink">{weekLabel(dates)}</span>
          <Link href={`/admin/schedule?week=${shiftWeek(start, 1)}`} className="btn-secondary !px-4 !py-2 text-sm" aria-label="Next week">
            →
          </Link>
          <Link href="/admin/schedule" className="ml-1 text-sm text-muted hover:text-ink">
            Today
          </Link>
        </div>
      </div>

      <ScheduleBoard
        dates={dates}
        today={businessTodayISO()}
        teams={crews.map((c) => ({ id: c.id, name: c.name }))}
        cards={entries.map((e) => ({ ...e, staff: e.jobId ? staff[e.jobId] ?? [] : [] }))}
        people={employees.map((e) => ({ id: e.id, name: e.name, staffRole: e.staffRole, crewId: e.crewId }))}
      />

      <p className="mt-6 text-sm text-muted">
        Quote visits are your own calendar, not team capacity — that's why they sit on their own row. Moving a job onto a
        team that's already busy at that time is refused, the same as when a customer books. Jobs that have started can't
        move.
      </p>
    </div>
  );
}
