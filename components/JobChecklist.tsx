'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Item = {
  id: string;
  roomName: string;
  taskDetail: string | null;
  status: 'PENDING' | 'COMPLETE' | 'SKIPPED';
  skipReason: string | null;
  beforePhotoPath: string | null;
  afterPhotoPath: string | null;
};

export default function JobChecklist({
  job,
  client,
  serviceLabel,
  address,
  slotStart,
  items,
}: {
  job: { id: string; status: string };
  client: { name: string } | null | undefined;
  serviceLabel: string;
  address: { line1: string; city: string; state: string } | null | undefined;
  slotStart: string;
  items: Item[];
}) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(items);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');

  const doneCount = localItems.filter((i) => i.status !== 'PENDING').length;
  const allDone = doneCount === localItems.length;
  const isJobComplete = job.status === 'COMPLETE';

  function updateItem(updated: Item) {
    setLocalItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  async function markComplete() {
    setCompleting(true);
    setCompleteError('');
    const res = await fetch(`/api/crew/jobs/${job.id}/complete`, { method: 'POST' });
    const data = await res.json();
    setCompleting(false);
    if (!res.ok) {
      setCompleteError(data.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-white pb-28">
      <header className="bg-ink px-6 py-5 text-white">
        <Link href="/crew" className="text-sm text-white/50 hover:text-white">
          ← All jobs
        </Link>
        <h1 className="mt-2 text-xl font-bold">{client?.name}</h1>
        <p className="text-sm text-white/60">
          {serviceLabel} · {slotStart.replace('T', ' ')}
        </p>
        {address && <p className="text-sm text-white/60">{address.line1}, {address.city}, {address.state}</p>}
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-6 py-6">
        {isJobComplete && (
          <div className="card bg-emerald-50 text-emerald-800">
            ✓ This job is complete — every room has a before/after pair (or a logged skip).
          </div>
        )}
        <p className="text-sm font-semibold text-ink/60">
          {doneCount}/{localItems.length} rooms documented
        </p>
        {localItems.map((item) => (
          <ChecklistRow key={item.id} jobId={job.id} item={item} onUpdate={updateItem} locked={isJobComplete} />
        ))}
      </main>

      {!isJobComplete && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-ink/10 bg-white px-6 py-4">
          <div className="mx-auto max-w-xl">
            {completeError && <p className="mb-2 text-sm text-red-600">{completeError}</p>}
            <button disabled={!allDone || completing} onClick={markComplete} className="btn-primary w-full">
              {completing ? 'Finishing…' : allDone ? 'Mark job complete' : `${localItems.length - doneCount} room(s) remaining`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({
  jobId,
  item,
  onUpdate,
  locked,
}: {
  jobId: string;
  item: Item;
  onUpdate: (i: Item) => void;
  locked: boolean;
}) {
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<'before' | 'after' | null>(null);
  const [showSkip, setShowSkip] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [error, setError] = useState('');

  async function upload(kind: 'before' | 'after', file: File) {
    setUploading(kind);
    setError('');
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    const res = await fetch(`/api/crew/jobs/${jobId}/items/${item.id}`, { method: 'POST', body: form });
    const data = await res.json();
    setUploading(null);
    if (!res.ok) {
      setError(data.error || 'Upload failed');
      return;
    }
    onUpdate(data.item);
  }

  async function submitSkip() {
    if (!skipReason.trim()) return;
    const form = new FormData();
    form.append('kind', 'skip');
    form.append('skipReason', skipReason);
    const res = await fetch(`/api/crew/jobs/${jobId}/items/${item.id}`, { method: 'POST', body: form });
    const data = await res.json();
    if (res.ok) {
      onUpdate(data.item);
      setShowSkip(false);
    }
  }

  const statusStyle =
    item.status === 'COMPLETE'
      ? 'border-emerald-300 bg-emerald-50'
      : item.status === 'SKIPPED'
      ? 'border-amber-300 bg-amber-50'
      : 'border-ink/10 bg-white';

  return (
    <div className={`card border-2 ${statusStyle}`}>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="font-semibold text-ink">{item.roomName}</p>
          {item.taskDetail && <p className="text-xs text-ink/50">{item.taskDetail}</p>}
        </div>
        <span
          className={`pill ${
            item.status === 'COMPLETE'
              ? 'bg-emerald-100 text-emerald-700'
              : item.status === 'SKIPPED'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-ink/5 text-ink/40'
          }`}
        >
          {item.status === 'COMPLETE' ? 'Done' : item.status === 'SKIPPED' ? 'Skipped' : 'Pending'}
        </span>
      </div>

      {item.status === 'SKIPPED' && (
        <p className="mb-2 text-sm text-amber-700">Skipped: {item.skipReason}</p>
      )}

      {item.status !== 'SKIPPED' && (
        <div className="grid grid-cols-2 gap-3">
          <PhotoSlot
            label="Before"
            photoPath={item.beforePhotoPath}
            uploading={uploading === 'before'}
            disabled={locked}
            onPick={() => beforeInput.current?.click()}
          />
          <PhotoSlot
            label="After"
            photoPath={item.afterPhotoPath}
            uploading={uploading === 'after'}
            disabled={locked}
            onPick={() => afterInput.current?.click()}
          />
        </div>
      )}

      <input
        ref={beforeInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload('before', f);
          e.target.value = '';
        }}
      />
      <input
        ref={afterInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload('after', f);
          e.target.value = '';
        }}
      />

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {!locked && item.status !== 'COMPLETE' && (
        <div className="mt-3">
          {!showSkip ? (
            <button onClick={() => setShowSkip(true)} className="text-xs font-medium text-ink/40 hover:text-ink/70">
              Skip this room…
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                className="input py-1.5 text-sm"
                placeholder="Reason (e.g. room inaccessible)"
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
              />
              <button onClick={submitSkip} className="btn-dark px-3 py-1.5 text-xs">
                Confirm skip
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoSlot({
  label,
  photoPath,
  uploading,
  disabled,
  onPick,
}: {
  label: string;
  photoPath: string | null;
  uploading: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled || uploading}
      className="group relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-ink/15 bg-cream text-xs text-ink/40 hover:border-gold disabled:opacity-60"
    >
      {photoPath ? (
        <img src={photoPath} alt={label} className="h-full w-full object-cover" />
      ) : (
        <>
          <span className="text-lg">📷</span>
          <span className="mt-1">{uploading ? 'Uploading…' : `${label} photo`}</span>
        </>
      )}
      {photoPath && (
        <span className="absolute bottom-1 right-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] text-white">
          {label}
        </span>
      )}
    </button>
  );
}
