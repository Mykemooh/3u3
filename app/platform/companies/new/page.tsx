import Link from 'next/link';
import NewCompanyForm from '@/components/platform/NewCompanyForm';

export default function NewCompanyPage() {
  return (
    <div className="space-y-6">
      <Link href="/platform/companies" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> Companies
      </Link>
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">New company</h1>
        <p className="text-slate">Provisions a complete, working starting stack — the same one 3U3 itself has.</p>
      </div>
      <NewCompanyForm />
    </div>
  );
}
