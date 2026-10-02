import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getTeams } from '@/lib/team';
import { geocodingConfigured } from '@/lib/geocoding';
import { businessTodayISO } from '@/lib/time';
import RouteOptimizer from '@/components/admin/RouteOptimizer';

export const dynamic = 'force-dynamic';

export default async function AdminRoutes() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { tenantId?: string } | undefined;
  if (!user?.tenantId) redirect('/admin');

  const teams = await getTeams(user.tenantId);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-3xl font-extrabold">Routes</h1>
        <p className="mt-2 text-slate">
          Pick a team and a day to see the drive-time-optimized visiting order for their booked jobs — real road
          distances, not a guess. This only suggests an order; nothing is changed until you move jobs on the{' '}
          <a href="/admin/schedule" className="font-semibold text-bronze hover:underline">
            Schedule
          </a>{' '}
          board yourself.
        </p>
      </div>

      {!geocodingConfigured() ? (
        <p className="card text-sm text-bronze">
          Route optimization needs a Mapbox token configured (<code>MAPBOX_ACCESS_TOKEN</code> or{' '}
          <code>MAPBOX_SERVER_TOKEN</code>) — same one the live tracking map already uses.
        </p>
      ) : (
        <RouteOptimizer teams={teams.map((t) => ({ id: t.id, name: t.name, hasHomeBase: !!(t.homeAddressLine1 && t.homeCity && t.homeState) }))} defaultDate={businessTodayISO()} />
      )}
    </div>
  );
}
