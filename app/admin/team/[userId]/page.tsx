import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { bookings, jobs, users, addresses, serviceTypes } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { getTenant, SERVICE_LABELS, getUserById } from '@/lib/data';
import { getEmployees, getTeams, jobIdsForEmployee, STAFF_ROLE_LABELS } from '@/lib/team';
import { startOfWeek, shiftWeek, weekDates } from '@/lib/dispatch';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { businessTodayISO } from '@/lib/time';
import PayRateInput from '@/components/admin/PayRateInput';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = { PENDING: 'Booked', EN_ROUTE: 'On the way', IN_PROGRESS: 'Cleaning', COMPLETE: 'Done' };

function minutes(iso: string) {
  const [h, m] = iso.split('T')[1].split(':').map(Number);
  return h * 60 + m;
}

// One employee's week: every job they're on — their team's, minus any
// they were taken off, plus any they were borrowed onto.
export default async function EmployeePage({ params, searchParams }: { params: { userId: string }; searchParams: { week?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const [employees, teams] = await Promise.all([getEmployees(tenant.id), getTeams(tenant.id)]);
  const employee = employees.find((e) => e.id === params.userId);
  if (!employee) notFound();
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? 'No team';
  const fullUser = await getUserById(employee.id);

  const start = startOfWeek(searchParams.week);
  const dates = weekDates(start);
  const ids = await jobIdsForEmployee(employee.id);
  const jobRows = ids.length ? await db.select().from(jobs).where(inArray(jobs.id, ids)) : [];
  const bookingRows = jobRows.length
    ? (await db.select().from(bookings).where(inArray(bookings.id, jobRows.map((j) => j.bookingId)))).filter(
        (b) => b.status !== 'CANCELLED' && b.slotStart.slice(0, 10) >= dates[0] && b.slotStart.slice(0, 10) <= dates[6],
      )
    : [];
  const [clientRows, addressRows, serviceRows] = await Promise.all([
    bookingRows.length ? db.select().from(users).where(inArray(users.id, bookingRows.map((b) => b.clientId))) : [],
    bookingRows.some((b) => b.addressId)
      ? db.select().from(addresses).where(inArray(addresses.id, bookingRows.map((b) => b.addressId).filter(Boolean) as string[]))
      : [],
    db.select().from(serviceTypes),
  ]);

  const rows = bookingRows
    .map((b) => {
      const job = jobRows.find((j) => j.bookingId === b.id)!;
      const address = addressRows.find((a) => a.id === b.addressId);
      const service = serviceRows.find((s) => s.id === b.serviceTypeId);
      return {
        b,
        job,
        client: clientRows.find((c) => c.id === b.clientId)?.name ?? 'Client',
        address: address ? `${address.line1}, ${address.city}` : null,
        service: service ? SERVICE_LABELS[service.key] ?? service.name : 'Cleaning',
        borrowed: job.crewId !== employee.crewId,
      };
    })
    .sort((a, z) => a.b.slotStart.localeCompare(z.b.slotStart));
  const totalMinutes = rows.reduce((sum, r) => sum + minutes(r.b.slotEnd) - minutes(r.b.slotStart), 0);
  const today = businessTodayISO();

  return (
    <div className="space-y-6">
      <Link href="/admin/team" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> Team
      </Link>

      <header className="card flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{STAFF_ROLE_LABELS[employee.staffRole]}</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">{employee.name}</h1>
          <p className="text-slate">{teamName(employee.crewId)}</p>
          <p className="mt-1 text-sm text-muted">{[employee.email, employee.phone].filter(Boolean).join(' · ')}</p>
          <PayRateInput userId={employee.id} initialCentsPerHour={fullUser?.payRateCentsPerHour ?? null} />
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold text-ink">{rows.length}</p>
          <p className="text-sm text-slate">
            job{rows.length === 1 ? '' : 's'} this week · {Math.floor(totalMinutes / 60)}h{totalMinutes % 60 ? ` ${totalMinutes % 60}m` : ''}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Change their team or role on the <Link href="/admin/team" className="font-semibold text-bronze underline">Team</Link> page;
          move jobs or swap people on the <Link href={`/admin/schedule?week=${start}`} className="font-semibold text-bronze underline">Schedule</Link>.
        </p>
        <div className="flex items-center gap-2">
          <Link href={`/admin/team/${employee.id}?week=${shiftWeek(start, -1)}`} className="btn-secondary !px-4 !py-2 text-sm" aria-label="Previous week">
            ←
          </Link>
          <Link href={`/admin/team/${employee.id}`} className="text-sm text-muted hover:text-ink">
            This week
          </Link>
          <Link href={`/admin/team/${employee.id}?week=${shiftWeek(start, 1)}`} className="btn-secondary !px-4 !py-2 text-sm" aria-label="Next week">
            →
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {dates.map((date) => {
          const day = rows.filter((r) => r.b.slotStart.startsWith(date));
          return (
            <section key={date} className={`rounded-2xl border p-4 ${date === today ? 'border-gold bg-gold/5' : 'border-line bg-white'}`}>
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{formatDateLabel(date)}</h2>
              {day.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Off</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {day.map((r) => (
                    <li key={r.b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          {formatSlotLabel(r.b.slotStart, r.b.slotEnd)} · {r.client}
                        </p>
                        <p className="text-sm text-slate">
                          {r.service}
                          {r.address ? ` · ${r.address}` : ''}
                        </p>
                        {r.borrowed && <p className="text-xs font-semibold text-bronze">Helping {teamName(r.job.crewId)}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="pill bg-surface text-slate">{STATUS_LABEL[r.job.status]}</span>
                        <Link href={`/crew/jobs/${r.job.id}`} className="text-sm font-semibold text-bronze hover:underline">
                          Open
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
