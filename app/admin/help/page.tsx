import { getTenant } from '@/lib/data';
import { articlesFor, groupBySection, listCompanyArticles } from '@/lib/help';
import { adminSession } from '@/lib/adminApi';
import { texConfigured } from '@/lib/tex';
import HelpCenter from '@/components/help/HelpCenter';
import KbManager from '@/components/admin/KbManager';

export const dynamic = 'force-dynamic';

export default async function AdminHelpPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const admin = await adminSession();
  const [list, own] = await Promise.all([articlesFor(tenant.id, 'ADMIN', tenant.name), listCompanyArticles(tenant.id)]);
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Help &amp; SOPs</h2>
          <p className="max-w-2xl text-slate">
            Every FAQ your clients see and every how-to your crew and office follow, in one place. Tex answers clients, crews and you
            from these — your own articles first.
          </p>
        </div>
        <HelpCenter sections={groupBySection(list)} base="/admin/help" />
      </section>
      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-bold">Your company’s articles</h3>
          <p className="max-w-2xl text-sm text-slate">
            Your own policies and answers — cancellation rules, areas you serve, what you bring. {texConfigured() ? 'Tex writes its answers from these with AI.' : 'Tex quotes the best-matching article until an Anthropic API key is added, then writes answers from them with AI.'}
          </p>
        </div>
        <KbManager
          articles={own.map((a) => ({ id: a.id, title: a.title, body: a.body, audience: a.audience, kind: a.kind, tags: a.tags, published: a.published }))}
          canEdit={!!admin?.permissions.has('help.manage')}
        />
      </section>
    </div>
  );
}
