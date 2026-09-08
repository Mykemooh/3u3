import { db } from '@/db/client';
import { crewMembers, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTenant, getPrimaryCrew } from '@/lib/data';
import CrewSettingsForm from '@/components/CrewSettingsForm';

export default async function AdminCrewPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const crew = await getPrimaryCrew(tenant.id);
  if (!crew) return <p>No crew set up yet.</p>;

  const memberships = await db.select().from(crewMembers).where(eq(crewMembers.crewId, crew.id));
  const members = (
    await Promise.all(memberships.map((m) => db.select().from(users).where(eq(users.id, m.userId)).limit(1)))
  )
    .map((rows) => rows[0])
    .filter(Boolean);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Crew & Schedule</h1>
        <p className="text-ink/60">
          These settings drive every time slot customers see (PRD 6.4) — the app never shows a slot that isn't real.
        </p>
      </div>

      <div className="card max-w-xl">
        <h2 className="mb-4 font-semibold text-ink">{crew.name} — schedule engine settings</h2>
        <CrewSettingsForm
          crewId={crew.id}
          initial={{
            workStartMinutes: crew.workStartMinutes,
            workEndMinutes: crew.workEndMinutes,
            homesPerDay: crew.homesPerDay,
            commuteBufferMinutes: crew.commuteBufferMinutes,
          }}
        />
      </div>

      <div className="card max-w-xl">
        <h2 className="mb-4 font-semibold text-ink">Crew members</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m!.id} className="flex items-center justify-between border-b border-ink/5 py-2 text-sm last:border-0">
              <span className="font-medium">{m!.name}</span>
              <span className="text-ink/50">{m!.email}</span>
            </li>
          ))}
          {members.length === 0 && <p className="text-sm text-ink/50">No cleaners assigned yet.</p>}
        </ul>
      </div>
    </div>
  );
}
