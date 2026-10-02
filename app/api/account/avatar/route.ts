import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { eq } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { isAllowedType, saveServerUpload, deleteStored } from '@/lib/storage';

const MAX_BYTES = 3 * 1024 * 1024; // a profile photo, not a job photo — no need for the 8MB cap

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// My Account → profile picture. Goes through the server (never needs R2's
// presigned direct-upload path — avatars are always small), so the same
// Vercel Blob / local-disk fallback every other server-side save in this
// app uses (lib/storage.ts saveServerUpload) is all this needs.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received' }, { status: 400 });
  if (!isAllowedType('PHOTO', file.type)) {
    return NextResponse.json({ error: 'Please upload a JPEG, PNG, or WEBP image.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That image is too large — please use one under 3 MB.' }, { status: 400 });
  }

  const ext = EXT_BY_TYPE[file.type.toLowerCase().split(';')[0].trim()] ?? 'jpg';
  const key = `avatars/${userId}-${Date.now()}.${ext}`;
  const url = await saveServerUpload(file, key);

  const previous = (await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1))[0];
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, userId));
  if (previous?.avatarUrl) await deleteStored({ url: previous.avatarUrl });

  return NextResponse.json({ avatarUrl: url });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const previous = (await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1))[0];
  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, userId));
  if (previous?.avatarUrl) await deleteStored({ url: previous.avatarUrl });

  return NextResponse.json({ ok: true });
}
