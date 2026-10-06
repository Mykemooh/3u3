'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { rich } from '@/lib/i18n/rich';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import JourneyRail from '@/components/app/JourneyRail';
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
        <span aria-hidden="true">←</span> {t('jobAllJobs')}
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
              {t('jobDirections')}
            </button>
          ) : (
            <span className="quick-action opacity-40">{t('jobNoAddress')}</span>
          )}
          {props.client.phone ? (
            <>
              <a href={`tel:${props.client.phone}`} className="quick-action">
                <Icon d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
                {t('jobCall')}
              </a>
              <a href={`sms:${props.client.phone}`} className="quick-action">
                <Icon d="M4 5h16v11H8l-4 4V5Z" />
                {t('jobText')}
              </a>
            </>
          ) : (
            <span className="quick-action col-span-2 opacity-40">{t('jobNoPhone')}</span>
          )}
        </div>
      </section>

      <section className="card">
        <JourneyRail steps={steps} />
      </section>

      {props.isAdmin && status !== 'COMPLETE' && (
        <section className="card space-y-3">
          <h2 className="text-sm font-bold text-ink">{t('jobPhotoReqTitle')}</h2>
          <label className="flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={policy.requireBeforePhoto}
              disabled={policy.noPhotosNeeded || policyBusy}
              onChange={(e) => updatePolicy({ requireBeforePhoto: e.target.checked })}
            />
            {t('jobRequireBefore')}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={policy.noPhotosNeeded}
              disabled={policyBusy}
              onChange={(e) => updatePolicy({ noPhotosNeeded: e.target.checked })}
            />
            {t('jobNoPhotosNeeded')}
          </label>
        </section>
      )}

      {(finished || status === 'COMPLETE') && (
        <section className="card border-green/30 bg-emerald-50">
          <h2 className="text-lg font-bold text-green">{t('jobCompleteTitle')}</h2>
          <p className="mt-1 text-slate">
            {finished
              ? t('jobCompleteJustNow')
              : props.job.completedLabel
              ? t('jobFinishedAt', { time: props.job.completedLabel })
              : t('jobFinished')}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/crew" className="btn-primary btn-sm">
              {t('jobNextJob')}
            </Link>
            {props.isAdmin && finished?.invoiceId && (
              <Link href={`/admin/invoices/${finished.invoiceId}`} className="btn-secondary btn-sm">
                {t('jobReviewInvoice')}
              </Link>
            )}
            <Link href={`/account/jobs/${props.job.id}`} className="btn-secondary btn-sm">
              {t('jobSeeClientView')}
            </Link>
          </div>
        </section>
      )}

      {!props.canLead && (status === 'PENDING' || status === 'EN_ROUTE') && (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
          {status === 'EN_ROUTE' ? (
            <>{t('jobLeadDriving')}</>
          ) : (
            <>{rich(t('jobNotLeadPending'), { teamLead: <strong>{t('jobBoldTeamLead')}</strong>, arrived: <strong>{t('jobBoldArrived')}</strong> })}</>
          )}
        </p>
      )}

      {hasCleanerNotes && status !== 'COMPLETE' && (
        <section className="card border-gold/50 bg-gold/5 space-y-3">
          <div className="flex items-center gap-2">
            <Icon d="M12 9v4m0 4h.01M10.3 3.9 2.7 17.5a1.5 1.5 0 0 0 1.3 2.3h16a1.5 1.5 0 0 0 1.3-2.3L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z" />
            <h2 className="font-bold text-ink">{t('jobNotesTitle')}</h2>
          </div>
          {props.cleanerNotes && <p className="whitespace-pre-wrap text-sm text-ink">{props.cleanerNotes}</p>}
          {props.homeProfile && (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {props.homeProfile.pets && (
                <div>
                  <dt className="font-semibold text-bronze">{t('jobPets')}</dt>
                  <dd className="text-ink">{props.homeProfile.pets}</dd>
                </div>
              )}
              {props.homeProfile.parkingNotes && (
                <div>
                  <dt className="font-semibold text-bronze">{t('jobParking')}</dt>
                  <dd className="text-ink">{props.homeProfile.parkingNotes}</dd>
                </div>
              )}
              {props.homeProfile.allergyNotes && (
                <div>
                  <dt className="font-semibold text-bronze">{t('jobAllergies')}</dt>
                  <dd className="text-ink">{props.homeProfile.allergyNotes}</dd>
                </div>
              )}
              {props.homeProfile.doNotTouch && (
                <div>
                  <dt className="font-semibold text-bronze">{t('jobDoNotTouch')}</dt>
                  <dd className="text-ink">{props.homeProfile.doNotTouch}</dd>
                </div>
              )}
              {props.homeProfile.entryCodeSet && (
                <div>
                  <dt className="font-semibold text-bronze">{t('jobEntryCode')}</dt>
                  <dd className="text-ink">
                    {props.homeProfile.entryCode ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="font-mono">{showEntryCode ? props.homeProfile.entryCode : '••••••'}</span>
                        <button type="button" onClick={() => setShowEntryCode((v) => !v)} className="text-xs font-semibold text-bronze underline">
                          {showEntryCode ? t('jobHide') : t('jobShow')}
                        </button>
                      </span>
                    ) : (
                      <span className="text-muted">{t('jobEntryCodeError')}</span>
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
              {t('jobNotesRead')}
            </label>
          )}
        </section>
      )}

      {status === 'EN_ROUTE' && props.canLead && (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm text-bronze" aria-live="polite">
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
        </p>
      )}

      {status === 'PENDING' && props.canLead && (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
          {rich(t('jobLeadPending'), { startDriving: <strong>{t('jobStartDriving')}</strong> })}{' '}
          {policy.noPhotosNeeded ? t('jobTipNoPhotos') : policy.requireBeforePhoto ? t('jobTipBeforeAfter') : t('jobTipAfterOnly')}
        </p>
      )}

      {props.visitNote && (
        <p className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-ink">
          <span className="font-semibold text-bronze">{t('jobVisitNote')} </span>
          <span className="whitespace-pre-wrap">{props.visitNote}</span>
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
            onStartTimer={() => startRoomTimer(item.id)}
          />
        ))}
      </div>

      {status !== 'COMPLETE' && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-auto max-w-xl px-5 py-3 md:max-w-3xl">
            {status === 'PENDING' && props.canLead ? (
              <div className="flex gap-2">
                <button onClick={startDriving} disabled={busy !== null} className="btn-primary flex-1">
                  {busy === 'drive' ? t('jobLettingClientKnow') : t('jobStartDriving')}
                </button>
                <button onClick={start} disabled={busy !== null || notesBlockStart} className="btn-secondary">
                  {busy === 'start' ? t('jobStarting') : t('jobAlreadyHere')}
                </button>
              </div>
            ) : status === 'PENDING' || status === 'EN_ROUTE' ? (
              <>
                {status === 'EN_ROUTE' && props.canLead && (
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate">
                    <span className={`h-2 w-2 rounded-full ${location === 'sharing' ? 'bg-green' : 'bg-amber-500'}`} aria-hidden="true" />
                    {location === 'sharing' ? t('jobLocSharingShort') : location === 'locating' ? t('jobLocating') : t('jobLocNotShared')}
                  </p>
                )}
                <button onClick={start} disabled={busy === 'start' || notesBlockStart} className="btn-primary w-full">
                  {busy === 'start' ? t('jobStarting') : notesBlockStart ? t('jobReviewNotesFirst') : t('jobArrivedStart')}
                </button>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate">
                  <span>{t('jobRoomsDocumented', { done, total: items.length })}</span>
                  {uploads.length > 0 && <span className="text-bronze">{t('jobUploading', { count: uploads.length })}</span>}
                </div>
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="journey-fill h-full rounded-full bg-gold" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
                </div>
                {props.canLead ? (
                  <button onClick={finish} disabled={!allDone || busy === 'finish' || uploads.length > 0} className="btn-dark w-full">
                    {busy === 'finish'
                      ? t('jobFinishing')
                      : allDone
                      ? t('jobFinishNotify')
                      : t(items.length - done === 1 ? 'jobRoomsToGoOne' : 'jobRoomsToGoMany', { count: items.length - done })}
                  </button>
                ) : (
                  <p className="text-center text-sm font-semibold text-slate">
                    {allDone ? t('jobAllDoneLeadFinishes') : t(items.length - done === 1 ? 'jobRoomsToGoOne' : 'jobRoomsToGoMany', { count: items.length - done })}
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
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border-t border-line bg-white p-5"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="eyebrow">{t('jobDirections')}</p>
            <div className="mt-3">
              <CrewDirectionsMap jobId={props.job.id} addressLabel={address} />
            </div>
            <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-muted">{t('jobOpenInMaps')}</p>
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
                {addressCopied ? t('jobAddressCopied') : t('jobCopyAddress')}
              </button>
            </div>
            <button type="button" onClick={() => setShowDirections(false)} className="btn-secondary mt-4 w-full">
              {t('jobClose')}
            </button>
          </div>
        </div>
      )}
    </div>
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
            <RoomTimer item={item} open={open} onStart={onStartTimer} />
          </div>
        </div>
        <span
          className={`pill shrink-0 ${
            item.status === 'COMPLETE' ? 'bg-emerald-100 text-green' : item.status === 'SKIPPED' ? 'bg-amber-100 text-amber-800' : 'bg-surface text-muted'
          }`}
        >
          {item.status === 'COMPLETE' ? t('roomDone') : item.status === 'SKIPPED' ? t('roomSkipped') : t('roomToDo')}
        </span>
      </header>

      {item.status === 'SKIPPED' ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('roomSkippedReason', { reason: item.skipReason })}
          {open && (
            <button onClick={() => onSkip(null)} className="ml-2 font-semibold underline">
              {t('roomUndo')}
            </button>
          )}
        </div>
      ) : noPhotosNeeded ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
          <span className="text-sm text-slate">
            {item.status === 'COMPLETE' ? t('roomDoneNoPics') : t('roomNoPicsHint')}
          </span>
          {open &&
            (item.status === 'COMPLETE' ? (
              <button onClick={() => onMarkDone(false)} className="shrink-0 text-sm font-semibold underline">
                {t('roomUndo')}
              </button>
            ) : (
              <button onClick={() => onMarkDone(true)} className="btn-dark btn-sm shrink-0">
                {t('roomMarkDone')}
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
              <input className="input py-2 text-sm" placeholder={t('roomSkipPlaceholder')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <button type="submit" className="btn-dark btn-sm shrink-0" disabled={!reason.trim()}>
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
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">{label}</h3>
        <span className={`text-xs font-semibold ${hasPhoto ? 'text-green' : 'text-muted'}`}>
          {hasPhoto ? t('phasePhotoAdded') : required ? t('phasePhotoNeeded') : t('phaseOptional')}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {media.map((m) => (
          <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-surface">
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
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink/75 text-sm text-white"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {uploads.map((u) => (
          <div key={u.key} className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-gold/50 bg-cream/50 px-2">
            <span className="text-[11px] font-semibold text-bronze">{u.kind === 'VIDEO' ? t('phaseVideo') : t('phasePhoto')}</span>
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
          <div className="col-span-3 flex aspect-[3/1] items-center justify-center rounded-xl border-2 border-dashed border-line text-xs text-muted">
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
      {open && !full && <p className="mt-1.5 text-[11px] text-muted">{t('phaseVideoLimit', { seconds: videoSeconds })}</p>}
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
      <button type="button" onClick={onStart} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-bronze hover:underline">
        <span aria-hidden="true">⏱</span> {t('timerStart')}
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
    <p className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${item.completedAt ? 'text-muted' : 'text-green'}`} aria-live="off">
      <span aria-hidden="true">⏱</span> {label}
    </p>
  );
}
