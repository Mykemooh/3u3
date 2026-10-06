'use client';

import { useT } from '@/components/i18n/LocaleProvider';
import { crewMessages } from '@/lib/i18n/messages/crew';

export default function OfflineBanner({
  isOnline,
  pendingCount,
  syncing,
  onSyncNow,
}: {
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  onSyncNow: () => void;
}) {
  const t = useT(crewMessages);
  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
        isOnline ? 'bg-amber-50 text-amber-800' : 'bg-ink text-white'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${isOnline ? 'bg-amber-500' : 'bg-red-400'}`} aria-hidden="true" />
        {!isOnline
          ? pendingCount > 0
            ? t('offlineNoSignalWaiting', { count: pendingCount })
            : t('offlineNoSignal')
          : t(pendingCount === 1 ? 'offlineWaitingOne' : 'offlineWaitingMany', { count: pendingCount })}
      </span>
      {isOnline && pendingCount > 0 && (
        <button type="button" onClick={onSyncNow} disabled={syncing} className="text-xs font-semibold underline underline-offset-2 disabled:opacity-60">
          {syncing ? t('offlineSyncing') : t('offlineSyncNow')}
        </button>
      )}
    </div>
  );
}
