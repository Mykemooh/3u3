import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getCrewForUser } from '@/lib/data';
import { getSupplyReportsForCrew, SUPPLY_STATUS_LABELS } from '@/lib/supplies';
import { homeForRole } from '@/lib/nav';
import AppShell, { CREW_TABS } from '@/components/app/AppShell';
import SupplyReportForm from '@/components/crew/SupplyReportForm';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  LOW: 'bg-amber-100 text-amber-700',
  OUT: 'bg-red-100 text-red-700',
  DAMAGED: 'bg-red-100 text-red-700',
};

export default async function CrewSuppliesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin?next=/crew/supplies');
  const role = (session.user as any).role;
  if (role !== 'CLEANER') redirect(`${homeForRole(role)}?denied=1`);

  const crew = await getCrewForUser((session.user as any).id);
  const recent = crew ? await getSupplyReportsForCrew(crew.id) : [];

  return (
    <AppShell name={session.user.name} tabs={CREW_TABS} homeHref="/crew">
      <div className="space-y-6">
        <div>
          <p className="eyebrow">Supplies</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">Report a supply issue</h1>
          <p className="mt-1 text-slate">Running low, out, or something broke — just type what it is and we'll handle it.</p>
        </div>

        {!crew ? (
          <div className="card text-slate">You're not on a team yet. Ask the office to add you, then sign in again.</div>
        ) : (
          <div className="card">
            <SupplyReportForm />
          </div>
        )}

        {recent.length > 0 && (
          <div className="card">
            <h2 className="mb-3 font-semibold text-ink">Your team's recent reports</h2>
            <div className="space-y-2">
              {recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
                  <div>
                    <p className="font-medium text-ink">{r.productName}</p>
                    {r.notes && <p className="text-xs text-muted">{r.notes}</p>}
                  </div>
                  <span className={`pill ${r.resolved ? 'bg-emerald-100 text-green' : STATUS_STYLE[r.status]}`}>
                    {r.resolved ? 'Resolved' : SUPPLY_STATUS_LABELS[r.status as 'LOW' | 'OUT' | 'DAMAGED']}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
