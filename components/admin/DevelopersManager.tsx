'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };
type Endpoint = { id: string; url: string; description: string | null; events: string; active: boolean; createdAt: string };
type Delivery = {
  id: string;
  endpointId: string;
  eventType: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  attempts: number;
  nextAttemptAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
};
type EventDef = { type: string; label: string; detail: string };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const DELIVERY_PILL: Record<Delivery['status'], string> = {
  SUCCEEDED: 'bg-green-light text-[#0E6B62]',
  PENDING: 'bg-amber-50 text-amber-800',
  FAILED: 'bg-red-50 text-red-700',
};

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Couldn’t save.');
  return data;
}

/** A value shown exactly once, with a copy button and a plain warning. */
function ShowOnce({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-gold/40 bg-gold/5 p-4" role="alert">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <p className="mt-1 text-sm text-slate">Copy it now. It won’t be shown again — if it’s lost, make a new one.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 text-sm text-ink">{value}</code>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn-sm rounded-full px-3 text-sm text-slate hover:text-ink" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

export default function DevelopersManager({ keys, endpoints, deliveries, events, site }: { keys: Key[]; endpoints: Endpoint[]; deliveries: Delivery[]; events: EventDef[]; site: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [hook, setHook] = useState({ url: '', description: '', events: [] as string[] });
  const [addingHook, setAddingHook] = useState(false);
  const [notice, setNotice] = useState('');

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save.');
    } finally {
      setBusy(null);
    }
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const endpointUrl = (id: string) => endpoints.find((e) => e.id === id)?.url ?? 'Removed';

  return (
    <div className="space-y-8">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p className="rounded-xl bg-surface px-4 py-3 text-sm text-slate" role="status">{notice}</p>}

      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold text-ink">API keys</h2>
          <p className="text-sm text-slate">
            For Zapier, Make, n8n or your own website form. A key can send leads into this account; it can’t read your
            clients, schedule or invoices.
          </p>
        </div>
        {newKey && <ShowOnce label="Your new API key" value={newKey} onDone={() => setNewKey(null)} />}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run('key', async () => {
              const data = await call('/api/admin/developers/keys', 'POST', { name: keyName });
              setNewKey(data.key);
              setKeyName('');
            });
          }}
        >
          <label className="min-w-[14rem] flex-1">
            <span className="sr-only">Key name</span>
            <input className="input !py-2.5" placeholder='Name, e.g. "Zapier – Angi leads"' value={keyName} maxLength={80} onChange={(e) => setKeyName(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary btn-sm" disabled={busy === 'key' || !keyName.trim()}>
            {busy === 'key' ? 'Creating…' : 'Create key'}
          </button>
        </form>
        {keys.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold ${k.revokedAt ? 'text-muted line-through' : 'text-ink'}`}>{k.name}</p>
                  <p className="text-muted">
                    <code>{k.prefix}…</code> · made {when(k.createdAt)} · {k.lastUsedAt ? `last used ${when(k.lastUsedAt)}` : 'not used yet'}
                    {k.revokedAt && ` · revoked ${when(k.revokedAt)}`}
                  </p>
                </div>
                {!k.revokedAt && (
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-slate hover:bg-surface hover:text-red-600"
                    disabled={busy === k.id}
                    onClick={() => {
                      if (!window.confirm(`Revoke "${k.name}"? Anything using it stops working right away.`)) return;
                      run(k.id, () => call(`/api/admin/developers/keys/${k.id}`, 'DELETE'));
                    }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {activeKeys.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-bronze">Send a lead in with a key</summary>
            <div className="mt-2 space-y-2 text-slate">
              <p>
                POST JSON to <code className="text-ink">{site}/api/hooks/leads</code> with the header{' '}
                <code className="text-ink">Authorization: Bearer &lt;your key&gt;</code>. Name and a phone or email are
                required; everything else is optional. A lead with the same phone or email as an open one is added to
                that lead instead of making a second.
              </p>
              <pre className="overflow-x-auto rounded-xl bg-surface p-3 text-xs text-ink">{`{
  "name": "Jamie Lee",
  "phone": "+12815550123",
  "email": "jamie@example.com",
  "address": "123 Main St, Katy, TX 77494",
  "service": "Deep cleaning",
  "message": "3 bed, 2 bath. Moving out on the 30th.",
  "source": "Thumbtack"
}`}</pre>
            </div>
          </details>
        )}
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink">Webhooks</h2>
            <p className="text-sm text-slate">We POST signed JSON to these addresses when something happens. Failed sends are retried for about 15 hours.</p>
          </div>
          {!addingHook && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setAddingHook(true)}>
              Add an address
            </button>
          )}
        </div>
        {newSecret && <ShowOnce label="Signing secret" value={newSecret} onDone={() => setNewSecret(null)} />}
        {addingHook && (
          <form
            className="space-y-3 rounded-xl border border-line p-4"
            onSubmit={(e) => {
              e.preventDefault();
              run('hook', async () => {
                const data = await call('/api/admin/developers/webhooks', 'POST', {
                  url: hook.url,
                  description: hook.description || null,
                  events: hook.events.length ? hook.events : ['*'],
                });
                setNewSecret(data.secret);
                setHook({ url: '', description: '', events: [] });
                setAddingHook(false);
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="label">Address</span>
                <input className="input !py-2.5" type="url" required placeholder="https://hooks.zapier.com/…" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} />
              </label>
              <label>
                <span className="label">Note (optional)</span>
                <input className="input !py-2.5" placeholder="What it’s for" maxLength={120} value={hook.description} onChange={(e) => setHook({ ...hook, description: e.target.value })} />
              </label>
            </div>
            <fieldset>
              <legend className="label">Events (none ticked = every event)</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {events.map((ev) => (
                  <label key={ev.type} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={hook.events.includes(ev.type)}
                      onChange={(e) => setHook({ ...hook, events: e.target.checked ? [...hook.events, ev.type] : hook.events.filter((x) => x !== ev.type) })}
                    />
                    <span>
                      <code className="text-ink">{ev.type}</code> <span className="text-muted">— {ev.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary btn-sm" disabled={busy === 'hook'}>
                {busy === 'hook' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setAddingHook(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {endpoints.length === 0 && !addingHook && <p className="text-sm text-muted">No addresses yet.</p>}
        {endpoints.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line">
            {endpoints.map((ep) => (
              <div key={ep.id} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${ep.active ? 'bg-green' : 'bg-line'}`} aria-hidden />
                  <code className="min-w-0 flex-1 break-all text-ink">{ep.url}</code>
                  <span className="text-muted">{ep.active ? 'On' : 'Off'}</span>
                </div>
                <p className="text-muted">
                  {ep.description ? `${ep.description} · ` : ''}
                  {ep.events === '*' ? 'Every event' : ep.events.split(',').join(', ')}
                </p>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-slate hover:bg-surface"
                    disabled={busy === `t${ep.id}` || !ep.active}
                    onClick={() =>
                      run(`t${ep.id}`, async () => {
                        const r = await call(`/api/admin/developers/webhooks/${ep.id}/test`, 'POST');
                        setNotice(r.status === 'SUCCEEDED' ? `Test event delivered (HTTP ${r.code}).` : `Test event not delivered: ${r.error ?? 'no answer'}. It will be retried.`);
                      })
                    }
                  >
                    {busy === `t${ep.id}` ? 'Sending…' : 'Send test event'}
                  </button>
                  <button type="button" className="rounded-lg px-2 py-1 text-slate hover:bg-surface" onClick={() => run(`a${ep.id}`, () => call(`/api/admin/developers/webhooks/${ep.id}`, 'PATCH', { active: !ep.active }))}>
                    {ep.active ? 'Turn off' : 'Turn on'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-slate hover:bg-surface"
                    onClick={() => {
                      if (!window.confirm('Make a new signing secret? The old one stops working right away.')) return;
                      run(`r${ep.id}`, async () => setNewSecret((await call(`/api/admin/developers/webhooks/${ep.id}/rotate`, 'POST')).secret));
                    }}
                  >
                    New secret
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-slate hover:bg-surface hover:text-red-600"
                    onClick={() => {
                      if (!window.confirm('Remove this address and its delivery log?')) return;
                      run(`d${ep.id}`, () => call(`/api/admin/developers/webhooks/${ep.id}`, 'DELETE'));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-bronze">Checking the signature</summary>
          <div className="mt-2 space-y-2 text-slate">
            <p>
              Each request carries <code className="text-ink">TrashCan-Signature: t=&lt;unix time&gt;,v1=&lt;hex&gt;</code>. Compute
              HMAC-SHA256 of <code className="text-ink">&lt;t&gt;.&lt;raw body&gt;</code> with your signing secret and compare it to{' '}
              <code className="text-ink">v1</code>. Reject anything more than five minutes old. Use{' '}
              <code className="text-ink">TrashCan-Delivery</code> to ignore a delivery you’ve already handled.
            </p>
            <pre className="overflow-x-auto rounded-xl bg-surface p-3 text-xs text-ink">{`{ "id": "evt_…", "type": "booking.created", "created_at": "2026-10-06T15:04:05Z", "data": { … } }`}</pre>
          </div>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-ink">Delivery log</h2>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted">Nothing sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 pr-3 font-semibold">Event</th>
                  <th className="py-2 pr-3 font-semibold">To</th>
                  <th className="py-2 pr-3 font-semibold">Result</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate">{when(d.createdAt)}</td>
                    <td className="py-2 pr-3"><code className="text-ink">{d.eventType}</code></td>
                    <td className="max-w-[16rem] truncate py-2 pr-3 text-slate">{endpointUrl(d.endpointId)}</td>
                    <td className="py-2 pr-3">
                      <span className={`pill ${DELIVERY_PILL[d.status]}`}>
                        {d.status === 'SUCCEEDED' ? 'Delivered' : d.status === 'FAILED' ? 'Gave up' : 'Retrying'}
                      </span>
                      <span className="ml-2 text-muted">
                        {d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : d.lastError ?? ''}
                        {d.attempts > 1 ? ` · ${d.attempts} tries` : ''}
                        {d.status === 'PENDING' && d.nextAttemptAt ? ` · next ${when(d.nextAttemptAt)}` : ''}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {d.status !== 'SUCCEEDED' && (
                        <button type="button" className="rounded-lg px-2 py-1 text-slate hover:bg-surface" disabled={busy === d.id} onClick={() => run(d.id, () => call(`/api/admin/developers/deliveries/${d.id}/retry`, 'POST'))}>
                          {busy === d.id ? 'Sending…' : 'Retry now'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
