'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import JourneyRail from '@/components/app/JourneyRail';
import { uploadMedia, type Kind, type Phase } from '@/lib/clientUpload';
import { useLocationReporter, currentPosition } from '@/lib/useLocationReporter';
import { useOfflineSync, registerCrewServiceWorker, isNetworkError } from '@/lib/offlineSync';
import { enqueueAction, removePendingAction, offlineQueueSupported } from '@/lib/offlineQueue';
import OfflineBanner from '@/components/crew/OfflineBanner';

export type CrewMedia = {
  id: string;
  itemId: string;
  phase: Phase;
  kind: Kind;
  url: string;
  /** ISO timestamp — photos already have one burned into the image itself (lib/clientUpload.ts); videos don't, so this is shown as text for both. */
  createdAt: string;
};

export type CrewItem = {
  id: string;
  roomName: string;
  taskDetail: string | null;
  status: 'PENDING' | 'COMPLETE' | 'SKIPPED';
  skipReason: string | null;
};

type JobStatus = 'PENDING' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETE';

type PhotoPolicy = { requireBeforePhoto: boolean; noPhotosNeeded: boolean };

export type CrewHomeProfile = {
  pets: string | null;
  parkingNotes: string | null;
  allergyNotes: string | null;
  doNotTouch: string | null;
  entryCode: string | null;
  entryCodeSet: boolean;
  roomNotes: { id: string; roomName: string; notes: string }[];
};

type Props = {
  job: { id: string; status: JobStatus; startedLabel: string | null; completedLabel: string | null; cleanerNotesAckAt: string | null } & PhotoPolicy;
  client: { name: string; phone: string | null };
  serviceLabel: string;
  whenLabel: string;
  addressLabel: string | null;
  /** The free-text "cleaner needs to know" catch-all (components/AddressForm.tsx sets it). */
  cleanerNotes: string | null;
  /** The structured home profile — pets, parking, allergies, do-not-touch, entry code, room notes (components/HomeProfileEditor.tsx sets it). Null when there's nothing in it. */
  homeProfile: CrewHomeProfile | null;
  items: CrewItem[];
  media: CrewMedia[];
  perPhase: number;
  videoSeconds: number;
  isAdmin: boolean;
  /** Team Lead (or admin): starts the trip, marks arrival, finishes. */
  canLead: boolean;
};

type Upload = { key: string; itemId: string; phase: Phase; kind: Kind; progress: number };

