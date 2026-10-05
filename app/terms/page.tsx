import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { TERMS, LEGAL_UPDATED } from '@/lib/legal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Terms — TrashCan' };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={LEGAL_UPDATED}
      intro="The agreement for using TrashCan, in plain language. If anything here conflicts with a signed agreement between your company and TrashCan, the signed agreement wins."
      sections={TERMS}
    />
  );
}
