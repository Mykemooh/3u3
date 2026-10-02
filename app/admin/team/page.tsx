import { getTenant } from '@/lib/data';
import { getEmployees, getTeams } from '@/lib/team';
import TeamBoard from '@/components/team/TeamBoard';

export const dynamic = 'force-dynamic';

// Teams and the people on them. Who's on which *job* is decided on the
// Schedule board; this page is who's on which team, their role, and each
// team's hours — which drive the times customers can book.
export default async function AdminTeamPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const [teams, employees] = await Promise.all([getTeams(tenant.id), getEmployees(tenant.id)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Team</h1>
        <p className="text-slate">
          A Team Lead starts each trip and finishes each job. Customers can book any time a team that takes online
          bookings is free.
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
        }))}
        employees={employees}
      />
    </div>
  );
}
