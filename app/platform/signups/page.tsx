import Link from 'next/link';
import { listSignups, signupIsOpen } from '@/lib/signup';
import SignupToggle from '@/components/platform/SignupToggle';
import { appUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

export default async function PlatformSignupsPage() {
  const [rows, open] = await Promise.all([listSignups(), signupIsOpen()]);
  const companies = rows.filter((r) => r.kind === 'SIGNUP' && r.completedAt);
  const waitlist = rows.filter((r) => r.kind === 'WAITLIST');
  const pending = rows.filter((r) => r.kind === 'SIGNUP' && !r.completedAt);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Signups</h1>
        <p className="text-slate">
          The public signup page is <a className="font-semibold text-gold hover:underline" href={appUrl('/start')}>{appUrl('/start')}</a>.
        </p>
      </div>
      <SignupToggle open={open} />
      <section>
        <h2 className="mb-2 font-semibold">New companies ({companies.length})</h2>
        <div className="divide-y divide-line rounded-2xl border border-line bg-white">
          {companies.length === 0 && <p className="p-4 text-sm text-muted">None yet.</p>}
          {companies.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span><strong>{r.companyName}</strong> · {r.name} · {r.email}</span>
              <span className="flex items-center gap-3 text-muted">
                {r.completedAt?.toLocaleDateString()}
                {r.tenantId && <Link href={`/platform/companies/${r.tenantId}`} className="font-semibold text-gold hover:underline">Open</Link>}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Waitlist ({waitlist.length})</h2>
        <div className="divide-y divide-line rounded-2xl border border-line bg-white">
          {waitlist.length === 0 && <p className="p-4 text-sm text-muted">Nobody yet.</p>}
          {waitlist.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span><strong>{r.companyName}</strong> · {r.name} · {r.email}{r.phone ? ` · ${r.phone}` : ''}</span>
              <span className="text-muted">{r.createdAt.toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </section>
      {pending.length > 0 && <p className="text-sm text-muted">{pending.length} signup{pending.length === 1 ? '' : 's'} started but not finished (code sent, company not created).</p>}
    </div>
  );
}
