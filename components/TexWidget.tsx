'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Msg = { role: 'user' | 'tex'; text: string; sources?: { title: string; url: string }[]; handoff?: boolean };
type Config = { enabled: boolean; company?: string; audience?: string; suggestions?: string[] };

// Pages where a chat bubble would get in the way (sign-in, payments,
// platform pages) or isn't the company's (TrashCan's own pages).
const HIDDEN = ['/trashcan', '/signin', '/mfa', '/mfa-check', '/start', '/platform', '/security', '/proof', '/unsubscribe', '/terms', '/privacy', '/status', '/set-password', '/forgot', '/pay', '/estimate', '/new'];
// Portals with a bottom tab bar on phones — sit above it.
const WITH_TABS = ['/admin', '/crew', '/account', '/book'];

function conversationId() {
  try {
    const existing = sessionStorage.getItem('tex.conversation');
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem('tex.conversation', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Tex, the chat bubble on every portal and the public site (lib/tex.ts). */
export default function TexWidget() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const convo = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !config) {
      fetch('/api/tex')
        .then((r) => r.json())
        .then(setConfig)
        .catch(() => setConfig({ enabled: false }));
    }
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open, config]);
  // Braces matter: newer Chrome returns a Promise from scrollIntoView, and an
  // effect that returns anything but a function crashes React on cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, busy]);
  // TrashCan's own pages (on its own domain they sit at /, /pricing…) mark
  // themselves with data-tc-surface; Tex is the company's assistant, not TrashCan's.
  const [onTcSurface, setOnTcSurface] = useState(false);
  useEffect(() => setOnTcSurface(!!document.querySelector('[data-tc-surface]')), [pathname]);

  // Stay clear of whatever is pinned to the bottom of the screen — a tab bar,
  // a job's action bar (anything marked data-tex-avoid) — so the bubble never
  // sits on top of a button. Measured, because those bars come and go and
  // change height (components/app/TabBar.tsx, components/CrewJob.tsx).
  const [lift, setLift] = useState<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const sizes = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    function measure() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = window.innerHeight;
        let top = h;
        sizes?.disconnect();
        // Bars stack (a job's action bar sits on the tab bar), so walk up
        // from the bottom edge through every bar touching the one below it.
        const rects = Array.from(document.querySelectorAll<HTMLElement>('[data-tex-avoid]'))
          .map((el) => {
            sizes?.observe(el);
            return el.getBoundingClientRect();
          })
          .filter((r) => r.height > 0)
          .sort((a, b) => b.bottom - a.bottom);
        for (const r of rects) if (r.bottom >= top - 2 && r.top < top) top = r.top;
        setLift(Math.max(0, Math.round(h - top)));
      });
    }
    measure();
    const changes = new MutationObserver(measure);
    changes.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      changes.disconnect();
      sizes?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pathname]);

  if (onTcSurface) return null;
  if (HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  const lifted = WITH_TABS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // In the owner's workspace and the cleaner app (TRASHCAN-styled), Tex wears TrashCan's colours.
  // The cleaner app wears it too (components/app/AppShell.tsx).
  const workspace = ['/admin', '/crew'].some((p) => pathname === p || pathname.startsWith(`${p}/`));

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    convo.current ??= conversationId();
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setDraft('');
    setBusy(true);
    try {
      const res = await fetch('/api/tex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, conversationId: convo.current }) });
      const data = await res.json().catch(() => ({}));
      setMessages((m) => [...m, res.ok ? { role: 'tex', text: data.answer, sources: data.sources, handoff: data.handoff } : { role: 'tex', text: data.error ?? 'Sorry — I couldn’t answer just now.' }]);
    } catch {
      setMessages((m) => [...m, { role: 'tex', text: 'Sorry — I couldn’t reach the server. Check your connection and try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`fixed right-3 z-40 md:right-4 ${lift === null ? (lifted ? 'bottom-24 md:bottom-6' : 'bottom-6') : ''} ${workspace ? 'theme-tc' : ''}`}
      style={lift === null ? undefined : { bottom: lift > 0 ? lift + 12 : 20 }}
    >
      {open && (
        <div
          role="dialog"
          aria-label="Ask Tex"
          className="mb-3 flex w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card-lg"
          style={{ height: `min(32rem, calc(100dvh - ${(lift ?? 96) + 150}px))` }}
        >
          <header className="flex items-center justify-between bg-ink px-4 py-3 text-white">
            <div>
              <p className="font-semibold">Tex</p>
              <p className="text-xs text-white/70">{config?.company ? `${config.company}’s assistant` : 'Assistant'} · answers from our help</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto bg-surface/60 p-3" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="rounded-2xl rounded-tl-md bg-white p-3 text-sm text-ink shadow-sm">
                  Hi, I’m Tex. Ask me anything about {config?.company ?? 'us'} — booking, your cleans, payments. I can’t quote prices, but I can tell you how pricing works.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(config?.suggestions ?? []).map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-slate hover:border-gold">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'rounded-br-md bg-gold text-white' : 'rounded-tl-md bg-white text-ink shadow-sm'}`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.sources && m.sources.length > 0 && (
                    <p className="mt-2 border-t border-line pt-1.5 text-xs">
                      {m.sources.map((s) => (
                        <a key={s.url} href={s.url} className="mr-2 font-semibold text-gold hover:underline">{s.title}</a>
                      ))}
                    </p>
                  )}
                  {m.handoff && <p className="mt-1 text-xs text-muted">The team has been told.</p>}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted">Tex is typing…</p>}
            <div ref={bottom} />
          </div>
          <form
            className="flex items-center gap-2 border-t border-line p-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <input ref={input} className="input !rounded-full !py-2" placeholder="Type a question" maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Your question" />
            <button type="submit" className="btn-primary !rounded-full !px-4 !py-2 text-sm" disabled={busy || !draft.trim()}>
              Ask
            </button>
          </form>
          <button type="button" className="border-t border-line py-2 text-xs font-semibold text-slate hover:text-ink" onClick={() => ask('I’d like to talk to a person')}>
            Talk to a person instead
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close Tex' : 'Ask Tex'}
        className={`ml-auto flex h-12 w-12 items-center justify-center rounded-full shadow-card-lg transition hover:scale-105 md:h-14 md:w-14 ${
          workspace ? 'bg-tc-black text-tc-lime ring-1 ring-white/10' : 'bg-gradient-to-br from-gold to-green-light text-white'
        }`}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-6l-4.5 3.6A.6.6 0 0 1 5.5 19v-3H7a3 3 0 0 1-3-3V5Z" opacity=".95" /><path d="M12 5.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill={workspace ? '#0B0F14' : '#016AEE'} /></svg>
        )}
      </button>
    </div>
  );
}
