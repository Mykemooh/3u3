'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Conv = {
  id: string;
  channel: 'WEB' | 'SMS' | 'VOICE';
  who: string;
  lastAt: string;
  needsYou: boolean;
  messages: { id: string; author: 'USER' | 'TEX' | 'STAFF'; body: string; at: string; handoff: boolean; sources: { title: string; url: string }[] }[];
};

const CHANNEL = { WEB: 'Chat', SMS: 'Text', VOICE: 'Call' } as const;
const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function TexConversations({ conversations }: { conversations: Conv[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'needs'>(conversations.some((c) => c.needsYou) ? 'needs' : 'all');
  const [open, setOpen] = useState<string | null>(null);
  const list = filter === 'needs' ? conversations.filter((c) => c.needsYou) : conversations;

  async function handled(id: string) {
    await fetch('/api/admin/tex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: id }) });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['needs', 'all'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`pill !px-3 !py-1.5 text-sm ${filter === f ? 'bg-ink text-white' : 'bg-surface text-slate'}`}>
            {f === 'needs' ? `Needs you (${conversations.filter((c) => c.needsYou).length})` : `All (${conversations.length})`}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {list.length === 0 && <p className="p-6 text-center text-sm text-muted">{filter === 'needs' ? 'Nothing waiting on you.' : 'No conversations yet.'}</p>}
        {list.map((c) => {
          const lastUser = [...c.messages].reverse().find((m) => m.author === 'USER');
          const isOpen = open === c.id;
          const digits = c.id.startsWith('sms:') ? c.id.slice(4) : null;
          return (
            <div key={c.id} className="border-b border-line/60 last:border-0">
              <button type="button" className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
                <span className="pill mt-0.5 shrink-0 bg-surface text-slate">{CHANNEL[c.channel]}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{c.who}</span>
                    <span className="shrink-0 text-xs text-muted">{when(c.lastAt)}</span>
                  </span>
                  <span className="block truncate text-sm text-slate">{lastUser?.body ?? ''}</span>
                </span>
                {c.needsYou && <span className="pill shrink-0 bg-amber-100 text-amber-800">Needs you</span>}
              </button>
              {isOpen && (
                <div className="space-y-2 bg-surface/60 px-4 py-3">
                  {c.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.author === 'USER' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.author === 'USER' ? 'border border-line bg-white' : m.author === 'STAFF' ? 'bg-green/10 text-ink' : 'bg-gold text-white'}`}>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        {m.sources.length > 0 && <p className="mt-1 text-[11px] opacity-80">From: {m.sources.map((s) => s.title).join(', ')}</p>}
                        <p className="mt-1 text-[11px] opacity-70">{m.author === 'TEX' ? 'Tex' : m.author === 'STAFF' ? 'Team' : c.who} · {when(m.at)}{m.handoff ? ' · handed to you' : ''}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {digits && <Link href={`/admin/messages?t=${digits}`} className="btn-secondary !px-3 !py-1.5 text-sm">Reply by text</Link>}
                    {c.needsYou && <button type="button" className="btn-primary !px-3 !py-1.5 text-sm" onClick={() => handled(c.id)}>Mark handled</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
