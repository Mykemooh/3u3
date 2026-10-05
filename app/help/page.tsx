import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import HelpCenter from '@/components/help/HelpCenter';
import { getTenant } from '@/lib/data';
import { articlesFor, groupBySection } from '@/lib/help';
import { publicHelpAudience } from '@/lib/helpViewer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Help and FAQs' };

export default async function HelpPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const audience = await publicHelpAudience();
  const list = await articlesFor(tenant.id, audience, tenant.name);
  return (
    <div>
      <SiteHeader />
      <main className="px-4 py-10 sm:px-6 lg:py-14">
        <div className="mx-auto max-w-4xl">
          <p className="eyebrow">Help</p>
          <h1 className="display mt-3">Questions, answered.</h1>
          <p className="lead mt-4 max-w-xl">How booking, pricing, cleans and payments work with {tenant.name}. Can’t find it? Ask Tex in the bubble, or text us.</p>
          <div className="mt-10">
            <HelpCenter sections={groupBySection(list)} base="/help" askTex />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
