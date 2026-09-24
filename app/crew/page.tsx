import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { bookings, users, serviceTypes, jobs, jobChecklistItems, addresses, crews } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getCrewForUser, getTenant, SERVICE_LABELS } from '@/lib/data';
import { homeForRole } from '@/lib/nav';
import { businessTodayISO } from '@/lib/time';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import AppShell, { CREW_TABS } from '@/components/app/AppShell';

// Reads the signed-in cleaner's own jobs — live data, per-session.
export const dynamic = 'force-dynamic';

type Row = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows(crewIds: string[]) {
  if (crewIds.length === 0) return [];
  const myJobs = await db.select().from(jobs).where(inArray(jobs.crewId, crewIds));
  if (myJobs.length === 0) return [];
  const bookingRows = await db.select().from(bookings).where(inArray(bookings.id, myJobs.map((j) => j.bookingId)));
  const clientRows = bookingRows.length
    ? await db.select().from(users).where(inArray(users.id, bookingRows.map((b) => b.clientId)))
    : [];
  const addressIds = bookingRows.map((b) => b.addressId).filter(Boolean) as string[];
  const addressRows = addressIds.length ? await db.select().from(addresses).where(inArray(addresses.id, addressIds)) : [];
  const serviceRows = await db.select().from(serviceTypes);
  const itemRows = await db.select().from(jobChecklistItems).where(inArray(jobChecklistItems.jobId, myJobs.map((j) => j.id)));

  return myJobs
    .map((job) => {
      const booking = bookingRows.find((b) => b.id === job.bookingId);
      if (!booking || booking.status === 'CANCELLED') return null;
      const items = itemRows.filter((i) => i.jobId === job.id);
      const address = addressRows.find((a) => a.id === booking.addressId);
      return {
        job,
        booking,
        client: clientRows.find((c) => c.id === booking.clientId),
        service: serviceRows.find((s) => s.id === booking.serviceTypeId),
        address: address ? `${address.line1}, ${address.city}` : null,
        total: items.length,
        done: items.filter((i) => i.status !== 'PENDING').length,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.booking.slotStart.localeCompare(b.booking.slotStart));
}

export default async function CrewHome() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin?next=/crew');
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role;
  // Authoritative role check — the middleware guards the edge but can fail
  // open, so the page decides. Admins may look; customers may not.
  if (role !== 'CLEANER' && role !== 'ADMIN') redirect(`${homeForRole(role)}?denied=1`);

  let crewIds: string[] = [];
  if (role === 'CLEANER') {
    const crew = await getCrewForUser(userId);
    if (!crew) {
      return (
        <AppShell name={session.user.name} tabs={CREW_TABS} homeHref="/crew">
          <div className="card text-slate">You're not on a crew yet. Ask the office to add you, then sign in again.</div>
        </AppShell>
      );
    }
    crewIds = [crew.id];
  } else {
    // Admins see every crew's jobs here — this is their "jobs" view too.
    const tenant = await getTenant();
    crewIds = tenant ? (await db.select().from(crews).where(eq(crews.tenantId, tenant.id))).map((c) => c.id) : [];
  }

  const rows = await loadRows(crewIds);
  const today = businessTodayISO();
  const inProgress = rows.filter((r) => r.job.status === 'IN_PROGRESS');
  const todays = rows.filter((r) => r.booking.slotStart.startsWith(today) && r.job.status === 'PENDING');
  const upcoming = rows.filter((r) => r.booking.slotStart.slice(0, 10) > today && r.job.status === 'PENDING');
  const overdue = rows.filter((r) => r.booking.slotStart.slice(0, 10) < today && r.job.status === 'PENDING');
  const completed = rows.filter((r) => r.job.status === 'COMPLETE').reverse().slice(0, 10);
  const next = inProgress[0] ?? todays[0];

  return (
    <AppShell name={session.user.name} tabs={CREW_TABS} homeHref={role === 'ADMIN' ? '/admin' : '/crew'}>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">{formatDateLabel(today)}</p>
          <h1 className="mt-1 text-3xl font-extrabold">
            {inProgress.length ? 'Job in progress' : todays.length ? `${todays.length} job${todays.length === 1 ? '' : 's'} today` : 'No jobs today'}
          </h1>
        </div>

        {next && <NextJobCard row={next} />}

        <Section title="In progress" rows={inProgress.filter((r) => r !== next)} />
        <Section title="Today" rows={todays.filter((r) => r !== next)} />
        <Section title="Missed — still open" rows={overdue} tone="warn" />
        <Section title="Coming up" rows={upcoming} showDate />
        <Section title="Recently finished" rows={completed} showDate muted />
        {rows.length === 0 && <p className="card text-slate">No jobs assigned yet. New bookings will show up here.</p>}
      </div>
    </AppShell>
  );
}

function NextJobCard({ row }: { row: Row }) {
  const { job, booking, client, service, address, total, done } = row;
  const started = job.status === 'IN_PROGRESS';
  return (
    <Link href={`/crew/jobs/${job.id}`} className="block overflow-hidden rounded-2xl bg-ink text-white shadow-card-lg transition hover:-translate-y-0.5">
      <div className="p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-gold">{started ? 'Keep going' : 'Up next'}</p>
        <p className="mt-2 text-2xl font-bold text-white">{client?.name}</p>
        <p className="mt-1 text-white/70">
          {service ? SERVICE_LABELS[service.key] ?? service.name : 'Cleaning'} · {formatSlotLabel(booking.slotStart, booking.slotEnd)}
        </p>
        {address && <p className="text-white/70">{address}</p>}
        <div className="mt-5 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gold" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <span className="text-xs font-semibold text-white/70">
            {done}/{total} rooms
          </span>
        </div>
      </div>
      <div className="flow-line" aria-hidden="true" />
      <div className="bg-gold px-6 py-3 text-center font-semibold text-ink">{started ? 'Open job' : 'Open job and start'}</div>
    </Link>
  );
}

function Section({ title, rows, showDate, muted, tone }: { title: string; rows: Row[]; showDate?: boolean; muted?: boolean; tone?: 'warn' }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className={`mb-3 text-sm font-bold uppercase tracking-wide ${tone === 'warn' ? 'text-amber-700' : 'text-muted'}`}>{title}</h2>
      <div className="space-y-3">
        {rows.map(({ job, booking, client, service, total, done }) => (
          <Link key={job.id} href={`/crew/jobs/${job.id}`} className={`card-interactive flex items-center justify-between gap-4 p-5 ${muted ? 'opacity-70' : ''}`}>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{client?.name}</p>
              <p className="truncate text-sm text-slate">
                {showDate || tone === 'warn' ? `${formatDateLabel(booking.slotStart.slice(0, 10))} · ` : ''}
                {formatSlotLabel(booking.slotStart, booking.slotEnd)} · {service ? SERVICE_LABELS[service.key] ?? service.name : 'Cleaning'}
              </p>
            </div>
            <span
              className={`pill shrink-0 ${
                job.status === 'COMPLETE' ? 'bg-emerald-100 text-green' : job.status === 'IN_PROGRESS' ? 'bg-gold/20 text-bronze' : 'bg-surface text-slate'
              }`}
            >
              {job.status === 'COMPLETE' ? 'Done' : job.status === 'IN_PROGRESS' ? `${done}/${total}` : 'Not started'}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
