import { getTenant } from '@/lib/data';
import { getEmployees, getTeams } from '@/lib/team';
import TeamBoard from '@/components/team/TeamBoard';
import Link from 'next/link';
import { defaultRoleName } from '@/lib/roles';

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
    </div>
  );
}
