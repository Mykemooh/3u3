import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppShell, { CREW_TABS } from '@/components/app/AppShell';
import ArticleBody from '@/components/help/ArticleBody';
import { CrewPageHead } from '@/components/crew/CrewBand';
import { getTenant } from '@/lib/data';
import { articlesFor, fill } from '@/lib/help';
import { HELP_ARTICLES_ES } from '@/lib/help/content';
import { crewSession } from '@/lib/crewGate';
import { getLocale } from '@/lib/i18n/server';
import { translator } from '@/lib/i18n';
import { crewMessages } from '@/lib/i18n/messages/crew';

export const dynamic = 'force-dynamic';

export default async function CrewHelpArticle({ params }: { params: { slug: string } }) {
  const user = await crewSession(`/crew/help/${params.slug}`);
  const tenant = await getTenant();
  if (!tenant) return null;
  const locale = await getLocale();
  const t = translator(crewMessages, locale);
  const article = (await articlesFor(tenant.id, 'CREW', tenant.name)).find((a) => a.slug === params.slug);
  if (!article) notFound();
  // Product articles have a Spanish version (lib/help/content.ts); a company's own articles show as written.
  const es = locale === 'es' && article.source === 'PRODUCT' ? HELP_ARTICLES_ES[article.slug] : undefined;
  const title = es ? fill(es.title, tenant.name) : article.title;
  const body = es ? fill(es.body, tenant.name) : article.body;
  return (
    <AppShell name={user.name ?? ''} tabs={CREW_TABS} homeHref="/crew">
      <article>
        <CrewPageHead title={title}>
          <Link href="/crew/help" className="-ml-2 mb-2 inline-flex min-h-[44px] items-center rounded-lg px-2 text-[14px] font-semibold text-white/60 hover:text-white">
            {t('helpAll')}
          </Link>
        </CrewPageHead>
        <div className="mt-5 rounded-2xl border border-tc-200 bg-white p-5 sm:p-7">
          <ArticleBody body={body} />
        </div>
      </article>
    </AppShell>
  );
}
