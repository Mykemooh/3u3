import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { quickbooksConnection } from '@/lib/quickbooks';
import { integrationOverview, STATUS_LABEL, type IntegrationStatus } from '@/lib/integrationsHub';
import { appUrl } from '@/lib/url';
import DisconnectQuickbooksButton from '@/components/admin/DisconnectQuickbooksButton';
import CalendarConnectCard from '@/components/CalendarConnectCard';
import ProviderConnect from '@/components/admin/ProviderConnect';
import { calendarConnection } from '@/lib/googleCalendar';

export const dynamic = 'force-dynamic';

const PILL: Record<IntegrationStatus, string> = {
  connected: 'bg-green-light text-[#0E6B62]',
  built_in: 'bg-green-light text-[#0E6B62]',
  needs_connect: 'bg-gold/10 text-bronze',
  not_used: 'bg-surface text-slate',
  missing_keys: 'bg-amber-50 text-amber-800',
};

const GROUP_ORDER = [
  'Payments and accounting',
  'Leads and automation',
  'Maps and schedule',
  'Team',
  'Messages',
  'Sign-in and AI',
  'Reliability',
] as const;

type Search = { qb_connected?: string; qb_error?: string; connected?: string; error?: string };

export default async function AdminIntegrations({ searchParams }: { searchParams: Search }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { tenantId?: string; id?: string } | undefined;
  if (!user?.tenantId) redirect('/admin');

  const [items, qb, cal] = await Promise.all([
    integrationOverview(user.tenantId, user.id ?? null),
    quickbooksConnection(user.tenantId),
    user.id ? calendarConnection(user.id) : null,
  ]);
  const site = appUrl('').replace(/\/$/, '');
  const fill = (text: string) => text.split("<site>").join(site);
  const working = items.filter((i) => i.status === 'connected' || i.status === 'built_in').length;
  const missing = items.filter((i) => i.status === 'missing_keys').length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Integrations</h1>
        <p className="max-w-2xl text-slate">
          What this company is connected to. Keys live in Vercel → Settings → Environment Variables (never in this
          app or in a message); per-company accounts connect with their own sign-in button.
        </p>
        <p className="mt-3 text-sm text-slate">
          <span className="font-semibold text-ink">{working}</span> working ·{' '}
          <span className="font-semibold text-ink">{missing}</span> missing keys ·{' '}
          <span className="font-semibold text-ink">{items.length - working - missing}</span> waiting on a step here
        </p>
      </div>

      {searchParams.qb_connected && <p className="rounded-xl bg-green-light px-4 py-3 text-sm font-semibold text-[#0E6B62]">QuickBooks connected.</p>}
      {searchParams.connected && <p className="rounded-xl bg-green-light px-4 py-3 text-sm font-semibold text-[#0E6B62]">{searchParams.connected} connected.</p>}
      {(searchParams.qb_error || searchParams.error) && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{searchParams.qb_error || searchParams.error}</p>
      )}

      {GROUP_ORDER.map((group) => {
        const list = items.filter((i) => i.group === group);
        if (!list.length) return null;
        return (
          <section key={group} aria-labelledby={`g-${group}`}>
            <h2 id={`g-${group}`} className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-muted">{group}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((i) => (
                <div key={i.key} id={i.key} className="card !p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-ink">{i.name}</h3>
                    <span className={`pill shrink-0 ${PILL[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate">{i.does}</p>

                  {i.key === 'quickbooks' && i.status !== 'missing_keys' && (
                    <div className="mt-3">
                      {qb ? (
                        <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm">
                          <span>Company file {qb.externalAccountId}</span>
                          <DisconnectQuickbooksButton />
                        </div>
                      ) : (
                        <a href="/api/admin/integrations/quickbooks/connect" className="btn-primary btn-sm">Connect QuickBooks</a>
                      )}
                    </div>
                  )}

                  {(i.key === 'gusto' || i.key === 'xero') && i.status !== 'missing_keys' && (
                    <div className="mt-3">
                      <ProviderConnect provider={i.key} connected={i.status === 'connected'} label={i.key === 'gusto' ? 'Gusto' : 'Xero'} />
                    </div>
                  )}

                  {i.key === 'google_calendar' && i.status !== 'missing_keys' && (
                    <div className="mt-3">
                      <CalendarConnectCard
                        compact
                        connection={cal ? { accountEmail: cal.accountEmail, lastSyncedAt: cal.lastSyncedAt?.toISOString() ?? null, lastError: cal.lastError } : null}
                      />
                    </div>
                  )}

                  {i.manage && i.status !== 'missing_keys' && (
                    <p className="mt-3 text-sm">
                      <Link href={i.manage.href} className="font-semibold text-bronze hover:underline">{i.manage.label} →</Link>
                    </p>
                  )}

                  {(i.steps.length > 0 || i.env.length > 0) && (
                    <details className="group mt-3 text-sm">
                      <summary className="cursor-pointer font-semibold text-bronze">How to set it up</summary>
                      <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate">
                        {i.steps.map((s) => (
                          <li key={s}>{fill(s)}</li>
                        ))}
                      </ol>
                      {i.env.length > 0 && (
                        <ul className="mt-3 space-y-1">
                          {i.env.map((v) => (
                            <li key={v.name} className="text-slate">
                              <code className="rounded bg-surface px-1.5 py-0.5 text-xs text-ink">{v.name}</code>
                              {v.optional && <span className="text-muted"> (optional)</span>}
                              {v.note && <span className="text-muted"> — {v.note}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {i.getFrom && (
                        <p className="mt-2 text-muted">
                          Get them from{' '}
                          <a className="text-bronze underline" href={i.getFrom.url} target="_blank" rel="noreferrer">{i.getFrom.label}</a>.
                        </p>
                      )}
                    </details>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
