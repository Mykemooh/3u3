import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { addresses, addressRoomNotes } from '@/db/schema';
import { encryptField, decryptField, encryptionConfigured } from '@/lib/encryption';

export class HomeProfileError extends Error {}

/**
 * The structured "cleaner needs to know" fields — pets, parking,
 * allergies, do-not-touch items, an encrypted entry/alarm code, and any
 * number of per-room notes — set by the client (My Account,
 * components/AddressForm.tsx) or by the admin during the in-person quote
 * walkthrough (app/admin/leads/[id]/walkthrough). Shown together with
 * the free-text `notes` field on the crew's job (components/CrewJob.tsx),
 * which must be acknowledged before a job can start (lib/jobs.ts
 * startJob) whenever any of this has content.
 */
export type RoomNote = { id: string; roomName: string; notes: string };

export type HomeProfile = {
  notes: string | null;
  pets: string | null;
  parkingNotes: string | null;
  allergyNotes: string | null;
  doNotTouch: string | null;
  /** Decrypted plaintext — null if never set, or if it's set but the encryption key can't decrypt it right now. */
  entryCode: string | null;
  /** True if a code is on file, even when entryCode above is null because decryption isn't currently possible. */
  entryCodeSet: boolean;
  roomNotes: RoomNote[];
};

export async function getHomeProfile(addressId: string): Promise<HomeProfile | null> {
  const address = (await db.select().from(addresses).where(eq(addresses.id, addressId)).limit(1))[0];
  if (!address) return null;
  const roomNotes = await db.select().from(addressRoomNotes).where(eq(addressRoomNotes.addressId, addressId));
  return {
    notes: address.notes,
    pets: address.pets,
    parkingNotes: address.parkingNotes,
    allergyNotes: address.allergyNotes,
    doNotTouch: address.doNotTouch,
    entryCode: decryptField(address.entryCodeEncrypted),
    entryCodeSet: !!address.entryCodeEncrypted,
    roomNotes,
  };
}

/** Whether there's anything here worth gating a job's start on. */
export function homeProfileHasContent(p: Pick<HomeProfile, 'notes' | 'pets' | 'parkingNotes' | 'allergyNotes' | 'doNotTouch' | 'entryCodeSet' | 'roomNotes'>): boolean {
  return !!(
    p.notes?.trim() ||
    p.pets?.trim() ||
    p.parkingNotes?.trim() ||
    p.allergyNotes?.trim() ||
    p.doNotTouch?.trim() ||
    p.entryCodeSet ||
    p.roomNotes.length > 0
  );
}

export async function updateHomeProfile(
  addressId: string,
  input: {
    notes?: string | null;
    pets?: string | null;
    parkingNotes?: string | null;
    allergyNotes?: string | null;
    doNotTouch?: string | null;
    /** Plaintext in; encrypted before storing. Empty string or null clears it. Omit to leave unchanged. */
    entryCode?: string | null;
  },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (input.notes !== undefined) set.notes = input.notes || null;
  if (input.pets !== undefined) set.pets = input.pets || null;
  if (input.parkingNotes !== undefined) set.parkingNotes = input.parkingNotes || null;
  if (input.allergyNotes !== undefined) set.allergyNotes = input.allergyNotes || null;
  if (input.doNotTouch !== undefined) set.doNotTouch = input.doNotTouch || null;
  if (input.entryCode !== undefined) {
    if (!input.entryCode) {
      set.entryCodeEncrypted = null;
    } else {
      if (!encryptionConfigured()) throw new HomeProfileError('Entry codes can\'t be saved yet — encryption is not configured for this deployment.');
      set.entryCodeEncrypted = encryptField(input.entryCode);
    }
  }
  if (Object.keys(set).length === 0) return;
  await db.update(addresses).set(set).where(eq(addresses.id, addressId));
}

export async function addRoomNote(addressId: string, roomName: string, notes: string): Promise<RoomNote> {
  const id = crypto.randomUUID();
  await db.insert(addressRoomNotes).values({ id, addressId, roomName, notes });
  return { id, roomName, notes };
}

export async function deleteRoomNote(id: string, addressId: string): Promise<void> {
  await db.delete(addressRoomNotes).where(and(eq(addressRoomNotes.id, id), eq(addressRoomNotes.addressId, addressId)));
}
