import { enforceMfa, type SessionUser } from '@/lib/sessionUser';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getCrewForUser } from '@/lib/data';
import { getSupplyReportsForCrew } from '@/lib/supplies';
import { homeForRole } from '@/lib/nav';
import AppShell, { CREW_TABS } from '@/components/app/AppShell';
import SupplyReportForm from '@/components/crew/SupplyReportForm';
import { CrewPageHead } from '@/components/crew/CrewBand';
import { getT } from '@/lib/i18n/server';
import { crewMessages } from '@/lib/i18n/messages/crew';

export const dynamic = 'force-dynamic';

const STATUS_LABEL_KEY = { LOW: 'supplyLow', OUT: 'supplyOut', DAMAGED: 'supplyDamaged' } as const;

const STATUS_STYLE: Record<string, string> = {
  LOW: 'bg-amber-50 text-amber-800',
  OUT: 'bg-red-50 text-red-700',
  DAMAGED: 'bg-red-50 text-red-700',
};

export default async function CrewSuppliesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin?next=/crew/supplies');
  const role = (session.user as any).role;
  if (role !== 'CLEANER') redirect(`${homeForRole(role)}?denied=1`);
  enforceMfa(session.user as unknown as SessionUser, '/crew/supplies');
  const t = await getT(crewMessages);

  const crew = await getCrewForUser((session.user as any).id);
  const recent = crew ? await getSupplyReportsForCrew(crew.id) : [];

  return (
    <AppShell name={session.user.name} tabs={CREW_TABS} homeHref="/crew">
      <CrewPageHead title={t('suppliesTitle')} intro={t('suppliesIntro')} />
      <div className="mt-5 space-y-5">
        {!crew ? (
          <div className="rounded-2xl border border-tc-200 bg-white p-5 text-tc-700">{t('noTeam')}</div>
        ) : (
          <div className="rounded-2xl border border-tc-200 bg-white p-4 sm:p-6">
            <SupplyReportForm />
          </div>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="mb-2.5 px-1 font-tc-display text-[17px] font-bold tracking-[-0.01em] text-tc-900">{t('suppliesRecent')}</h2>
            <ul className="divide-y divide-tc-200 overflow-hidden rounded-2xl border border-tc-200 bg-white">
              {recent.map((r) => (
                <li key={r.id} className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-tc-900">{r.productName}</p>
                    {r.notes && <p className="text-[13px] text-tc-500">{r.notes}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${r.resolved ? 'bg-emerald-50 text-emerald-700' : STATUS_STYLE[r.status]}`}>
                    {r.resolved ? t('suppliesResolved') : t(STATUS_LABEL_KEY[r.status as 'LOW' | 'OUT' | 'DAMAGED'])}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
