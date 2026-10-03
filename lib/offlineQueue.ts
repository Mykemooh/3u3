'use client';

/**
 * A durable, browser-only queue of crew actions that couldn't reach the
 * server — checklist changes, job status changes, and photo/video
 * uploads (the raw file is stored right in IndexedDB, since a Blob
 * survives there). Nothing here imports server code; it only ever runs
 * in the browser. lib/offlineSync.ts is what actually replays a queued
 * action against the real API once back online.
 */

const DB_NAME = '3u3-offline';
const DB_VERSION = 1;
const STORE = 'pending';

export type PendingChecklist = {
  id: string;
  kind: 'CHECKLIST';
  createdAt: number;
  jobId: string;
  itemId: string;
  action: 'done' | 'undone' | 'skip' | 'unskip';
  skipReason?: string;
};

export type PendingJobStatus = {
  id: string;
  kind: 'JOB_STATUS';
  createdAt: number;
  jobId: string;
  action: 'en-route' | 'start' | 'complete';
  body: Record<string, unknown>;
};

export type PendingMedia = {
  id: string;
  kind: 'MEDIA';
  createdAt: number;
  jobId: string;
  itemId: string;
  phase: 'BEFORE' | 'AFTER';
  mediaKind: 'PHOTO' | 'VIDEO';
  fileBlob: Blob;
  fileName: string;
  fileType: string;
};

export type PendingAction = PendingChecklist | PendingJobStatus | PendingMedia;

// Plain Omit<Union, K> collapses to the union of each member's keys minus
// K, which loses the per-member discrimination TS needs for excess-
// property checks on a literal — this distributes Omit over each member
// first instead, so passing e.g. a CHECKLIST literal only has to satisfy
// CHECKLIST's own shape.
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
type NewPendingAction = DistributiveOmit<PendingAction, 'id' | 'createdAt'>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('jobId', 'jobId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Safe in any environment this runs — returns false rather than throwing where IndexedDB isn't available (very old browsers, some private-mode states). */
export function offlineQueueSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function enqueueAction(action: NewPendingAction): Promise<PendingAction> {
  const full = { ...action, id: crypto.randomUUID(), createdAt: Date.now() } as PendingAction;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(full);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return full;
}

export async function listPendingForJob(jobId: string): Promise<PendingAction[]> {
  const db = await openDb();
  const result = await new Promise<PendingAction[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('jobId');
    const req = index.getAll(jobId);
    req.onsuccess = () => resolve(req.result as PendingAction[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePendingAction(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
