'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { intlLocale } from '@/lib/i18n';
import { crewMessages } from '@/lib/i18n/messages/crew';

type Connection = { accountEmail: string | null; lastSyncedAt: string | null; lastError: string | null } | null;

/** Connect / disconnect the signed-in staff member's own Google Calendar (lib/googleCalendar.ts). */
export default function CalendarConnectCard({ connection, compact = false }: { connection: Connection; compact?: boolean }) {
  const router = useRouter();
  const t = useT(crewMessages);
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    if (!window.confirm(t('calDisconnectConfirm'))) return;
    setBusy(true);
    await fetch('/api/calendar/google/disconnect', { method: 'POST' });
    setBusy(false);
    router.refresh();
  }

  if (!connection) {
    return (
      <div className={compact ? '' : 'flex flex-wrap items-center justify-between gap-3'}>
        {!compact && <p className="text-sm text-slate">{t('calPitch')}</p>}
        <a href="/api/calendar/google/connect" className="btn-secondary btn-sm">{t('calConnect')}</a>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
      <div>
        <p className="font-semibold text-ink">{t('calConnected')}{connection.accountEmail ? ` · ${connection.accountEmail}` : ''}</p>
        {connection.lastError ? (
          <p className="text-red-700">{connection.lastError}</p>
        ) : (
          <p className="text-muted">{connection.lastSyncedAt ? t('calLastUpdated', { when: new Date(connection.lastSyncedAt).toLocaleString(intlLocale(locale), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }) : t('calSyncing')}</p>
        )}
      </div>
      <div className="flex gap-2">
        {connection.lastError && <a href="/api/calendar/google/connect" className="btn-secondary btn-sm">{t('calConnectAgain')}</a>}
        <button type="button" onClick={disconnect} disabled={busy} className="text-sm text-muted hover:text-ink">
          {busy ? t('calDisconnecting') : t('calDisconnect')}
        </button>
      </div>
    </div>
  );
}
