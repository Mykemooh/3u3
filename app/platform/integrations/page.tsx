import { envReport } from '@/lib/integrationsHub';

export const dynamic = 'force-dynamic';

/**
 * Which environment variables this deployment has — names only. Values
 * are never read out here or anywhere else; set and change them in
 * Vercel → Settings → Environment Variables, then redeploy.
 */
export default function PlatformKeysPage() {
  const report = envReport();
  const required = report.flatMap((r) => r.vars.filter((v) => !v.optional));
  const setCount = required.filter((v) => v.set).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Keys</h1>
        <p className="max-w-2xl text-slate">
          Environment variables this deployment reads, and whether each is set. Values are never shown. Change them in
          Vercel → Settings → Environment Variables and redeploy.
        </p>
        <p className="mt-2 text-sm text-slate">
          {setCount} of {required.length} required variables set.
        </p>
      </div>
      <div className="divide-y divide-line rounded-2xl border border-line bg-white">
        {report.map((r) => (
          <div key={r.key} className="px-5 py-4">
            <p className="font-semibold text-ink">{r.name}</p>
            {r.vars.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No key needed.</p>
            ) : (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {r.vars.map((v) => (
                  <li key={v.name} className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${v.set ? 'bg-green' : v.optional ? 'bg-line' : 'bg-amber-500'}`} aria-hidden />
                    <code className="text-ink">{v.name}</code>
                    <span className="text-muted">{v.set ? 'set' : v.optional ? 'not set (optional)' : 'missing'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
