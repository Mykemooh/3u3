import AppShell, { CREW_TABS } from '@/components/app/AppShell';
import HelpCenter from '@/components/help/HelpCenter';
import { getTenant } from '@/lib/data';
import { articlesFor, groupBySection } from '@/lib/help';
import { crewSession } from '@/lib/crewGate';

export const dynamic = 'force-dynamic';

export default async function CrewHelpPage() {
  const user = await crewSession('/crew/help');
  const tenant = await getTenant();
  if (!tenant) return null;
  const list = (await articlesFor(tenant.id, 'CREW', tenant.name)).filter((a) => a.audience.includes('CREW'));
  return (
    <AppShell name={user.name ?? ''} tabs={CREW_TABS} homeHref="/crew">
      <div className="space-y-6">
        <div>
          <p className="eyebrow">How-to</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">How we work</h1>
          <p className="mt-1 text-slate">Step-by-step for the job, the app and your pay. Ask Tex in the bubble if you can’t find it.</p>
        </div>
        <HelpCenter sections={groupBySection(list)} base="/crew/help" askTex />
      </div>
    </AppShell>
  );
}
