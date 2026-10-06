'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Connection = { accountEmail: string | null; lastSyncedAt: string | null; lastError: string | null } | null;

/** Connect / disconnect the signed-in staff member's own Google Calendar (lib/googleCalendar.ts). */
export default function CalendarConnectCard({ connection, compact = false }: { connection: Connection; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    if (!window.confirm('Disconnect Google Calendar? Upcoming jobs added by this app are removed from it.')) return;
    setBusy(true);
    await fetch('/api/calendar/google/disconnect', { method: 'POST' });
    setBusy(false);
    router.refresh();
  }

  if (!connection) {
    return (
      <div className={compact ? '' : 'flex flex-wrap items-center justify-between gap-3'}>
        {!compact && <p className="text-sm text-slate">Put your jobs in your own Google Calendar. They stay in step when the schedule changes.</p>}
        <a href="/api/calendar/google/connect" className="btn-secondary btn-sm">Connect Google Calendar</a>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
      <div>
        <p className="font-semibold text-ink">Google Calendar connected{connection.accountEmail ? ` · ${connection.accountEmail}` : ''}</p>
        {connection.lastError ? (
          <p className="text-red-700">{connection.lastError}</p>
        ) : (
          <p className="text-muted">{connection.lastSyncedAt ? `Last updated ${new Date(connection.lastSyncedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Syncing…'}</p>
        )}
      </div>
      <div className="flex gap-2">
        {connection.lastError && <a href="/api/calendar/google/connect" className="btn-secondary btn-sm">Connect again</a>}
        <button type="button" onClick={disconnect} disabled={busy} className="text-sm text-muted hover:text-ink">
          {busy ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </div>
  );
}
