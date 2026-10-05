import type { Metadata } from 'next';
import PlatformShell from '@/components/PlatformShell';
import { checkHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Status — TrashCan' };

const ago = (iso: string | null) => {
  if (!iso) return 'not yet';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

const BANNER = {
  operational: ['bg-green/10 text-green', 'Everything is working'],
  degraded: ['bg-amber-50 text-amber-800', 'Working, with a delay in background jobs'],
  down: ['bg-red-50 text-red-700', 'TrashCan is having trouble right now'],
} as const;

export default async function StatusPage() {
  const h = await checkHealth();
  const [cls, label] = BANNER[h.status];
  const dot = (state: string) => (state === 'ok' ? 'bg-green' : state === 'never' ? 'bg-line' : state === 'late' ? 'bg-amber-500' : 'bg-red-500');
  return (
    <PlatformShell>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-extrabold text-ink">Status</h1>
        <div className={`mt-6 rounded-2xl px-5 py-4 text-lg font-semibold ${cls}`} role="status">{label}</div>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${h.database.ok ? 'bg-green' : 'bg-red-500'}`} />App and database</span>
            <span className="text-sm text-slate">{h.database.ok ? `Responding (${h.database.ms} ms)` : 'Not responding'}</span>
          </div>
          {h.jobs.map((j) => (
            <div key={j.key} className="flex items-center justify-between px-5 py-4">
              <span className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${dot(j.state)}`} />{j.label}</span>
              <span className="text-sm text-slate">{j.state === 'failed' ? `Last run failed ${ago(j.lastRun)}` : `Last ran ${ago(j.lastRun)}`}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">Checked {new Date(h.checkedAt).toUTCString()}. Background jobs run once a day.</p>
      </div>
    </PlatformShell>
  );
}
