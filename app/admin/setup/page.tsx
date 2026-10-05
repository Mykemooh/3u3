import Link from 'next/link';
import { getTenant } from '@/lib/data';
import { setupSteps } from '@/lib/setupGuide';
import SetupStepActions from '@/components/admin/SetupStepActions';

export default async function SetupGuidePage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const steps = await setupSteps(tenant.id);
  const finished = steps.filter((s) => s.done || s.skipped).length;
  const next = steps.find((s) => !s.done && !s.skipped);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">Setup guide</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-ink">Get {tenant.name} running</h2>
        <p className="mt-1 text-slate">
          {finished} of {steps.length} done. Each step ticks itself off when the work is done — skip anything you don't need.
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full" style={{ width: `${(finished / steps.length) * 100}%`, backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
        </div>
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => {
          const complete = s.done || s.skipped;
          return (
            <li key={s.key} className={`rounded-2xl border bg-white p-5 ${s === next ? 'border-gold shadow-card' : 'border-line'}`}>
              <div className="flex items-start gap-4">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    s.done ? 'bg-green text-white' : s.skipped ? 'bg-surface text-muted' : 'bg-surface text-ink'
                  }`}
                >
                  {s.done ? '✓' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className={`font-semibold ${complete ? 'text-muted line-through decoration-line' : 'text-ink'}`}>{s.title}</h3>
                  <p className="mt-0.5 text-sm text-slate">{s.why}</p>
                  {!s.done && (
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      {!s.skipped && (
                        <Link href={s.href} className="btn-primary btn-sm">{s.cta}</Link>
                      )}
                      <SetupStepActions stepKey={s.key} skipped={s.skipped} extraKey={s.key === 'services' ? 'services-reviewed' : undefined} />
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
