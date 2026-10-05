import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenant } from '@/lib/data';
import { articlesFor } from '@/lib/help';
import ArticleBody from '@/components/help/ArticleBody';

export const dynamic = 'force-dynamic';

const WHO: Record<string, string> = { PUBLIC: 'Anyone', CLIENT: 'Clients', CREW: 'Crew', ADMIN: 'Office' };

export default async function AdminHelpArticle({ params }: { params: { slug: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const article = (await articlesFor(tenant.id, 'ADMIN', tenant.name)).find((a) => a.slug === params.slug);
  if (!article) notFound();
  return (
    <article className="max-w-2xl space-y-4">
      <Link href="/admin/help" className="text-sm font-semibold text-gold hover:underline">← Help &amp; SOPs</Link>
      <div>
        <p className="text-sm text-muted">{article.section} · Seen by {article.audience.map((a) => WHO[a]).join(', ')}</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">{article.title}</h1>
      </div>
      <div className="card"><ArticleBody body={article.body} /></div>
    </article>
  );
}
