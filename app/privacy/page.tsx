import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { PRIVACY, LEGAL_UPDATED } from '@/lib/legal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Privacy — TrashCan' };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={LEGAL_UPDATED}
      intro="What TrashCan collects about the cleaning companies that use it, their teams and their clients — and what happens to it."
      sections={PRIVACY}
    />
  );
}
