'use client';

import { useCallback, useEffect, useState } from 'react';
import { listPendingForJob, removePendingAction, type PendingAction } from '@/lib/offlineQueue';
import { uploadMedia } from '@/lib/clientUpload';

/** True for an actual network failure (offline, DNS, timeout) — never for a real HTTP error response. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.message === 'Failed to fetch');
}

type SyncHandlers = {
  onChecklistSynced: (itemId: string, data: any) => void;
  onMediaSynced: (data: any) => void;
  onJobStatusSynced: (action: 'en-route' | 'start' | 'complete', data: any) => void;
  onActionFailed: (action: PendingAction, message: string) => void;
};

/**
 * Replays this job's queued actions, oldest first, against the real API.
 * Stops the moment one fails from an actual network error (still
 * offline) so later actions keep their place in line; a server-side
 * rejection (bad request, already done) is dropped from the queue
 * instead of retried forever, and reported via onActionFailed.
 * Returns how many actions are still pending afterward.
 */
export async function flushPendingForJob(jobId: string, handlers: SyncHandlers): Promise<number> {
  const pending = await listPendingForJob(jobId);
  for (const action of pending) {
    try {
      if (action.kind === 'CHECKLIST') {
        const form = new FormData();
        form.append('kind', action.action);
        if (action.skipReason) form.append('skipReason', action.skipReason);
        const res = await fetch(`/api/crew/jobs/${action.jobId}/items/${action.itemId}`, { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          await removePendingAction(action.id);
          handlers.onActionFailed(action, data.error || 'Could not sync a checklist change.');
          continue;
        }
        await removePendingAction(action.id);
        handlers.onChecklistSynced(action.itemId, data.item);
      } else if (action.kind === 'JOB_STATUS') {
        const res = await fetch(`/api/crew/jobs/${action.jobId}/${action.action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          await removePendingAction(action.id);
          handlers.onActionFailed(action, data.error || 'Could not sync a job update.');
          continue;
        }
        await removePendingAction(action.id);
        handlers.onJobStatusSynced(action.action as any, data);
      } else {
        const file = new File([action.fileBlob], action.fileName, { type: action.fileType });
        const data = await uploadMedia({ jobId: action.jobId, itemId: action.itemId, phase: action.phase, kind: action.mediaKind, file });
        await removePendingAction(action.id);
        handlers.onMediaSynced(data);
      }
    } catch (err) {
      if (isNetworkError(err)) {
        // Still offline (or just lost signal again) — leave this and
        // everything after it queued, try again next time.
        break;
      }
      await removePendingAction(action.id);
      handlers.onActionFailed(action, err instanceof Error ? err.message : 'Sync failed.');
    }
  }
  return (await listPendingForJob(jobId)).length;
}

/**
 * Tracks connectivity and this job's queue depth, and auto-flushes the
 * queue whenever the browser comes back online (and once on mount, in
 * case actions were queued in a previous visit and never synced).
 */
export function useOfflineSync(jobId: string, handlers: SyncHandlers) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPendingCount = useCallback(() => {
    listPendingForJob(jobId).then((rows) => setPendingCount(rows.length)).catch(() => {});
  }, [jobId]);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const remaining = await flushPendingForJob(jobId, handlers);
      setPendingCount(remaining);
    } finally {
      setSyncing(false);
    }
    // handlers is expected to be referentially stable enough for this —
    // it's only read, never a dependency that should re-trigger a flush.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    refreshPendingCount();
    const onOnline = () => {
      setIsOnline(true);
      flush();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (navigator.onLine) flush();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // Runs once per job id — flush/refreshPendingCount close over the
    // current jobId already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return { isOnline, pendingCount, syncing, flush, refreshPendingCount };
}

/** Registers the crew service worker (public/sw.js) — safe to call repeatedly; a no-op if unsupported or already registered. */
export function registerCrewServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Offline support degrades gracefully to "online only" — never block the page on this.
  });
}
