import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppShell, { CREW_TABS } from '@/components/app/AppShell';
import ArticleBody from '@/components/help/ArticleBody';
import { getTenant } from '@/lib/data';
import { articlesFor } from '@/lib/help';
import { crewSession } from '@/lib/crewGate';

export const dynamic = 'force-dynamic';

export default async function CrewHelpArticle({ params }: { params: { slug: string } }) {
  const user = await crewSession(`/crew/help/${params.slug}`);
  const tenant = await getTenant();
  if (!tenant) return null;
  const article = (await articlesFor(tenant.id, 'CREW', tenant.name)).find((a) => a.slug === params.slug);
  if (!article) notFound();
  return (
    <AppShell name={user.name ?? ''} tabs={CREW_TABS} homeHref="/crew">
      <article className="space-y-4">
        <Link href="/crew/help" className="text-sm font-semibold text-gold hover:underline">← All how-tos</Link>
        <h1 className="text-2xl font-bold text-ink">{article.title}</h1>
        <div className="card"><ArticleBody body={article.body} /></div>
      </article>
    </AppShell>
  );
}
