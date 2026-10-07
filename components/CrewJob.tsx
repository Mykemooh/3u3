'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { rich } from '@/lib/i18n/rich';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CrewBand from '@/components/crew/CrewBand';
import CrewStatus, { type CrewJobState } from '@/components/crew/CrewStatus';
import { uploadMedia, type Kind, type Phase } from '@/lib/clientUpload';
import { useLocationReporter, currentPosition } from '@/lib/useLocationReporter';
import { useOfflineSync, registerCrewServiceWorker, isNetworkError } from '@/lib/offlineSync';
import { enqueueAction, removePendingAction, offlineQueueSupported } from '@/lib/offlineQueue';
import OfflineBanner from '@/components/crew/OfflineBanner';
import CrewDirectionsMap from '@/components/crew/CrewDirectionsMap';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { intlLocale, type Locale } from '@/lib/i18n';
import { crewMessages } from '@/lib/i18n/messages/crew';

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
  /** Per-room count-up timer (lib/jobs.ts startRoom). ISO strings. */
  startedAt?: string | null;
  completedAt?: string | null;
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
  /** A note the client left on this one visit ("dog is out back today"). */
  visitNote?: string | null;
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
  const t = useT(crewMessages);
  const locale = useLocale();
  const clock = (d: string | number | Date) => new Date(d).toLocaleTimeString(intlLocale(locale), { hour: 'numeric', minute: '2-digit' });
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
        label: t('jobStepStart'),
        state: notStarted ? ('current' as const) : ('done' as const),
        detail: status === 'EN_ROUTE' ? t('statusDriving') : startedLabel ?? undefined,
      },
      {
        label: t('jobStepRooms'),
        state: notStarted ? ('todo' as const) : status === 'COMPLETE' || allDone ? ('done' as const) : ('current' as const),
        detail: `${done}/${items.length}`,
      },
      {
        label: t('jobStepFinish'),
        state: status === 'COMPLETE' ? ('done' as const) : allDone && open ? ('current' as const) : ('todo' as const),
        detail: props.job.completedLabel ?? undefined,
      },
    ],
    [status, notStarted, startedLabel, done, items.length, allDone, open, props.job.completedLabel, t],
  );

  function applyItem(updated: CrewItem | null | undefined) {
    if (!updated) return;
    const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
    setItems((prev) =>
      prev.map((i) =>
        i.id === updated.id
          ? {
              ...i,
              status: updated.status,
              skipReason: updated.skipReason,
              startedAt: updated.startedAt !== undefined ? iso(updated.startedAt) : i.startedAt,
              completedAt: updated.completedAt !== undefined ? iso(updated.completedAt) : i.completedAt,
            }
          : i,
      ),
    );
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
        setStartedLabel(clock(data.startedAt ?? Date.now()));
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
      if (!res.ok) return setError(data.error || t('jobErrStartDriving'));
      setStatus('EN_ROUTE');
    } catch (err) {
      setBusy(null);
      if (!isNetworkError(err) || !offlineQueueSupported()) return setError(t('jobErrStartDriving'));
      try {
        await enqueueAction({ kind: 'JOB_STATUS', jobId: props.job.id, action: 'en-route', body });
      } catch {
        return setError(t('jobErrSaveOffline'));
      }
      offline.refreshPendingCount();
      setStatus('EN_ROUTE');
    }
  }

  async function start() {
    if (notesBlockStart) return setError(t('jobErrReviewNotes'));
    setBusy('start');
    setError('');
    // The clock-in stamp: where the phone is when the team starts (a few
    // seconds at most; starting never waits on it).
    const position = await currentPosition(4000);
    const body = { acknowledgedNotes: notesAcknowledged, position };
    try {
      const res = await fetch(`/api/crew/jobs/${props.job.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      if (!res.ok) return setError(data.error || t('jobErrStart'));
      setStatus('IN_PROGRESS');
      setStartedLabel(clock(data.startedAt ?? Date.now()));
    } catch (err) {
      setBusy(null);
      if (!isNetworkError(err) || !offlineQueueSupported()) return setError(t('jobErrStart'));
      try {
        await enqueueAction({ kind: 'JOB_STATUS', jobId: props.job.id, action: 'start', body });
      } catch {
        return setError(t('jobErrSaveOffline'));
      }
      offline.refreshPendingCount();
      setStatus('IN_PROGRESS');
      setStartedLabel(clock(Date.now()));
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
            setError(t('jobErrSaveMediaOffline'));
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
    if (!confirm(t(m.kind === 'VIDEO' ? 'jobConfirmRemoveVideo' : 'jobConfirmRemovePhoto'))) return;
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
    if (!res.ok) return setError(data.error || t('jobErrRemove'));
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
    if (!res.ok) return setError(data.error || t('jobErrPolicy'));
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
      if (!res.ok) return setError(data.error || t('jobErrRoom'));
      applyItem(data.item);
    } catch (err) {
      if (!isNetworkError(err) || !offlineQueueSupported()) return setError(t('jobErrRoom'));
      try {
        await enqueueAction({ kind: 'CHECKLIST', jobId: props.job.id, itemId, action });
      } catch {
        return setError(t('jobErrSaveOffline'));
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
      if (!res.ok) return setError(data.error || t('jobErrRoom'));
      applyItem(data.item);
    } catch (err) {
      if (!isNetworkError(err) || !offlineQueueSupported()) return setError(t('jobErrRoom'));
      try {
        await enqueueAction({ kind: 'CHECKLIST', jobId: props.job.id, itemId, action, skipReason: reason ?? undefined });
      } catch {
        return setError(t('jobErrSaveOffline'));
      }
      offline.refreshPendingCount();
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: reason ? 'SKIPPED' : 'PENDING', skipReason: reason } : i)));
    }
  }

  async function startRoomTimer(itemId: string) {
    setItems((prev) => prev.map((i) => (i.id === itemId && !i.startedAt ? { ...i, startedAt: new Date().toISOString() } : i)));
    const form = new FormData();
    form.append('kind', 'start');
    try {
      const res = await fetch(`/api/crew/jobs/${props.job.id}/items/${itemId}`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) applyItem(data.item);
    } catch {
      // Offline: the first photo starts the timer on the server anyway.
    }
  }

  async function finish() {
    setBusy('finish');
    setError('');
    try {
      const position = await currentPosition(4000);
      const res = await fetch(`/api/crew/jobs/${props.job.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position }),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      if (!res.ok) return setError(data.error || t('jobErrFinish'));
      setStatus('COMPLETE');
      setFinished({ invoiceId: data.invoiceId ?? null });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      router.refresh();
    } catch (err) {
      setBusy(null);
      if (!isNetworkError(err) || !offlineQueueSupported()) return setError(t('jobErrFinish'));
      // Queued behind any not-yet-synced room/photo updates, so it only
      // actually completes on the server once those land first.
      try {
        await enqueueAction({ kind: 'JOB_STATUS', jobId: props.job.id, action: 'complete', body: {} });
      } catch {
        return setError(t('jobErrSaveOffline'));
      }
      offline.refreshPendingCount();
      setStatus('COMPLETE');
      setFinished({ invoiceId: null });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const address = props.addressLabel;

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

  const jobState: CrewJobState = status;
  const jobStateLabel =
    status === 'COMPLETE' ? t('statusDone') : status === 'IN_PROGRESS' ? t('statusInProgress') : status === 'EN_ROUTE' ? t('statusDriving') : t('statusNotStarted');
  // The room you're on: the first one not yet done or skipped.
  const currentRoomId = open ? items.find((i) => i.status === 'PENDING')?.id ?? null : null;
  const showDock = status !== 'COMPLETE';
  // Once the team is inside, the rooms matter more than the driveway: the header tightens up.
  const tight = status === 'IN_PROGRESS' || status === 'COMPLETE';
  const quick = tight ? 'crew-quick crew-quick-tight' : 'crew-quick';

  return (
    <div>
      {/* The black layer: who, where, when, where things stand, and the three things a crew does from the driveway. */}
      <CrewBand>
        <div className="flex items-center justify-between gap-3">
          <Link href="/crew" className="-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-[14px] font-semibold text-white/60 hover:text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 6-6 6 6 6" />
            </svg>
            {t('jobAllJobs')}
          </Link>
          <CrewStatus state={jobState} label={jobStateLabel} on="dark" />
        </div>
        <p className="mt-2 text-[13px] font-semibold text-white/55">{props.serviceLabel}</p>
        <h1 className={`mt-1 font-tc-display font-extrabold leading-[1.08] tracking-[-0.03em] text-white text-balance ${tight ? 'text-[24px] md:text-[30px]' : 'text-[30px] md:text-[36px]'}`}>{props.client.name}</h1>
        <p className="mt-2 text-[15px] font-medium tabular-nums text-white/80">{props.whenLabel}</p>
        {props.addressLabel && <p className="mt-0.5 text-[15px] text-white/60">{props.addressLabel}</p>}

        <div className={`grid grid-cols-3 gap-2 ${tight ? 'mt-4' : 'mt-5'}`}>
          {address ? (
            <button type="button" onClick={() => setShowDirections(true)} className={quick}>
              <Icon d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              {t('jobDirections')}
            </button>
          ) : (
            <span className={`${quick} opacity-40`}>{t('jobNoAddress')}</span>
          )}
          {props.client.phone ? (
            <>
              <a href={`tel:${props.client.phone}`} className={quick}>
                <Icon d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
                {t('jobCall')}
              </a>
              <a href={`sms:${props.client.phone}`} className={quick}>
                <Icon d="M4 5h16v11H8l-4 4V5Z" />
                {t('jobText')}
              </a>
            </>
          ) : (
            <span className={`${quick} col-span-2 opacity-40`}>{t('jobNoPhone')}</span>
          )}
        </div>

        <JobSteps steps={steps} roomsFraction={items.length ? done / items.length : 0} />
      </CrewBand>

      <div className="mt-5 space-y-4">
        <OfflineBanner isOnline={offline.isOnline} pendingCount={offline.pendingCount} syncing={offline.syncing} onSyncNow={offline.flush} />

        {error && (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[15px] font-medium text-red-800">
            {error}
          </p>
        )}

        {(finished || status === 'COMPLETE') && (
          <section className="rounded-2xl border border-emerald-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white" aria-hidden="true">
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.6}>
                  <path d="m5 10.5 3.2 3L15 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="font-tc-display text-[20px] font-extrabold tracking-[-0.015em] text-tc-900">{t('jobCompleteTitle')}</h2>
                <p className="mt-1 text-[15px] leading-relaxed text-tc-700">
                  {finished
                    ? t('jobCompleteJustNow')
                    : props.job.completedLabel
                    ? t('jobFinishedAt', { time: props.job.completedLabel })
                    : t('jobFinished')}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
              <Link href="/crew" className="btn-primary">
                {t('jobNextJob')}
              </Link>
              {props.isAdmin && finished?.invoiceId && (
                <Link href={`/admin/invoices/${finished.invoiceId}`} className="btn-secondary">
                  {t('jobReviewInvoice')}
                </Link>
              )}
              <Link href={`/account/jobs/${props.job.id}`} className="btn-secondary">
                {t('jobSeeClientView')}
              </Link>
            </div>
          </section>
        )}

        {!props.canLead && (status === 'PENDING' || status === 'EN_ROUTE') && (
          <Note>
            {status === 'EN_ROUTE' ? (
              <>{t('jobLeadDriving')}</>
            ) : (
              <>{rich(t('jobNotLeadPending'), { teamLead: <strong>{t('jobBoldTeamLead')}</strong>, arrived: <strong>{t('jobBoldArrived')}</strong> })}</>
            )}
          </Note>
        )}

        {status === 'EN_ROUTE' && props.canLead && (
          <Note tone={location === 'denied' || location === 'unavailable' ? 'warn' : 'info'} live>
            {location === 'denied' ? (
              <>{rich(t('jobLocDenied'), { bold: <strong>{t('jobLocDeniedBold')}</strong> })}</>
            ) : location === 'unavailable' ? (
              <>
                {rich(t('jobLocUnavailable'), { bold: <strong>{t('jobLocUnavailableBold')}</strong> })}
                {locationDetail && <span className="mt-1 block text-xs opacity-80">{t('jobBrowserSaid', { detail: locationDetail })}</span>}
              </>
            ) : (
              <>{rich(t('jobLocSharing'), { bold: <strong>{t('jobLocSharingBold')}</strong>, arrived: <strong>{t('jobBoldArrived')}</strong> })}</>
            )}
          </Note>
        )}

        {status === 'PENDING' && props.canLead && (
          <Note>
            {rich(t('jobLeadPending'), { startDriving: <strong>{t('jobStartDriving')}</strong> })}{' '}
            {policy.noPhotosNeeded ? t('jobTipNoPhotos') : policy.requireBeforePhoto ? t('jobTipBeforeAfter') : t('jobTipAfterOnly')}
          </Note>
        )}

        {props.visitNote && (
          <section className="rounded-2xl border border-tc-200 bg-white px-4 py-3.5">
            <p className="text-[13px] font-semibold text-tc-500">{t('jobVisitNote')}</p>
            <p className="mt-0.5 whitespace-pre-wrap text-[15px] text-tc-900">{props.visitNote}</p>
          </section>
        )}

        {hasCleanerNotes && status !== 'COMPLETE' && (
          <section className="overflow-hidden rounded-2xl border border-amber-300 bg-[#FFFBEB]">
            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-amber-800">
                <Icon d="M12 9v4m0 4h.01M10.3 3.9 2.7 17.5a1.5 1.5 0 0 0 1.3 2.3h16a1.5 1.5 0 0 0 1.3-2.3L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z" />
                <h2 className="font-tc-display text-[17px] font-bold text-tc-900">{t('jobNotesTitle')}</h2>
              </div>
              {props.cleanerNotes && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-tc-900">{props.cleanerNotes}</p>}
              {props.homeProfile && (
                <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
                  {props.homeProfile.pets && (
                    <div>
                      <dt className="text-[13px] font-semibold text-amber-900">{t('jobPets')}</dt>
                      <dd className="text-tc-900">{props.homeProfile.pets}</dd>
                    </div>
                  )}
                  {props.homeProfile.parkingNotes && (
                    <div>
                      <dt className="text-[13px] font-semibold text-amber-900">{t('jobParking')}</dt>
                      <dd className="text-tc-900">{props.homeProfile.parkingNotes}</dd>
                    </div>
                  )}
                  {props.homeProfile.allergyNotes && (
                    <div>
                      <dt className="text-[13px] font-semibold text-amber-900">{t('jobAllergies')}</dt>
                      <dd className="text-tc-900">{props.homeProfile.allergyNotes}</dd>
                    </div>
                  )}
                  {props.homeProfile.doNotTouch && (
                    <div>
                      <dt className="text-[13px] font-semibold text-amber-900">{t('jobDoNotTouch')}</dt>
                      <dd className="text-tc-900">{props.homeProfile.doNotTouch}</dd>
                    </div>
                  )}
                  {props.homeProfile.entryCodeSet && (
                    <div>
                      <dt className="text-[13px] font-semibold text-amber-900">{t('jobEntryCode')}</dt>
                      <dd className="text-tc-900">
                        {props.homeProfile.entryCode ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="font-mono text-[17px] tracking-wider">{showEntryCode ? props.homeProfile.entryCode : '••••••'}</span>
                            <button
                              type="button"
                              onClick={() => setShowEntryCode((v) => !v)}
                              className="min-h-[36px] rounded-lg border border-amber-300 bg-white px-3 text-[13px] font-semibold text-tc-900"
                            >
                              {showEntryCode ? t('jobHide') : t('jobShow')}
                            </button>
                          </span>
                        ) : (
                          <span className="text-tc-500">{t('jobEntryCodeError')}</span>
                        )}
                      </dd>
                    </div>
                  )}
                  {props.homeProfile.roomNotes.map((n) => (
                    <div key={n.id}>
                      <dt className="text-[13px] font-semibold text-amber-900">{n.roomName}</dt>
                      <dd className="text-tc-900">{n.notes}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {notStarted && (
              <label
                className={`flex min-h-[56px] cursor-pointer items-center gap-3 border-t px-4 text-[15px] font-semibold sm:px-5 ${
                  notesAcknowledged ? 'border-amber-200 bg-white text-tc-900' : 'border-amber-300 bg-amber-100/70 text-amber-950'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0"
                  checked={notesAcknowledged}
                  onChange={(e) => setNotesAcknowledged(e.target.checked)}
                />
                {t('jobNotesRead')}
              </label>
            )}
          </section>
        )}

        {props.isAdmin && status !== 'COMPLETE' && (
          <section className="space-y-3 rounded-2xl border border-tc-200 bg-white p-4 sm:p-5">
            <h2 className="text-[15px] font-bold text-tc-900">{t('jobPhotoReqTitle')}</h2>
            <label className="flex min-h-[40px] items-center gap-3 text-[15px] text-tc-700">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={policy.requireBeforePhoto}
                disabled={policy.noPhotosNeeded || policyBusy}
                onChange={(e) => updatePolicy({ requireBeforePhoto: e.target.checked })}
              />
              {t('jobRequireBefore')}
            </label>
            <label className="flex min-h-[40px] items-center gap-3 text-[15px] text-tc-700">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={policy.noPhotosNeeded}
                disabled={policyBusy}
                onChange={(e) => updatePolicy({ noPhotosNeeded: e.target.checked })}
              />
              {t('jobNoPhotosNeeded')}
            </label>
          </section>
        )}

        <section aria-labelledby="rooms-heading" className="pt-2">
          <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
            <h2 id="rooms-heading" className="font-tc-display text-[19px] font-bold tracking-[-0.015em] text-tc-900">
              {t('jobStepRooms')}
            </h2>
            <span className="text-[14px] font-semibold tabular-nums text-tc-500">{t('jobRoomsProgress', { done, total: items.length })}</span>
          </div>
          {notStarted ? (
            // Before the job starts there's nothing to photograph yet: the rooms read as the plan.
            <>
              <p className="mb-3 px-1 text-[14px] text-tc-500">{t('jobRoomsPlan')}</p>
              <ol className="divide-y divide-tc-200 overflow-hidden rounded-2xl border border-tc-200 bg-white">
                {items.map((item, index) => (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-3.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tc-100 font-tc-display text-[13px] font-bold text-tc-700" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-tc-900">{item.roomName}</span>
                      {item.taskDetail && <span className="block text-[14px] leading-snug text-tc-500">{item.taskDetail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <RoomCard
                  key={item.id}
                  index={index}
                  item={item}
                  current={item.id === currentRoomId}
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
                  onStartTimer={() => startRoomTimer(item.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Room to scroll the last room clear of the action bar, the tab bar and Tex. */}
        {showDock && <div className="h-40 md:h-24" aria-hidden="true" />}
      </div>

      {/* The one thing to do next, in thumb reach: sits on top of the phone tab bar, at the bottom on desktop. */}
      {showDock && (
        <div
          data-tex-avoid=""
          className="tc-dark fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 rounded-t-[22px] bg-tc-black shadow-[0_-12px_32px_-12px_rgba(11,15,20,0.45)] md:bottom-0 md:pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto max-w-xl px-4 pb-3 pt-3.5 sm:px-5 md:max-w-3xl md:pb-4">
            {status === 'PENDING' && props.canLead ? (
              <div className="flex gap-2">
                <button onClick={startDriving} disabled={busy !== null} className="tc-btn-lime crew-dock-btn flex-1">
                  {busy === 'drive' ? t('jobLettingClientKnow') : t('jobStartDriving')}
                </button>
                <button onClick={start} disabled={busy !== null || notesBlockStart} className="tc-btn-ghost-dark crew-dock-btn shrink-0 !px-4">
                  {busy === 'start' ? t('jobStarting') : t('jobAlreadyHere')}
                </button>
              </div>
            ) : status === 'PENDING' || status === 'EN_ROUTE' ? (
              <>
                {status === 'EN_ROUTE' && props.canLead && (
                  <p className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-white/70">
                    <span className={`h-2 w-2 rounded-full ${location === 'sharing' ? 'bg-tc-lime' : 'bg-amber-400'}`} aria-hidden="true" />
                    {location === 'sharing' ? t('jobLocSharingShort') : location === 'locating' ? t('jobLocating') : t('jobLocNotShared')}
                  </p>
                )}
                <button onClick={start} disabled={busy === 'start' || notesBlockStart} className="tc-btn-lime crew-dock-btn w-full">
                  {busy === 'start' ? t('jobStarting') : notesBlockStart ? t('jobReviewNotesFirst') : t('jobArrivedStart')}
                </button>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between gap-3 text-[13px] font-semibold text-white/70">
                  <span className="tabular-nums">{t('jobRoomsDocumented', { done, total: items.length })}</span>
                  {uploads.length > 0 && <span className="text-tc-lime">{t('jobUploading', { count: uploads.length })}</span>}
                </div>
                <div className="mb-3 flex gap-1" aria-hidden="true">
                  {items.map((i) => (
                    <span
                      key={i.id}
                      className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                        i.status === 'COMPLETE' ? 'bg-tc-lime' : i.status === 'SKIPPED' ? 'bg-amber-400' : 'bg-white/15'
                      }`}
                    />
                  ))}
                </div>
                {props.canLead ? (
                  <button onClick={finish} disabled={!allDone || busy === 'finish' || uploads.length > 0} className="tc-btn-lime crew-dock-btn w-full">
                    {busy === 'finish'
                      ? t('jobFinishing')
                      : allDone
                      ? t('jobFinishNotify')
                      : t(items.length - done === 1 ? 'jobRoomsToGoOne' : 'jobRoomsToGoMany', { count: items.length - done })}
                  </button>
                ) : (
                  <p className="flex min-h-[48px] items-center justify-center text-center text-[15px] font-semibold text-white/80">
                    {allDone ? t('jobAllDoneLeadFinishes') : t(items.length - done === 1 ? 'jobRoomsToGoOne' : 'jobRoomsToGoMany', { count: items.length - done })}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showDirections && address && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-tc-black/50" onClick={() => setShowDirections(false)}>
          <div
            className="max-h-[92vh] w-full max-w-xl animate-tc-rise overflow-y-auto rounded-t-[24px] bg-white px-4 pb-5 pt-2.5 sm:px-5"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto block h-1 w-10 rounded-full bg-tc-300" aria-hidden="true" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <h2 className="font-tc-display text-[20px] font-extrabold tracking-[-0.015em] text-tc-900">{t('jobDirections')}</h2>
              <button
                type="button"
                onClick={() => setShowDirections(false)}
                aria-label={t('jobClose')}
                className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-tc-700 hover:bg-tc-100"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="mt-3">
              <CrewDirectionsMap jobId={props.job.id} addressLabel={address} />
            </div>
            {/* In-app directions only (owner, Oct 2026): no hand-off to Google/Apple Maps or Waze. */}
            <div className="mt-3">
              <button
                type="button"
                onClick={copyAddress}
                className="flex min-h-[52px] w-full items-center justify-between rounded-xl border border-tc-200 bg-white px-4 text-[15px] font-semibold text-tc-900 transition hover:border-tc-black"
              >
                {addressCopied ? t('jobAddressCopied') : t('jobCopyAddress')}
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-tc-500" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
                </svg>
              </button>
            </div>
            <button type="button" onClick={() => setShowDirections(false)} className="btn-secondary mt-3 w-full">
              {t('jobClose')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A plain note on the light layer — tips, location status, who starts the trip. */
function Note({ children, tone = 'info', live }: { children: React.ReactNode; tone?: 'info' | 'warn'; live?: boolean }) {
  return (
    <p
      aria-live={live ? 'polite' : undefined}
      className={`rounded-2xl border px-4 py-3.5 text-[15px] leading-relaxed ${
        tone === 'warn' ? 'border-amber-300 bg-[#FFFBEB] text-amber-950' : 'border-tc-200 bg-white text-tc-700 [&_strong]:text-tc-900'
      }`}
    >
      {children}
    </p>
  );
}

/**
 * Start → Rooms → Finish on the black layer: one bar per stage, lime as far
 * as the job has got (the Rooms bar fills room by room).
 */
function JobSteps({ steps, roomsFraction }: { steps: { label: string; state: 'done' | 'current' | 'todo'; detail?: string }[]; roomsFraction: number }) {
  return (
    <ol className="mt-6 grid grid-cols-3 gap-2">
      {steps.map((s, i) => {
        const fill = s.state === 'done' ? 1 : s.state === 'current' ? (i === 1 ? Math.max(roomsFraction, 0.04) : 0.5) : 0;
        return (
          <li key={s.label} aria-current={s.state === 'current' ? 'step' : undefined} className="min-w-0">
            <span className="block h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
              <span className="journey-fill block h-full rounded-full bg-tc-lime" style={{ width: `${fill * 100}%` }} />
            </span>
            <span className={`mt-2 block truncate text-[13px] font-semibold ${s.state === 'todo' ? 'text-white/45' : 'text-white'}`}>{s.label}</span>
            {s.detail && <span className="block truncate text-[12px] tabular-nums text-white/50">{s.detail}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Fills a sentence's {placeholders} with elements, e.g. a bold button name: rich(t('key'), { bold: <strong>…</strong> }). */
function mediaTimestampLabel(createdAt: string, locale: Locale): string {
  return new Date(createdAt).toLocaleString(intlLocale(locale), { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
  current = false,
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
  onStartTimer,
}: {
  index: number;
  item: CrewItem;
  /** The room the team is on now (the first one not done) — outlined in black. */
  current?: boolean;
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
  onStartTimer?: () => void;
}) {
  const t = useT(crewMessages);
  const [showSkip, setShowSkip] = useState(false);
  const [reason, setReason] = useState('');
  // A finished room folds down to its photos while the job is open, so the
  // rooms still to do stay near the top. "Edit" opens it again (undo, remove).
  const [expanded, setExpanded] = useState(false);
  const folded = open && item.status === 'COMPLETE' && !expanded;
  const frame = current
    ? 'border-tc-black ring-1 ring-tc-black'
    : item.status === 'COMPLETE'
    ? 'border-emerald-200'
    : item.status === 'SKIPPED'
    ? 'border-amber-300'
    : 'border-tc-200';

  return (
    <article className={`rounded-2xl border bg-white p-4 sm:p-5 ${frame}`} aria-labelledby={`room-${item.id}`} aria-current={current ? 'step' : undefined}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-tc-display text-[13px] font-bold ${
              item.status === 'COMPLETE'
                ? 'bg-emerald-500 text-white'
                : item.status === 'SKIPPED'
                ? 'bg-amber-200 text-amber-900'
                : current
                ? 'bg-tc-black text-tc-lime'
                : 'bg-tc-100 text-tc-700'
            }`}
            aria-hidden="true"
          >
            {item.status === 'COMPLETE' ? (
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3}>
                <path d="m5 10.5 3.2 3L15 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              index + 1
            )}
          </span>
          <div className="min-w-0">
            <h3 id={`room-${item.id}`} className="font-tc-display text-[18px] font-bold leading-tight tracking-[-0.01em] text-tc-900">
              {item.roomName}
            </h3>
            {item.taskDetail && <p className="mt-0.5 text-[14px] leading-snug text-tc-500">{item.taskDetail}</p>}
            <RoomTimer item={item} open={open} onStart={onStartTimer} />
          </div>
        </div>
        {item.status === 'COMPLETE' ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">{t('roomDone')}</span>
        ) : item.status === 'SKIPPED' ? (
          <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-800">{t('roomSkipped')}</span>
        ) : current ? (
          <span className="shrink-0 rounded-full bg-tc-black px-2.5 py-1 text-[12px] font-bold text-tc-lime">{t('roomNow')}</span>
        ) : (
          <span className="sr-only">{t('roomToDo')}</span>
        )}
      </header>

      {folded ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 gap-1.5">
            {media.slice(0, 5).map((m) =>
              m.kind === 'PHOTO' ? (
                <img key={m.id} src={m.url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <span key={m.id} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-tc-black text-[12px] text-white" aria-hidden="true">
                  ▶
                </span>
              ),
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="min-h-[40px] shrink-0 rounded-lg border border-tc-300 px-3 text-[14px] font-semibold text-tc-900 hover:border-tc-black"
          >
            {t('roomEdit')}
          </button>
        </div>
      ) : item.status === 'SKIPPED' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-900">
          {t('roomSkippedReason', { reason: item.skipReason })}
          {open && (
            <button onClick={() => onSkip(null)} className="min-h-[36px] font-semibold underline underline-offset-2">
              {t('roomUndo')}
            </button>
          )}
        </div>
      ) : noPhotosNeeded ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-tc-50 px-4 py-3">
          <span className="text-[14px] text-tc-700">
            {item.status === 'COMPLETE' ? t('roomDoneNoPics') : t('roomNoPicsHint')}
          </span>
          {open &&
            (item.status === 'COMPLETE' ? (
              <button onClick={() => onMarkDone(false)} className="min-h-[40px] shrink-0 text-[14px] font-semibold underline underline-offset-2">
                {t('roomUndo')}
              </button>
            ) : (
              <button onClick={() => onMarkDone(true)} className="btn-primary min-h-[44px] shrink-0 !px-4">
                {t('roomMarkDone')}
              </button>
            ))}
        </div>
      ) : !open && media.length === 0 && uploads.length === 0 ? (
        // Locked with nothing in it: one line, not two empty boxes.
        <p className="flex min-h-[44px] items-center rounded-xl bg-tc-50 px-3 text-[13px] text-tc-500">{t('roomNoPhotos')}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
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
            <button onClick={() => setShowSkip(true)} className="-ml-1 min-h-[40px] px-1 text-[14px] font-medium text-tc-500 underline-offset-2 hover:text-tc-900 hover:underline">
              {t('roomCantDo')}
            </button>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim()) onSkip(reason.trim());
              }}
            >
              <input className="input" placeholder={t('roomSkipPlaceholder')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <button type="submit" className="btn-primary shrink-0 !px-4" disabled={!reason.trim()}>
                {t('roomSkip')}
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
  const t = useT(crewMessages);
  const locale = useLocale();
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const hasPhoto = media.some((m) => m.kind === 'PHOTO');
  const full = media.length + uploads.length >= perPhase;
  const label = phase === 'BEFORE' ? t('phaseBefore') : t('phaseAfter');

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[14px] font-bold text-tc-900">{label}</h4>
        <span
          className={`inline-flex items-center gap-1 text-[12px] font-semibold ${
            hasPhoto ? 'text-emerald-700' : required && open ? 'text-amber-700' : 'text-tc-500'
          }`}
        >
          {hasPhoto ? (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
              <path d="m5 10.5 3.2 3L15 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : required && open ? (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          ) : null}
          {hasPhoto ? t('phasePhotoAdded') : required ? t('phasePhotoNeeded') : t('phaseOptional')}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {media.map((m) => (
          <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-tc-100">
            {m.kind === 'PHOTO' ? (
              <img src={m.url} alt={phase === 'BEFORE' ? t('phaseBeforePhotoAlt') : t('phaseAfterPhotoAlt')} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <>
                <video src={`${m.url}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-white">▶</span>
                </span>
                {/* Photos get their timestamp burned into the image itself (lib/clientUpload.ts); video can't be stamped client-side, so it shows one here instead. */}
                <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {mediaTimestampLabel(m.createdAt, locale)}
                </span>
              </>
            )}
            {open && (
              <button
                onClick={() => onRemove(m)}
                aria-label={m.kind === 'VIDEO' ? t('phaseRemoveVideo') : t('phaseRemovePhoto')}
                className="absolute right-0 top-0 flex h-10 w-10 items-start justify-end p-1.5"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-tc-black/80 text-white ring-1 ring-white/20" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </span>
              </button>
            )}
          </div>
        ))}
        {uploads.map((u) => (
          <div key={u.key} className="flex aspect-square flex-col items-center justify-center rounded-xl bg-tc-black px-2.5">
            <span className="text-[12px] font-semibold text-white/80">{u.kind === 'VIDEO' ? t('phaseVideo') : t('phasePhoto')}</span>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-tc-lime transition-all" style={{ width: `${Math.max(8, u.progress * 100)}%` }} />
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
              {t('phasePhoto')}
            </button>
            <button type="button" onClick={() => videoInput.current?.click()} className="media-add">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <rect x="3" y="6" width="13" height="12" rx="2" />
                <path d="m16 10 5-3v10l-5-3" strokeLinejoin="round" />
              </svg>
              {t('phaseVideo')}
            </button>
          </>
        )}
        {!open && media.length === 0 && uploads.length === 0 && (
          <div className="col-span-3 flex min-h-[48px] items-center rounded-xl bg-tc-50 px-3 text-[13px] text-tc-500">
            {phase === 'BEFORE' ? t('phaseNoBeforePhotos') : t('phaseNoAfterPhotos')}
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
      {open && !full && <p className="mt-1.5 text-[12px] text-tc-500">{t('phaseVideoLimit', { seconds: videoSeconds })}</p>}
    </div>
  );
}

/**
 * A room's count-up clock: running while the room is being cleaned, then
 * frozen at how long it took. Feeds the time-to-finish report.
 */
function RoomTimer({ item, open, onStart }: { item: CrewItem; open: boolean; onStart?: () => void }) {
  const t = useT(crewMessages);
  const [now, setNow] = useState(() => Date.now());
  const running = !!item.startedAt && item.status === 'PENDING' && open;
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);

  if (item.status === 'SKIPPED') return null;
  if (!item.startedAt) {
    return open && item.status === 'PENDING' && onStart ? (
      <button
        type="button"
        onClick={onStart}
        className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-tc-300 px-3 py-1.5 text-left text-[13px] font-semibold leading-tight text-tc-900 hover:border-tc-black"
      >
        <ClockIcon /> {t('timerStart')}
      </button>
    ) : null;
  }
  const end = item.completedAt ? new Date(item.completedAt).getTime() : now;
  const secs = Math.max(0, Math.floor((end - new Date(item.startedAt).getTime()) / 1000));
  const mm = Math.floor(secs / 60);
  const label = item.completedAt
    ? mm < 1 ? t('timerTookUnderMinute') : t('timerTookMinutes', { count: mm })
    : `${String(Math.floor(mm / 60)).padStart(1, '0')}:${String(mm % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <p
      className={`mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums ${
        item.completedAt ? 'text-tc-500' : 'rounded-full bg-tc-lime-wash px-2.5 py-1 text-tc-lime-ink'
      }`}
      aria-live="off"
    >
      <ClockIcon /> {label}
    </p>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9.5 2.5h5" />
    </svg>
  );
}
