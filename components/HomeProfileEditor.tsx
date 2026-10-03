'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type HomeProfileData = {
  pets: string | null;
  parkingNotes: string | null;
  allergyNotes: string | null;
  doNotTouch: string | null;
  entryCode: string | null;
  entryCodeSet: boolean;
  roomNotes: { id: string; roomName: string; notes: string }[];
};

/**
 * The structured "cleaner needs to know" fields — pets, parking,
 * allergies, do-not-touch items, an encrypted entry/alarm code, and
 * per-room notes. Used both in My Account (endpoint="/api/account/
 * home-profile") and on the admin client page / quote walkthrough
 * (endpoint={`/api/admin/clients/${id}/home-profile`}) — same component,
 * same shape, different endpoint, exactly like AddressForm.
 */
export default function HomeProfileEditor({ endpoint, initial, entryCodeConfigured }: { endpoint: string; initial: HomeProfileData; entryCodeConfigured: boolean }) {
  const router = useRouter();
  const [pets, setPets] = useState(initial.pets ?? '');
  const [parkingNotes, setParkingNotes] = useState(initial.parkingNotes ?? '');
  const [allergyNotes, setAllergyNotes] = useState(initial.allergyNotes ?? '');
  const [doNotTouch, setDoNotTouch] = useState(initial.doNotTouch ?? '');
  const [entryCode, setEntryCode] = useState(initial.entryCode ?? '');
  const [showEntryCode, setShowEntryCode] = useState(false);
  const [roomNotes, setRoomNotes] = useState(initial.roomNotes);
  const [newRoom, setNewRoom] = useState('');
  const [newNote, setNewNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  async function save() {
    setStatus('saving');
    setError('');
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pets, parkingNotes, allergyNotes, doNotTouch, entryCode }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus('saved');
      router.refresh();
    } else {
      setStatus('error');
      setError(data.error || "Couldn't save — please try again.");
    }
  }

  async function addRoomNote() {
    if (!newRoom.trim() || !newNote.trim()) return;
    const res = await fetch(`${endpoint}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName: newRoom.trim(), notes: newNote.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.note) {
      setRoomNotes((r) => [...r, data.note]);
      setNewRoom('');
      setNewNote('');
      router.refresh();
    }
  }

  async function removeRoomNote(id: string) {
    setRoomNotes((r) => r.filter((n) => n.id !== id));
    await fetch(`${endpoint}/rooms/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Pets</label>
          <textarea className="input" rows={2} placeholder="A friendly golden retriever, stays in the backyard" value={pets} onChange={(e) => setPets(e.target.value)} />
        </div>
        <div>
          <label className="label">Parking</label>
          <textarea className="input" rows={2} placeholder="Park in the driveway, not the street" value={parkingNotes} onChange={(e) => setParkingNotes(e.target.value)} />
        </div>
        <div>
          <label className="label">Product allergies</label>
          <textarea className="input" rows={2} placeholder="No fragranced products — sensitive to strong scents" value={allergyNotes} onChange={(e) => setAllergyNotes(e.target.value)} />
        </div>
        <div>
          <label className="label">Do not touch</label>
          <textarea className="input" rows={2} placeholder="The antique vase on the mantel, home office desk" value={doNotTouch} onChange={(e) => setDoNotTouch(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">Entry / alarm code</label>
        {!entryCodeConfigured && (
          <p className="mb-1.5 text-xs text-amber-700">Encryption isn't configured for this deployment yet — entry codes can't be saved until it is.</p>
        )}
        <div className="flex items-center gap-2">
          <input
            className="input"
            type={showEntryCode ? 'text' : 'password'}
            placeholder={initial.entryCodeSet ? '••••••' : 'e.g. gate code, lockbox code'}
            value={entryCode}
            onChange={(e) => setEntryCode(e.target.value)}
            disabled={!entryCodeConfigured}
            autoComplete="off"
          />
          <button type="button" onClick={() => setShowEntryCode((v) => !v)} className="shrink-0 text-xs font-semibold text-bronze hover:underline">
            {showEntryCode ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">Stored encrypted — only visible to the crew assigned to a job here, and to you.</p>
      </div>

      <div>
        <p className="label mb-2">Room-specific notes</p>
        <div className="space-y-2">
          {roomNotes.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <div>
                <span className="font-semibold text-ink">{n.roomName}: </span>
                <span className="text-slate">{n.notes}</span>
              </div>
              <button type="button" onClick={() => removeRoomNote(n.id)} className="shrink-0 text-xs text-muted hover:text-ink">
                Remove
              </button>
            </div>
          ))}
          {roomNotes.length === 0 && <p className="text-sm text-muted">No room-specific notes yet.</p>}
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-[120px] flex-1">
            <label className="label">Room</label>
            <input className="input" placeholder="Primary bedroom" value={newRoom} onChange={(e) => setNewRoom(e.target.value)} />
          </div>
          <div className="min-w-[200px] flex-[2]">
            <label className="label">Note</label>
            <input className="input" placeholder="Rug is an heirloom — vacuum only, don't shampoo" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
          </div>
          <button type="button" onClick={addRoomNote} disabled={!newRoom.trim() || !newNote.trim()} className="btn-secondary !px-4 !py-2.5 text-sm">
            Add
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="button" onClick={save} disabled={status === 'saving'} className="btn-primary !px-5 !py-2.5 text-sm">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save home profile'}
      </button>
    </div>
  );
}
