import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import ArticleBody from '@/components/help/ArticleBody';
import { getTenant } from '@/lib/data';
import { articlesFor } from '@/lib/help';
import { publicHelpAudience } from '@/lib/helpViewer';
import { HELP_ARTICLES } from '@/lib/help/content';

export const dynamic = 'force-dynamic';

export default async function HelpArticlePage({ params }: { params: { slug: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const audience = await publicHelpAudience();
  const list = await articlesFor(tenant.id, audience, tenant.name);
  const article = list.find((a) => a.slug === params.slug);
  if (!article) {
    // A client-only article for someone not signed in: ask them to sign in rather than 404.
    const clientOnly = HELP_ARTICLES.find((a) => a.slug === params.slug && a.audience.includes('CLIENT'));
    if (!clientOnly || audience !== 'PUBLIC') notFound();
  }
  const related = article ? list.filter((a) => a.slug !== article.slug && a.section === article.section).slice(0, 4) : [];
  return (
    <div>
      <SiteHeader />
      <main className="px-4 py-10 sm:px-6 lg:py-14">
        <article className="mx-auto max-w-2xl">
          <Link href="/help" className="text-sm font-semibold text-gold hover:underline">← All help</Link>
          {article ? (
            <>
              <p className="eyebrow mt-6">{article.section}</p>
              <h1 className="mt-2 text-3xl font-extrabold text-ink">{article.title}</h1>
              <div className="mt-6">
                <ArticleBody body={article.body} />
              </div>
              {related.length > 0 && (
                <div className="mt-12 border-t border-line pt-6">
                  <p className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Related</p>
                  <ul className="space-y-2">
                    {related.map((r) => (
                      <li key={r.slug}><Link className="font-semibold text-gold hover:underline" href={`/help/${r.slug}`}>{r.title}</Link></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="card mt-6 text-center">
              <h1 className="text-xl font-bold">Sign in to read this</h1>
              <p className="mt-2 text-slate">This answer is about your own cleans, so it’s in your account.</p>
              <Link href={`/signin?next=/help/${params.slug}`} className="btn-primary mt-5">Sign in</Link>
            </div>
          )}
        </article>
      </main>
      <Footer />
    </div>
  );
}
