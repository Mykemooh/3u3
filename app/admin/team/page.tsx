import { getTenant } from '@/lib/data';
import { getEmployees, getTeams } from '@/lib/team';
import TeamBoard from '@/components/team/TeamBoard';
import Link from 'next/link';
import { defaultRoleName } from '@/lib/roles';
import BackgroundChecks from '@/components/admin/BackgroundChecks';
import { checkrConfigured, checkrPackage, listBackgroundChecks } from '@/lib/checkr';

export const dynamic = 'force-dynamic';

// Teams and the people on them. Who's on which *job* is decided on the
// Schedule board; this page is who's on which team, their role, and each
// team's hours — which drive the times customers can book.
export default async function AdminTeamPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const [teams, employees, lead, cleaner, jr] = await Promise.all([
    getTeams(tenant.id),
    getEmployees(tenant.id),
    defaultRoleName(tenant.id, 'TEAM_LEAD'),
    defaultRoleName(tenant.id, 'CLEANER'),
    defaultRoleName(tenant.id, 'JR_CLEANER'),
  ]);
  const checks = checkrConfigured() ? await listBackgroundChecks(tenant.id) : [];
  const base = teams.find((t) => t.homeState) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Team</h1>
        <p className="text-slate">
          Anyone on a job can start the clock when they arrive; a {lead} finishes the job. Customers can book any time
          a team that takes online bookings is free. Rename roles or add your own under{' '}
          <Link href="/admin/roles" className="font-semibold text-bronze hover:underline">Roles</Link>.
        </p>
      </div>
      <TeamBoard
        teams={teams.map((t) => ({
          id: t.id,
          name: t.name,
          acceptsBookings: t.acceptsBookings,
          workStartMinutes: t.workStartMinutes,
          workEndMinutes: t.workEndMinutes,
          homesPerDay: t.homesPerDay,
          commuteBufferMinutes: t.commuteBufferMinutes,
          homeAddressLine1: t.homeAddressLine1,
          homeCity: t.homeCity,
          homeState: t.homeState,
          homeZip: t.homeZip,
        }))}
        employees={employees}
        roleLabels={{ TEAM_LEAD: lead, CLEANER: cleaner, JR_CLEANER: jr }}
      />

      <section className="card space-y-3" aria-labelledby="checks">
        <div>
          <h2 id="checks" className="font-semibold text-ink">Background checks</h2>
          <p className="text-sm text-slate">Through Checkr. The person gets Checkr’s own form, disclosure and consent by email.</p>
        </div>
        {checkrConfigured() ? (
          <BackgroundChecks
            people={employees.map((e) => ({ id: e.id, name: e.name, email: e.email }))}
            checks={checks.map((c) => ({ id: c.id, userId: c.userId, status: c.status, result: c.result, createdAt: c.createdAt.toISOString(), completedAt: c.completedAt?.toISOString() ?? null }))}
            defaultState={base?.homeState?.slice(0, 2).toUpperCase() ?? ''}
            defaultCity={base?.homeCity ?? ''}
            packageName={checkrPackage()}
          />
        ) : (
          <p className="text-sm text-muted">
            Not set up yet. See <Link href="/admin/integrations#checkr" className="font-semibold text-bronze hover:underline">Integrations → Checkr</Link>.
          </p>
        )}
      </section>
    </div>
  );
}
