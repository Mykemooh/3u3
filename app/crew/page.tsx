import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { bookings, users, serviceTypes, jobs, jobChecklistItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCrewForUser, SERVICE_LABELS } from '@/lib/data';
import SignOutButton from '@/components/SignOutButton';
import Logo from '@/components/Logo';

export default async function CrewHome() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin?role=crew');
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role;

  const crew = role === 'CLEANER' ? await getCrewForUser(userId) : null;
  if (role === 'CLEANER' && !crew) {
    return <p className="p-8">You're not assigned to a crew yet — ask your admin to add you.</p>;
  }

  // Cleaners see only their own assigned crew's jobs (PRD section 8 access control).
  const myJobs = crew ? await db.select().from(jobs).where(eq(jobs.crewId, crew.id)) : [];

  const enriched = (
    await Promise.all(
      myJobs.map(async (job) => {
        const bookingRows = await db.select().from(bookings).where(eq(bookings.id, job.bookingId)).limit(1);
        const booking = bookingRows[0];
        const client = booking
          ? (await db.select().from(users).where(eq(users.id, booking.clientId)).limit(1))[0]
          : null;
        const service = booking?.serviceTypeId
          ? (await db.select().from(serviceTypes).where(eq(serviceTypes.id, booking.serviceTypeId)).limit(1))[0]
          : null;
        const items = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, job.id));
        const done = items.filter((i) => i.status !== 'PENDING').length;
        return { job, booking, client, service, total: items.length, done };
      }),
    )
  )
    .filter((e) => e.booking)
    .sort((a, b) => a.booking!.slotStart.localeCompare(b.booking!.slotStart));

  const todayISO = new Date().toISOString().split('T')[0];
  const today = enriched.filter((e) => e.booking!.slotStart.startsWith(todayISO));
  const upcoming = enriched.filter((e) => !e.booking!.slotStart.startsWith(todayISO) && e.job.status !== 'COMPLETE');
  const completed = enriched.filter((e) => e.job.status === 'COMPLETE');

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between bg-ink px-6 py-4 text-white">
        <Logo size="sm" />
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white/60">{session.user.name}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-8 px-6 py-8">
        <Section title="Today" items={today} />
        <Section title="Upcoming" items={upcoming} />
        <Section title="Completed" items={completed} muted />
      </main>
    </div>
  );
}

function Section({ title, items, muted }: { title: string; items: any[]; muted?: boolean }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50">{title}</h2>
      {items.length === 0 && <p className="text-sm text-ink/40">Nothing here.</p>}
      <div className="space-y-3">
        {items.map(({ job, booking, client, service, total, done }) => (
          <Link
            key={job.id}
            href={`/crew/jobs/${job.id}`}
            className={`card block transition hover:border-gold ${muted ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-ink">{client?.name}</p>
                <p className="text-sm text-ink/60">
                  {service ? SERVICE_LABELS[service.key] : 'Service'} · {booking!.slotStart.replace('T', ' ')}
                </p>
              </div>
              <span className={`pill ${job.status === 'COMPLETE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gold/15 text-bronze'}`}>
                {job.status === 'COMPLETE' ? 'Done' : `${done}/${total} rooms`}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
