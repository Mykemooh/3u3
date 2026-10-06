import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { listApiKeys } from '@/lib/apiKeys';
import { listEndpoints, listDeliveries, WEBHOOK_EVENTS } from '@/lib/webhooks';
import { appUrl } from '@/lib/url';
import DevelopersManager from '@/components/admin/DevelopersManager';

export const dynamic = 'force-dynamic';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export default async function DevelopersPage() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as { tenantId?: string } | undefined)?.tenantId;
  if (!tenantId) redirect('/admin');
  const [keys, endpoints, deliveries] = await Promise.all([listApiKeys(tenantId), listEndpoints(tenantId), listDeliveries(tenantId)]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">API and webhooks</h1>
        <p className="max-w-2xl text-slate">
          Connect Zapier, Make, n8n or your own tools: send leads in with an API key, and get a signed message at your
          address whenever a lead, booking, job, invoice or review changes.
        </p>
      </div>
      <DevelopersManager
        site={appUrl('').replace(/\/$/, '')}
        events={WEBHOOK_EVENTS.map((e) => ({ ...e }))}
        keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt.toISOString(), lastUsedAt: iso(k.lastUsedAt), revokedAt: iso(k.revokedAt) }))}
        endpoints={endpoints.map((e) => ({ id: e.id, url: e.url, description: e.description, events: e.events, active: e.active, createdAt: e.createdAt.toISOString() }))}
        deliveries={deliveries.map((d) => ({ id: d.id, endpointId: d.endpointId, eventType: d.eventType, status: d.status, attempts: d.attempts, lastStatusCode: d.lastStatusCode, lastError: d.lastError, nextAttemptAt: iso(d.nextAttemptAt), createdAt: d.createdAt.toISOString() }))}
      />
    </div>
  );
}
