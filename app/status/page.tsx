import type { Metadata } from 'next';
import PlatformShell from '@/components/PlatformShell';
import { checkHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'System status · TRASHCAN' };

const ago = (iso: string | null) => {
  if (!iso) return 'not yet';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

const BANNER = {
  operational: ['bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', 'Everything is working'],
  degraded: ['bg-amber-50 text-amber-800 ring-1 ring-amber-200', 'Working, with a delay in background jobs'],
  down: ['bg-red-50 text-red-700 ring-1 ring-red-200', 'TRASHCAN is having trouble right now'],
} as const;

export default async function StatusPage() {
  const h = await checkHealth();
  const [cls, label] = BANNER[h.status];
  const dot = (state: string) => (state === 'ok' ? 'bg-tc-green' : state === 'never' ? 'bg-tc-300' : state === 'late' ? 'bg-amber-500' : 'bg-red-500');
  return (
    <PlatformShell>
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-14 sm:px-6 md:pt-20">
        <h1 className="tc-h1">System status</h1>
        <div className={`mt-6 rounded-tc-lg px-5 py-4 text-lg font-semibold ${cls}`} role="status">{label}</div>
        <div className="mt-6 divide-y divide-tc-200 rounded-tc-lg border border-tc-200 bg-white">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${h.database.ok ? 'bg-tc-green' : 'bg-red-500'}`} />App and database</span>
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
