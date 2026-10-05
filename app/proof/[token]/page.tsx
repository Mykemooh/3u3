import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { proofByToken } from '@/lib/proof';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Visit report', robots: { index: false, follow: false } };

const clock = (d: Date | null) =>
  d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: process.env.BUSINESS_TIMEZONE || 'America/Chicago' }) : '—';
const dur = (m: number | null) => (m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

export default async function ProofPage({ params }: { params: { token: string } }) {
  const p = await proofByToken(params.token);
  if (!p) notFound();
  const done = p.rooms.filter((r) => r.status === 'COMPLETE').length;
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-8">
        <p className="eyebrow">{p.company.name} · Visit report</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-ink">
          {p.service} for {p.clientFirstName}
        </h1>
        <p className="mt-1 text-slate">
          {new Date(`${p.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          {p.city ? ` · ${p.city}` : ''}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ['Arrived', clock(p.arrivedAt)],
          ['Finished', clock(p.finishedAt)],
          ['Time on site', dur(p.totalMinutes)],
          ['Rooms done', `${done} of ${p.rooms.length}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-white p-4">
            <p className="text-xs font-semibold text-muted">{k}</p>
            <p className="mt-1 font-display text-xl font-bold text-ink">{v}</p>
          </div>
        ))}
      </section>
      {p.team.length > 0 && <p className="mt-4 text-sm text-slate">Cleaned by {p.team.join(', ')}.</p>}
      {p.rating != null && (
        <p className="mt-1 text-sm text-slate">
          Client rating: <span className="text-gold">{'★'.repeat(p.rating)}</span>
          <span className="text-line">{'★'.repeat(5 - p.rating)}</span>
        </p>
      )}

      <section className="mt-8 space-y-4">
        {p.rooms.map((r) => (
          <article key={r.id} className="rounded-2xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-ink">{r.name}</h2>
                {r.task && <p className="text-xs text-muted">{r.task}</p>}
              </div>
              <div className="flex items-center gap-2 text-xs">
                {r.minutes != null && <span className="text-muted">{dur(r.minutes)}</span>}
                {r.rating != null && <span className="pill bg-surface text-slate">{r.rating}/5</span>}
                <span className={`pill ${r.status === 'COMPLETE' ? 'bg-green-light text-green' : 'bg-amber-50 text-amber-800'}`}>
                  {r.status === 'COMPLETE' ? 'Done' : r.status === 'SKIPPED' ? 'Skipped' : 'Not done'}
                </span>
              </div>
            </div>
            {r.status === 'SKIPPED' && r.skipReason && <p className="mt-2 text-sm text-amber-900">Skipped: {r.skipReason}</p>}
            {(r.before.length > 0 || r.after.length > 0) && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {(['before', 'after'] as const).map((phase) => (
                  <div key={phase}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{phase}</p>
                    <div className="grid gap-2">
                      {r[phase].slice(0, 2).map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={url} src={url} alt={`${r.name} ${phase}`} className="aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>
      <p className="mt-10 text-center text-xs text-muted">Photos are time-stamped on the crew's phone when taken.</p>
    </main>
  );
}
