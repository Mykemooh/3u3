'use client';

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
          ? `No signal — your changes are being saved on this phone${pendingCount > 0 ? ` (${pendingCount} waiting to sync)` : ''}.`
          : `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync…`}
      </span>
      {isOnline && pendingCount > 0 && (
        <button type="button" onClick={onSyncNow} disabled={syncing} className="text-xs font-semibold underline underline-offset-2 disabled:opacity-60">
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </div>
  );
}
