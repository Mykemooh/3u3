'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import JourneyRail from '@/components/app/JourneyRail';
import { uploadMedia, type Kind, type Phase } from '@/lib/clientUpload';

export type CrewMedia = {
  id: string;
  itemId: string;
  phase: Phase;
  kind: Kind;
  url: string;
};

export type CrewItem = {
  id: string;
  roomName: string;
  taskDetail: string | null;
  status: 'PENDING' | 'COMPLETE' | 'SKIPPED';
  skipReason: string | null;
};

type JobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';

type Props = {
  job: { id: string; status: JobStatus; startedLabel: string | null; completedLabel: string | null };
  client: { name: string; phone: string | null };
  serviceLabel: string;
  whenLabel: string;
  addressLabel: string | null;
  items: CrewItem[];
  media: CrewMedia[];
  perPhase: number;
  videoSeconds: number;
  isAdmin: boolean;
};

type Upload = { key: string; itemId: string; phase: Phase; kind: Kind; progress: number };

export default function CrewJob(props: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus>(props.job.status);
  const [startedLabel, setStartedLabel] = useState(props.job.startedLabel);
  const [items, setItems] = useState(props.items);
  const [media, setMedia] = useState(props.media);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState<'start' | 'finish' | null>(null);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState<{ invoiceId: string | null } | null>(null);

  const done = items.filter((i) => i.status !== 'PENDING').length;
  const allDone = done === items.length && items.length > 0;
  const open = status === 'IN_PROGRESS';

  const steps = useMemo(
    () => [
      { label: 'Start', state: status === 'PENDING' ? ('current' as const) : ('done' as const), detail: startedLabel ?? undefined },
      {
        label: 'Rooms',
        state: status === 'PENDING' ? ('todo' as const) : status === 'COMPLETE' || allDone ? ('done' as const) : ('current' as const),
        detail: `${done}/${items.length}`,
      },
      {
        label: 'Finish',
        state: status === 'COMPLETE' ? ('done' as const) : allDone && open ? ('current' as const) : ('todo' as const),
        detail: props.job.completedLabel ?? undefined,
      },
    ],
    [status, startedLabel, done, items.length, allDone, open, props.job.completedLabel],
  );

  function applyItem(updated: CrewItem | null | undefined) {
    if (!updated) return;
    setItems((prev) => prev.map((i) => (i.id === updated.id ? { ...i, status: updated.status, skipReason: updated.skipReason } : i)));
  }

  async function start() {
    setBusy('start');
    setError('');
    const res = await fetch(`/api/crew/jobs/${props.job.id}/start`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error || 'Could not start the job.');
    setStatus('IN_PROGRESS');
    setStartedLabel(
      new Date(data.startedAt ?? Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    );
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
        setError((err as Error).message);
      } finally {
        setUploads((u) => u.filter((x) => x.key !== key));
      }
    }
  }

  async function remove(m: CrewMedia) {
    if (!confirm(`Remove this ${m.kind === 'VIDEO' ? 'video' : 'photo'}?`)) return;
    const res = await fetch(`/api/crew/jobs/${props.job.id}/media/${m.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || 'Could not remove it.');
    setMedia((all) => all.filter((x) => x.id !== m.id));
    applyItem(data.item);
  }

  async function skip(itemId: string, reason: string | null) {
    const form = new FormData();
    form.append('kind', reason ? 'skip' : 'unskip');
    if (reason) form.append('skipReason', reason);
    const res = await fetch(`/api/crew/jobs/${props.job.id}/items/${itemId}`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || 'Could not update the room.');
    applyItem(data.item);
  }

  async function finish() {
    setBusy('finish');
    setError('');
    const res = await fetch(`/api/crew/jobs/${props.job.id}/complete`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error || 'Could not finish the job.');
    setStatus('COMPLETE');
    setFinished({ invoiceId: data.invoiceId ?? null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    router.refresh();
  }

  const mapsUrl = props.addressLabel
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.addressLabel)}`
    : null;

  return (
    <div className="space-y-5">
      <Link href="/crew" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> All jobs
      </Link>

      {/* Who, where, when — with the three things a crew does from the driveway. */}
      <section className="card space-y-4">
        <div>
          <p className="eyebrow">{props.serviceLabel}</p>
          <h1 className="mt-1 text-2xl font-bold">{props.client.name}</h1>
          <p className="mt-1 text-slate">{props.whenLabel}</p>
          {props.addressLabel && <p className="text-slate">{props.addressLabel}</p>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {mapsUrl ? (
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="quick-action">
              <Icon d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              Directions
            </a>
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

      {status === 'PENDING' && (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
          Tap <strong>Start job</strong> when the crew is on site. Then take a before photo of each room first, and an after photo when it's done.
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
            onAdd={(phase, kind, files) => add(item.id, phase, kind, files)}
            onRemove={remove}
            onSkip={(reason) => skip(item.id, reason)}
          />
        ))}
      </div>

      {status !== 'COMPLETE' && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-auto max-w-xl px-5 py-3 md:max-w-3xl">
            {status === 'PENDING' ? (
              <button onClick={start} disabled={busy === 'start'} className="btn-primary w-full">
                {busy === 'start' ? 'Starting…' : 'Start job'}
              </button>
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
                <button onClick={finish} disabled={!allDone || busy === 'finish' || uploads.length > 0} className="btn-dark w-full">
                  {busy === 'finish'
                    ? 'Finishing…'
                    : allDone
                    ? 'Finish job and notify client'
                    : `${items.length - done} room${items.length - done === 1 ? '' : 's'} to go`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
  onAdd,
  onRemove,
  onSkip,
}: {
  index: number;
  item: CrewItem;
  media: CrewMedia[];
  uploads: Upload[];
  open: boolean;
  perPhase: number;
  videoSeconds: number;
  onAdd: (phase: Phase, kind: Kind, files: FileList | null) => void;
  onRemove: (m: CrewMedia) => void;
  onSkip: (reason: string | null) => void;
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
  onAdd,
  onRemove,
}: {
  phase: Phase;
  media: CrewMedia[];
  uploads: Upload[];
  open: boolean;
  perPhase: number;
  videoSeconds: number;
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
        <span className={`text-xs font-semibold ${hasPhoto ? 'text-green' : 'text-muted'}`}>{hasPhoto ? 'Photo added' : 'Photo needed'}</span>
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
