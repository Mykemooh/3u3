import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppShell, { CREW_TABS } from '@/components/app/AppShell';
import ArticleBody from '@/components/help/ArticleBody';
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
      <article className="space-y-4">
        <Link href="/crew/help" className="text-sm font-semibold text-gold hover:underline">{t('helpAll')}</Link>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <div className="card"><ArticleBody body={body} /></div>
      </article>
    </AppShell>
  );
}