export default function CrewJob(props: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus>(props.job.status);
  const [startedLabel, setStartedLabel] = useState(props.job.startedLabel);
  const [items, setItems] = useState(props.items);
  const [media, setMedia] = useState(props.media);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState<'drive' | 'start' | 'finish' | null>(null);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState<{ invoiceId: string | null } | null>(null);
  const [showDirections, setShowDirections] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [notesAcknowledged, setNotesAcknowledged] = useState(!!props.job.cleanerNotesAckAt);
  const hasCleanerNotes = !!props.cleanerNotes?.trim() || !!props.homeProfile;
  const notesBlockStart = hasCleanerNotes && !notesAcknowledged;
  const [showEntryCode, setShowEntryCode] = useState(false);
  const [policy, setPolicy] = useState<PhotoPolicy>({
    requireBeforePhoto: props.job.requireBeforePhoto,
    noPhotosNeeded: props.job.noPhotosNeeded,
  });
  const [policyBusy, setPolicyBusy] = useState(false);

  const done = items.filter((i) => i.status !== 'PENDING').length;
  const allDone = done === items.length && items.length > 0;
  const open = status === 'IN_PROGRESS';
  const notStarted = status === 'PENDING' || status === 'EN_ROUTE';
  // Only the lead's phone shares its location — one dot on the client's map.
  const { status: location, detail: locationDetail } = useLocationReporter(props.job.id, status === 'EN_ROUTE' && props.canLead);

  const steps = useMemo(
    () => [
      {
        label: 'Start',
        state: notStarted ? ('current' as const) : ('done' as const),
        detail: status === 'EN_ROUTE' ? 'Driving' : startedLabel ?? undefined,
      },
      {
        label: 'Rooms',
        state: notStarted ? ('todo' as const) : status === 'COMPLETE' || allDone ? ('done' as const) : ('current' as const),
        detail: `${done}/${items.length}`,
      },
      {
        label: 'Finish',
        state: status === 'COMPLETE' ? ('done' as const) : allDone && open ? ('current' as const) : ('todo' as const),
        detail: props.job.completedLabel ?? undefined,
      },
    ],
    [status, notStarted, startedLabel, done, items.length, allDone, open, props.job.completedLabel],
  );

  function applyItem(updated: CrewItem | null | undefined) {
    if (!updated) return;
    setItems((prev) => prev.map((i) => (i.id === updated.id ? { ...i, status: updated.status, skipReason: updated.skipReason } : i)));
  }

  // Offline support: when a mutation can't reach the network, it's
  // queued in IndexedDB (lib/offlineQueue.ts) instead of failing, the UI
  // updates optimistically so the crew can keep working, and the queue
  // replays itself — in order — the moment the browser comes back
  // online (lib/offlineSync.ts). Registering the service worker here
  // (once per job page) is what lets this page itself keep loading with
  // no signal, not just its data mutations.
  useEffect(() => {
    registerCrewServiceWorker();
  }, []);

  const offline = useOfflineSync(props.job.id, {
    onChecklistSynced: (_itemId, item) => applyItem(item),
    onMediaSynced: (pendingId, data) => {
      // Only replace the one placeholder that actually just synced —
      // other still-queued items (and their own local previews) must
      // stay exactly as they are until their own turn comes.
      setMedia((m) => {
        const placeholder = m.find((x) => x.id === `pending:${pendingId}`);
        if (placeholder) URL.revokeObjectURL(placeholder.url);
        const withoutPlaceholder = m.filter((x) => x.id !== `pending:${pendingId}`);
        return data.media ? [...withoutPlaceholder, data.media] : withoutPlaceholder;
      });
      applyItem(data.item);
    },
    onJobStatusSynced: (action, data) => {
      if (action === 'start') {
        setStatus('IN_PROGRESS');
        setStartedLabel(new Date(data.startedAt ?? Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
      } else if (action === 'en-route') {
        setStatus('EN_ROUTE');
      } else if (action === 'complete') {
        setStatus('COMPLETE');
        setFinished({ invoiceId: data.invoiceId ?? null });
      }
    },
    onActionFailed: (action, message) => {
      if (action.kind === 'MEDIA') {
        setMedia((m) => {
          const placeholder = m.find((x) => x.id === `pending:${action.id}`);
          if (placeholder) URL.revokeObjectURL(placeholder.url);
          return m.filter((x) => x.id !== `pending:${action.id}`);
        });
      }
      setError(message);
    },
  });

  // Leaving for the job: EN_ROUTE, and the client is emailed that the crew
  // is on the way. The phone's position goes with it (if it gives one in a
  // few seconds) so that email can carry an ETA.
  async function startDriving() {
    setBusy('drive');
    setError('');
    const at = await currentPosition();
    const body = at ?? {};
    try {
      const res = await fetch(`/api/crew/jobs/${props.job.id}/en-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      if (!res.ok) return setError(data.error || 'Could not start driving.');
      setStatus('EN_ROUTE');
    } catch (err) {
      setBusy(null);
      if (!isNetworkError(err) || !offlineQueueSupported()) return setError('Could not start driving.');
      try {
        await enqueueAction({ kind: 'JOB_STATUS', jobId: props.job.id, action: 'en-route', body });
      } catch {
        return setError("Couldn't save this on your phone — try again, or free up some storage.");
      }
      offline.refreshPendingCount();
      setStatus('EN_ROUTE');
    }
  }

  async function start() {
    if (notesBlockStart) return setError('Please review the cleaner notes below first.');
    setBusy('start');
    setError('');
    const body = { acknowledgedNotes: notesAcknowledged };
    try {
      const res = await fetch(`/api/crew/jobs/${props.job.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      if (!res.ok) return setError(data.error || 'Could not start the job.');
      setStatus('IN_PROGRESS');
      setStartedLabel(
        new Date(data.startedAt ?? Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      );
    } catch (err) {
      setBusy(null);
      if (!isNetworkError(err) || !offlineQueueSupported()) return setError('Could not start the job.');
      try {
        await enqueueAction({ kind: 'JOB_STATUS', jobId: props.job.id, action: 'start', body });
      } catch {
        return setError("Couldn't save this on your phone — try again, or free up some storage.");
      }
      offline.refreshPendingCount();
      setStatus('IN_PROGRESS');
      setStartedLabel(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    }
  }

  async function add(itemId: string, phase: Phase, kind: Kind, files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const key = `${Date.now()}-${Math.random()}`;
      setUploads((u) => [...u, { key, itemId, phase, kind, progress: 0 }]);
      setError('');
      try {
        const data = await uploadMedia({
          jobId: props.job.id,
          itemId,
          phase,
          kind,
          file,
          onProgress: (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))),
        });
        if (data.media) setMedia((m) => [...m, data.media]);
        applyItem(data.item);
      } catch (err) {
        if (isNetworkError(err) && offlineQueueSupported()) {
          // No signal right now — keep the file itself (not just a
          // reference to it) in IndexedDB so it survives even if the
          // tab is closed before the connection comes back, and show
          // the real photo/video immediately via a local preview URL so
          // the crew can see it was actually captured.
          try {
            const queued = await enqueueAction({
              kind: 'MEDIA',
              jobId: props.job.id,
              itemId,
              phase,
              mediaKind: kind,
              fileBlob: file,
              fileName: file.name,
              fileType: file.type,
            });
            setMedia((m) => [...m, { id: `pending:${queued.id}`, itemId, phase, kind, url: URL.createObjectURL(file), createdAt: new Date().toISOString() }]);
            offline.refreshPendingCount();
          } catch {
            // Likely IndexedDB storage full — a video can be tens of MB.
            setError("Couldn't save this on your phone (storage may be full) — try a photo instead, or free up space.");
          }
        } else {
          setError((err as Error).message);
        }
      } finally {
        setUploads((u) => u.filter((x) => x.key !== key));
      }
    }
  }

  async function remove(m: CrewMedia) {
    if (!confirm(`Remove this ${m.kind === 'VIDEO' ? 'video' : 'photo'}?`)) return;
    if (m.id.startsWith('pending:')) {
      // Still queued, not yet uploaded anywhere — just drop it locally.
      await removePendingAction(m.id.slice('pending:'.length));
      URL.revokeObjectURL(m.url);
      setMedia((all) => all.filter((x) => x.id !== m.id));
      offline.refreshPendingCount();
      return;
    }
    const res = await fetch(`/api/crew/jobs/${props.job.id}/media/${m.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || 'Could not remove it.');
    setMedia((all) => all.filter((x) => x.id !== m.id));
    applyItem(data.item);
  }

  async function updatePolicy(patch: Partial<PhotoPolicy>) {
    setPolicyBusy(true);
    setError('');
    const res = await fetch(`/api/admin/jobs/${props.job.id}/photo-policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    setPolicyBusy(false);
    if (!res.ok) return setError(data.error || 'Could not update photo settings.');
    setPolicy({ requireBeforePhoto: data.job.requireBeforePhoto, noPhotosNeeded: data.job.noPhotosNeeded });
    setItems(data.items.map((i: any) => ({ id: i.id, roomName: i.roomName, taskDetail: i.taskDetail, status: i.status, skipReason: i.skipReason })));
  }

  async function markDone(itemId: string, done: boolean) {
    const action = done ? 'done' : 'undone';
    const form = new FormData();
    form.append('kind', action);
    try {
      const res = await fetch(`/api/crew/jobs/${props.job.id}/items/${itemId}`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'Could not update the room.');
      applyItem(data.item);
    } catch (err) {
      if (!isNetworkError(err) || !offlineQueueSupported()) return setError('Could not update the room.');
      try {
        await enqueueAction({ kind: 'CHECKLIST', jobId: props.job.id, itemId, action });
      } catch {
        return setError("Couldn't save this on your phone — try again, or free up some storage.");
      }
      offline.refreshPendingCount();
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: done ? 'COMPLETE' : 'PENDING' } : i)));
    }
  }

  async function skip(itemId: string, reason: string | null) {
    const action = reason ? 'skip' : 'unskip';
    const form = new FormData();
    form.append('kind', action);
    if (reason) form.append('skipReason', reason);
    try {
      const res = await fetch(`/api/crew/jobs/${props.job.id}/items/${itemId}`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'Could not update the room.');
      applyItem(data.item);
    } catch (err) {
      if (!isNetworkError(err) || !offlineQueueSupported()) return setError('Could not update the room.');
      try {
        await enqueueAction({ kind: 'CHECKLIST', jobId: props.job.id, itemId, action, skipReason: reason ?? undefined });
      } catch {
        return setError("Couldn't save this on your phone — try again, or free up some storage.");
      }
      offline.refreshPendingCount();
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: reason ? 'SKIPPED' : 'PENDING', skipReason: reason } : i)));
    }
  }

  async function finish() {
    setBusy('finish');
    setError('');
    try {
      const res = await fetch(`/api/crew/jobs/${props.job.id}/complete`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      if (!res.ok) return setError(data.error || 'Could not finish the job.');
      setStatus('COMPLETE');
      setFinished({ invoiceId: data.invoiceId ?? null });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      router.refresh();
    } catch (err) {
      setBusy(null);
      if (!isNetworkError(err) || !offlineQueueSupported()) return setError('Could not finish the job.');
      // Queued behind any not-yet-synced room/photo updates, so it only
      // actually completes on the server once those land first.
      try {
        await enqueueAction({ kind: 'JOB_STATUS', jobId: props.job.id, action: 'complete', body: {} });
      } catch {
        return setError("Couldn't save this on your phone — try again, or free up some storage.");
      }
      offline.refreshPendingCount();
      setStatus('COMPLETE');
      setFinished({ invoiceId: null });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const address = props.addressLabel;
  const directionLinks = address
    ? [
        { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` },
        { label: 'Apple Maps', href: `https://maps.apple.com/?q=${encodeURIComponent(address)}` },
        { label: 'Waze', href: `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes` },
      ]
    : [];

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the sheet still shows the address to copy by hand.
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/crew" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> All jobs
      </Link>

      <OfflineBanner isOnline={offline.isOnline} pendingCount={offline.pendingCount} syncing={offline.syncing} onSyncNow={offline.flush} />

      {/* Who, where, when — with the three things a crew does from the driveway. */}
      <section className="card space-y-4">
        <div>
          <p className="eyebrow">{props.serviceLabel}</p>
          <h1 className="mt-1 text-2xl font-bold">{props.client.name}</h1>
          <p className="mt-1 text-slate">{props.whenLabel}</p>
          {props.addressLabel && <p className="text-slate">{props.addressLabel}</p>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {address ? (
            <button type="button" onClick={() => setShowDirections(true)} className="quick-action">
              <Icon d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              Directions
            </button>
          ) : (
            <span className="quick-action opacity-40">No address</span>
          )}
          {props.client.phone ? (
            <>
              <a href={`tel:${props.client.phone}`} className="quick-action">
                <Icon d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
                Call
              </a>
              <a href={`sms:${props.client.phone}`} className="quick-action">
                <Icon d="M4 5h16v11H8l-4 4V5Z" />
                Text
              </a>
            </>
          ) : (
            <span className="quick-action col-span-2 opacity-40">No phone on file</span>
          )}
        </div>
      </section>

      <section className="card">
        <JourneyRail steps={steps} />
      </section>

      {props.isAdmin && status !== 'COMPLETE' && (
        <section className="card space-y-3">
          <h2 className="text-sm font-bold text-ink">Photo requirements for this job</h2>
          <label className="flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={policy.requireBeforePhoto}
              disabled={policy.noPhotosNeeded || policyBusy}
              onChange={(e) => updatePolicy({ requireBeforePhoto: e.target.checked })}
            />
            Require a before photo for each room
          </label>
          <label className="flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={policy.noPhotosNeeded}
              disabled={policyBusy}
              onChange={(e) => updatePolicy({ noPhotosNeeded: e.target.checked })}
            />
            No pictures needed for this job
          </label>
        </section>
      )}

      {(finished || status === 'COMPLETE') && (
        <section className="card border-green/30 bg-emerald-50">
          <h2 className="text-lg font-bold text-green">Job complete</h2>
          <p className="mt-1 text-slate">
            {finished
              ? 'The client has been emailed their before-and-after photos, and the invoice is drafted for the office to review.'
              : `Finished${props.job.completedLabel ? ` at ${props.job.completedLabel}` : ''}. Photos are locked.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/crew" className="btn-primary btn-sm">
              Next job
            </Link>
            {props.isAdmin && finished?.invoiceId && (
              <Link href={`/admin/invoices/${finished.invoiceId}`} className="btn-secondary btn-sm">
                Review invoice
              </Link>
            )}
            <Link href={`/account/jobs/${props.job.id}`} className="btn-secondary btn-sm">
              See what the client sees
            </Link>
          </div>
        </section>
      )}

      {!props.canLead && (status === 'PENDING' || status === 'EN_ROUTE') && (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
          {status === 'EN_ROUTE' ? (
            <>Your Team Lead is driving over and sharing the trip with the client.</>
          ) : (
            <>
              Your <strong>Team Lead</strong> starts the trip and the job. Once they have, you can add photos here.
            </>
          )}
        </p>
      )}

      {hasCleanerNotes && status !== 'COMPLETE' && (
        <section className="card border-gold/50 bg-gold/5 space-y-3">
          <div className="flex items-center gap-2">
            <Icon d="M12 9v4m0 4h.01M10.3 3.9 2.7 17.5a1.5 1.5 0 0 0 1.3 2.3h16a1.5 1.5 0 0 0 1.3-2.3L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z" />
            <h2 className="font-bold text-ink">Cleaner needs to know</h2>
          </div>
          {props.cleanerNotes && <p className="whitespace-pre-wrap text-sm text-ink">{props.cleanerNotes}</p>}
          {props.homeProfile && (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {props.homeProfile.pets && (
                <div>
                  <dt className="font-semibold text-bronze">Pets</dt>
                  <dd className="text-ink">{props.homeProfile.pets}</dd>
                </div>
              )}
              {props.homeProfile.parkingNotes && (
                <div>
                  <dt className="font-semibold text-bronze">Parking</dt>
                  <dd className="text-ink">{props.homeProfile.parkingNotes}</dd>
                </div>
              )}
              {props.homeProfile.allergyNotes && (
                <div>
                  <dt className="font-semibold text-bronze">Product allergies</dt>
                  <dd className="text-ink">{props.homeProfile.allergyNotes}</dd>
                </div>
              )}
              {props.homeProfile.doNotTouch && (
                <div>
                  <dt className="font-semibold text-bronze">Do not touch</dt>
                  <dd className="text-ink">{props.homeProfile.doNotTouch}</dd>
                </div>
              )}
              {props.homeProfile.entryCodeSet && (
                <div>
                  <dt className="font-semibold text-bronze">Entry / alarm code</dt>
                  <dd className="text-ink">
                    {props.homeProfile.entryCode ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="font-mono">{showEntryCode ? props.homeProfile.entryCode : '••••••'}</span>
                        <button type="button" onClick={() => setShowEntryCode((v) => !v)} className="text-xs font-semibold text-bronze underline">
                          {showEntryCode ? 'Hide' : 'Show'}
                        </button>
                      </span>
                    ) : (
                      <span className="text-muted">On file, but couldn't be decrypted — contact the office.</span>
                    )}
                  </dd>
                </div>
              )}
              {props.homeProfile.roomNotes.map((n) => (
                <div key={n.id}>
                  <dt className="font-semibold text-bronze">{n.roomName}</dt>
                  <dd className="text-ink">{n.notes}</dd>
                </div>
              ))}
            </dl>
          )}
          {notStarted && (
            <label className="flex items-start gap-2 text-sm font-semibold text-bronze">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={notesAcknowledged}
                onChange={(e) => setNotesAcknowledged(e.target.checked)}
              />
              I've read this
            </label>
          )}
        </section>
      )}

      {status === 'EN_ROUTE' && props.canLead && (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm text-bronze" aria-live="polite">
          {location === 'denied' ? (
            <>
              <strong>Location is blocked</strong> for this site, so the client can't see you on the map. Allow location in your browser settings, then
              reload this page. They've still been told you're on the way.
            </>
          ) : location === 'unavailable' ? (
            <>
              <strong>Can't get your location right now</strong>, so the client's map isn't updating — we'll keep trying. They've still been told
              you're on the way. On a phone, check Location is on. On a Mac, turn on your browser in System Settings → Privacy &amp; Security →
              Location Services.
              {locationDetail && <span className="mt-1 block text-xs opacity-80">Browser said: {locationDetail}</span>}
            </>
          ) : (
            <>
              <strong>The client has been told you're on the way</strong> and can follow you on a map. Keep this page open with the screen on while you
              drive. Tap <strong>I've arrived</strong> when you pull up.
            </>
          )}
        </p>
      )}

      {status === 'PENDING' && props.canLead && (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
          Tap <strong>Start driving</strong> when you leave — the client gets a heads-up and can follow you on a map.{' '}
          {policy.noPhotosNeeded ? (
            <>
              No pictures are needed for this job — just mark each room done as you finish it.
            </>
          ) : policy.requireBeforePhoto ? (
            <>
              On site, take a before photo of each room first, and an after photo when it's done.
            </>
          ) : (
            <>
              On site, take an after photo of each room when it's done — a before photo is optional.
            </>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {items.map((item, index) => (
          <RoomCard
            key={item.id}
            index={index}
            item={item}
            media={media.filter((m) => m.itemId === item.id)}
            uploads={uploads.filter((u) => u.itemId === item.id)}
            open={open}
            perPhase={props.perPhase}
            videoSeconds={props.videoSeconds}
            requireBeforePhoto={policy.requireBeforePhoto}
            noPhotosNeeded={policy.noPhotosNeeded}
            onAdd={(phase, kind, files) => add(item.id, phase, kind, files)}
            onRemove={remove}
            onSkip={(reason) => skip(item.id, reason)}
            onMarkDone={(done) => markDone(item.id, done)}
          />
        ))}
      </div>

      {status !== 'COMPLETE' && (props.canLead || status === 'IN_PROGRESS') && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-auto max-w-xl px-5 py-3 md:max-w-3xl">
            {status === 'PENDING' ? (
              <div className="flex gap-2">
                <button onClick={startDriving} disabled={busy !== null} className="btn-primary flex-1">
                  {busy === 'drive' ? 'Letting the client know…' : 'Start driving'}
                </button>
                <button onClick={start} disabled={busy !== null || notesBlockStart} className="btn-secondary">
                  {busy === 'start' ? 'Starting…' : 'Already here'}
                </button>
              </div>
            ) : status === 'EN_ROUTE' ? (
              <>
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate">
                  <span className={`h-2 w-2 rounded-full ${location === 'sharing' ? 'bg-green' : 'bg-amber-500'}`} aria-hidden="true" />
                  {location === 'sharing' ? 'Sharing your location with the client' : location === 'locating' ? 'Finding your location…' : 'Location not shared'}
                </p>
                <button onClick={start} disabled={busy === 'start' || notesBlockStart} className="btn-primary w-full">
                  {busy === 'start' ? 'Starting…' : notesBlockStart ? 'Review cleaner notes above first' : "I've arrived — start job"}
                </button>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate">
                  <span>
                    {done} of {items.length} rooms documented
                  </span>
                  {uploads.length > 0 && <span className="text-bronze">Uploading {uploads.length}…</span>}
                </div>
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="journey-fill h-full rounded-full bg-gold" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
                </div>
                {props.canLead ? (
                  <button onClick={finish} disabled={!allDone || busy === 'finish' || uploads.length > 0} className="btn-dark w-full">
                    {busy === 'finish'
                      ? 'Finishing…'
                      : allDone
                      ? 'Finish job and notify client'
                      : `${items.length - done} room${items.length - done === 1 ? '' : 's'} to go`}
                  </button>
                ) : (
                  <p className="text-center text-sm font-semibold text-slate">
                    {allDone ? 'All rooms done — your Team Lead will finish the job.' : `${items.length - done} room${items.length - done === 1 ? '' : 's'} to go`}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showDirections && address && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowDirections(false)}>
          <div
            className="w-full max-w-xl rounded-t-2xl border-t border-line bg-white p-5"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="eyebrow">Get directions</p>
            <p className="mt-1 mb-4 text-sm text-slate">{address}</p>
            <div className="space-y-2">
              {directionLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowDirections(false)}
                  className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:border-gold hover:bg-cream/60"
                >
                  {link.label}
                  <span aria-hidden="true" className="text-muted">↗</span>
                </a>
              ))}
              <button
                type="button"
                onClick={copyAddress}
                className="flex w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:border-gold hover:bg-cream/60"
              >
                {addressCopied ? 'Address copied' : 'Copy address'}
              </button>
            </div>
            <button type="button" onClick={() => setShowDirections(false)} className="btn-secondary mt-4 w-full">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function mediaTimestampLabel(createdAt: string): string {
  return new Date(createdAt).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function RoomCard({
  index,
  item,
  media,
  uploads,
  open,
  perPhase,
  videoSeconds,
  requireBeforePhoto,
  noPhotosNeeded,
  onAdd,
  onRemove,
  onSkip,
  onMarkDone,
}: {
  index: number;
  item: CrewItem;
  media: CrewMedia[];
  uploads: Upload[];
  open: boolean;
  perPhase: number;
  videoSeconds: number;
  requireBeforePhoto: boolean;
  noPhotosNeeded: boolean;
  onAdd: (phase: Phase, kind: Kind, files: FileList | null) => void;
  onRemove: (m: CrewMedia) => void;
  onSkip: (reason: string | null) => void;
  onMarkDone: (done: boolean) => void;
}) {
  const [showSkip, setShowSkip] = useState(false);
  const [reason, setReason] = useState('');
  const tone =
    item.status === 'COMPLETE' ? 'border-green/40' : item.status === 'SKIPPED' ? 'border-amber-300' : 'border-line';

  return (
    <article className={`card border-2 p-5 ${tone}`} aria-labelledby={`room-${item.id}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              item.status === 'COMPLETE' ? 'bg-green text-white' : item.status === 'SKIPPED' ? 'bg-amber-200 text-amber-900' : 'bg-surface text-slate'
            }`}
            aria-hidden="true"
          >
            {item.status === 'COMPLETE' ? '✓' : index + 1}
          </span>
          <div>
            <h2 id={`room-${item.id}`} className="text-lg font-bold">
              {item.roomName}
            </h2>
            {item.taskDetail && <p className="text-sm text-muted">{item.taskDetail}</p>}
          </div>
        </div>
        <span
          className={`pill shrink-0 ${
            item.status === 'COMPLETE' ? 'bg-emerald-100 text-green' : item.status === 'SKIPPED' ? 'bg-amber-100 text-amber-800' : 'bg-surface text-muted'
          }`}
        >
          {item.status === 'COMPLETE' ? 'Done' : item.status === 'SKIPPED' ? 'Skipped' : 'To do'}
        </span>
      </header>

      {item.status === 'SKIPPED' ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Skipped: {item.skipReason}
          {open && (
            <button onClick={() => onSkip(null)} className="ml-2 font-semibold underline">
              Undo
            </button>
          )}
        </div>
      ) : noPhotosNeeded ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
          <span className="text-sm text-slate">
            {item.status === 'COMPLETE' ? 'Marked done — no pictures needed.' : 'No pictures needed here. Mark it done when finished.'}
          </span>
          {open &&
            (item.status === 'COMPLETE' ? (
              <button onClick={() => onMarkDone(false)} className="shrink-0 text-sm font-semibold underline">
                Undo
              </button>
            ) : (
              <button onClick={() => onMarkDone(true)} className="btn-dark btn-sm shrink-0">
                Mark done
              </button>
            ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(['BEFORE', 'AFTER'] as Phase[]).map((phase) => (
            <PhaseColumn
              key={phase}
              phase={phase}
              media={media.filter((m) => m.phase === phase)}
              uploads={uploads.filter((u) => u.phase === phase)}
              open={open}
              perPhase={perPhase}
              videoSeconds={videoSeconds}
              required={phase === 'AFTER' || requireBeforePhoto}
              onAdd={(kind, files) => onAdd(phase, kind, files)}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}

      {open && item.status === 'PENDING' && (
        <div className="mt-4">
          {!showSkip ? (
            <button onClick={() => setShowSkip(true)} className="text-sm font-medium text-muted underline-offset-2 hover:text-slate hover:underline">
              Can't do this room?
            </button>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim()) onSkip(reason.trim());
              }}
            >
              <input className="input py-2 text-sm" placeholder="Reason, e.g. door locked" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <button type="submit" className="btn-dark btn-sm shrink-0" disabled={!reason.trim()}>
                Skip room
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}

function PhaseColumn({
  phase,
  media,
  uploads,
  open,
  perPhase,
  videoSeconds,
  required,
  onAdd,
  onRemove,
}: {
  phase: Phase;
  media: CrewMedia[];
  uploads: Upload[];
  open: boolean;
  perPhase: number;
  videoSeconds: number;
  required: boolean;
  onAdd: (kind: Kind, files: FileList | null) => void;
  onRemove: (m: CrewMedia) => void;
}) {
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const hasPhoto = media.some((m) => m.kind === 'PHOTO');
  const full = media.length + uploads.length >= perPhase;
  const label = phase === 'BEFORE' ? 'Before' : 'After';

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">{label}</h3>
        <span className={`text-xs font-semibold ${hasPhoto ? 'text-green' : 'text-muted'}`}>
          {hasPhoto ? 'Photo added' : required ? 'Photo needed' : 'Optional'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {media.map((m) => (
          <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-surface">
            {m.kind === 'PHOTO' ? (
              <img src={m.url} alt={`${label} photo`} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <>
                <video src={`${m.url}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-white">▶</span>
                </span>
                {/* Photos get their timestamp burned into the image itself (lib/clientUpload.ts); video can't be stamped client-side, so it shows one here instead. */}
                <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {mediaTimestampLabel(m.createdAt)}
                </span>
              </>
            )}
            {open && (
              <button
                onClick={() => onRemove(m)}
                aria-label={`Remove ${m.kind === 'VIDEO' ? 'video' : 'photo'}`}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink/75 text-sm text-white"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {uploads.map((u) => (
          <div key={u.key} className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-gold/50 bg-cream/50 px-2">
            <span className="text-[11px] font-semibold text-bronze">{u.kind === 'VIDEO' ? 'Video' : 'Photo'}</span>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white">
              <div className="h-full bg-gold transition-all" style={{ width: `${Math.max(8, u.progress * 100)}%` }} />
            </div>
          </div>
        ))}
        {open && !full && (
          <>
            <button type="button" onClick={() => photoInput.current?.click()} className="media-add">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path d="M4 8h3l2-3h6l2 3h3v11H4V8Z" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              Photo
            </button>
            <button type="button" onClick={() => videoInput.current?.click()} className="media-add">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <rect x="3" y="6" width="13" height="12" rx="2" />
                <path d="m16 10 5-3v10l-5-3" strokeLinejoin="round" />
              </svg>
              Video
            </button>
          </>
        )}
        {!open && media.length === 0 && uploads.length === 0 && (
          <div className="col-span-3 flex aspect-[3/1] items-center justify-center rounded-xl border-2 border-dashed border-line text-xs text-muted">
            No {label.toLowerCase()} photos
          </div>
        )}
      </div>

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          onAdd('PHOTO', e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onAdd('VIDEO', e.target.files);
          e.target.value = '';
        }}
      />
      {open && !full && <p className="mt-1.5 text-[11px] text-muted">Videos up to {videoSeconds} seconds.</p>}
    </div>
  );
}
