'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type Thread = {
  key: string;
  phone: string;
  clientId: string | null;
  clientName: string | null;
  last: { body: string; direction: 'IN' | 'OUT'; at: string; byTex: boolean };
  unread: number;
};
type Message = { id: string; direction: 'IN' | 'OUT'; body: string; at: string; byTex: boolean; by: string | null };
type Client = { id: string; name: string; phone: string; key: string; optedOut: boolean };

const prettyPhone = (p: string) => {
  const d = p.replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
};
const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function Inbox({
  initialThreads,
  clients,
  textingReady,
  startKey,
  startNew,
}: {
  initialThreads: Thread[];
  clients: Client[];
  textingReady: boolean;
  startKey: string | null;
  startNew: boolean;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [active, setActive] = useState<string | null>(startKey);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState(startNew && !startKey);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  const activeThread = threads.find((t) => t.key === active);
  const activeClient = clients.find((c) => c.key === active) ?? (activeThread?.clientId ? clients.find((c) => c.id === activeThread.clientId) : undefined);
  const title = activeThread?.clientName ?? activeClient?.name ?? (active ? prettyPhone(active) : '');

  const loadThreads = useCallback(async () => {
    const res = await fetch('/api/admin/messages', { cache: 'no-store' });
    if (res.ok) setThreads((await res.json()).threads);
  }, []);
  const loadMessages = useCallback(async (key: string) => {
    const res = await fetch(`/api/admin/messages/${key}`, { cache: 'no-store' });
    if (res.ok) setMessages((await res.json()).messages);
  }, []);

  useEffect(() => {
    if (active) loadMessages(active).then(loadThreads);
    else setMessages([]);
  }, [active, loadMessages, loadThreads]);

  // New texts show up without a reload.
  useEffect(() => {
    const t = setInterval(() => {
      loadThreads();
      if (active) loadMessages(active);
    }, 15000);
    return () => clearInterval(t);
  }, [active, loadMessages, loadThreads]);

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [messages.length]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => !q || c.name.toLowerCase().includes(q) || c.key.includes(q.replace(/\D/g, '') || '~')).slice(0, 8);
  }, [clients, search]);

  async function send() {
    if (!active || !draft.trim()) return;
    setBusy(true);
    setError('');
    const body = activeClient ? { clientId: activeClient.id, body: draft } : { phone: active, body: draft };
    const res = await fetch('/api/admin/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? 'The text didn’t send.');
    setDraft('');
    await loadMessages(active);
    await loadThreads();
  }

  return (
    <div className="space-y-3">
      {!textingReady && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-slate">
          <strong className="text-ink">Texting isn’t connected yet.</strong> Add your Twilio keys and business number (
          <Link href="/admin/integrations" className="font-semibold text-gold hover:underline">Settings → Integrations</Link>) and you can text
          clients from here. Texts your clients send in will land here too.
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-line bg-white md:h-[70vh] md:grid-cols-[320px_minmax(0,1fr)]">
        {/* Thread list */}
        <aside className={`min-w-0 flex min-h-0 flex-col border-line md:border-r ${active || picking ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center justify-between border-b border-line p-3">
            <p className="font-semibold">Conversations</p>
            <button type="button" className="btn-primary !px-3 !py-1.5 text-sm" onClick={() => { setPicking(true); setActive(null); }}>
              New text
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.length === 0 && <p className="p-6 text-center text-sm text-muted">No texts yet. Start one with “New text”.</p>}
            {threads.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setPicking(false); setActive(t.key); }}
                className={`flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-left transition hover:bg-surface ${active === t.key ? 'bg-surface' : ''}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/10 text-sm font-bold text-gold">
                  {(t.clientName ?? '#').slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate ${t.unread ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{t.clientName ?? prettyPhone(t.phone)}</span>
                    <span className="shrink-0 text-xs text-muted">{when(t.last.at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={`truncate text-sm ${t.unread ? 'text-ink' : 'text-slate'}`}>
                      {t.last.direction === 'OUT' ? (t.last.byTex ? 'Tex: ' : 'You: ') : ''}
                      {t.last.body}
                    </span>
                    {t.unread > 0 && <span className="pill shrink-0 bg-gold !px-2 !py-0.5 text-white">{t.unread}</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Conversation */}
        <section className={`min-w-0 flex min-h-[60vh] flex-col md:min-h-0 ${active || picking ? 'flex' : 'hidden md:flex'}`}>
          {picking ? (
            <div className="p-4">
              <button type="button" className="mb-3 text-sm font-semibold text-gold md:hidden" onClick={() => setPicking(false)}>
                ← Conversations
              </button>
              <label className="label" htmlFor="pick-client">Text a client</label>
              <input id="pick-client" className="input" autoFocus placeholder="Search by name or number" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="mt-2 divide-y divide-line rounded-xl border border-line">
                {matches.length === 0 && <p className="p-4 text-sm text-muted">No client with a mobile number matches.</p>}
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface"
                    onClick={() => { setPicking(false); setActive(c.key); }}
                  >
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-sm text-muted">{c.optedOut ? 'Replied STOP' : prettyPhone(c.phone)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : active ? (
            <>
              <header className="flex items-center gap-3 border-b border-line p-3">
                <button type="button" className="text-sm font-semibold text-gold md:hidden" onClick={() => setActive(null)} aria-label="Back to conversations">
                  ←
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{title}</p>
                  <p className="text-xs text-muted">{prettyPhone(active)}{activeClient?.optedOut ? ' · replied STOP — texts blocked' : ''}</p>
                </div>
                {activeClient && (
                  <Link href={`/admin/clients/${activeClient.id}`} className="text-sm font-semibold text-gold hover:underline">
                    Client →
                  </Link>
                )}
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-surface/50 p-4">
                {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">No messages yet — say hello.</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.direction === 'OUT' ? 'rounded-br-md bg-gold text-white' : 'rounded-bl-md border border-line bg-white text-ink'}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`mt-1 text-[11px] ${m.direction === 'OUT' ? 'text-white/75' : 'text-muted'}`}>
                        {m.byTex ? 'Tex · ' : m.by ? `${m.by} · ` : ''}
                        {when(m.at)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <form
                className="flex items-end gap-2 border-t border-line p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <textarea
                  className="input min-h-[48px] flex-1 resize-none !py-2.5"
                  rows={1}
                  maxLength={1000}
                  placeholder={textingReady ? 'Type a text…' : 'Connect texting to send'}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button type="submit" className="btn-primary !px-4 !py-3" disabled={busy || !draft.trim()}>
                  {busy ? 'Sending…' : 'Send'}
                </button>
              </form>
              {error && <p className="px-3 pb-3 text-sm text-red-600">{error}</p>}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted">Pick a conversation, or start a new text.</div>
          )}
        </section>
      </div>
    </div>
  );
}
