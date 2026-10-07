import AppShell, { CREW_TABS } from '@/components/app/AppShell';
import HelpCenter from '@/components/help/HelpCenter';
import { getTenant } from '@/lib/data';
import { articlesFor, fill, groupBySection } from '@/lib/help';
import { HELP_ARTICLES_ES, SECTIONS_ES } from '@/lib/help/content';
import { crewSession } from '@/lib/crewGate';
import { getLocale } from '@/lib/i18n/server';
import { translator } from '@/lib/i18n';
import { crewMessages } from '@/lib/i18n/messages/crew';

export const dynamic = 'force-dynamic';

export default async function CrewHelpPage() {
  const user = await crewSession('/crew/help');
  const tenant = await getTenant();
  if (!tenant) return null;
  const locale = await getLocale();
  const t = translator(crewMessages, locale);
  const list = (await articlesFor(tenant.id, 'CREW', tenant.name)).filter((a) => a.audience.includes('CREW'));
  // Grouped and ordered by the English section names, then shown in the reader's language.
  let sections = groupBySection(list);
  if (locale === 'es') {
    sections = sections.map(([title, items]) => [
      title === `From ${tenant.name}` ? t('helpFromCompany', { company: tenant.name }) : SECTIONS_ES[title] ?? title,
      items.map((a) => {
        const es = a.source === 'PRODUCT' ? HELP_ARTICLES_ES[a.slug] : undefined;
        return es ? { ...a, title: fill(es.title, tenant.name), body: fill(es.body, tenant.name) } : a;
      }),
    ]);
  }
  return (
    <AppShell name={user.name ?? ''} tabs={CREW_TABS} homeHref="/crew">
      <div className="space-y-6">
        <div>
          <p className="eyebrow">{t('helpEyebrow')}</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">{t('helpTitle')}</h1>
          <p className="mt-1 text-slate">{t('helpIntro')}</p>
        </div>
        <HelpCenter sections={sections} base="/crew/help" askTex />
      </div>
    </AppShell>
  );
}
