import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { superAdminId, forbidden } from '@/lib/adminApi';
import { isAllowedType, saveServerUpload, deleteStored } from '@/lib/storage';

const MAX_BYTES = 3 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const superAdmin = await superAdminId();
  if (!superAdmin) return forbidden();

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received' }, { status: 400 });
  if (!isAllowedType('PHOTO', file.type)) return NextResponse.json({ error: 'Please upload a JPEG, PNG, or WEBP image.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That image is too large — please use one under 3 MB.' }, { status: 400 });

  const ext = EXT_BY_TYPE[file.type.toLowerCase().split(';')[0].trim()] ?? 'jpg';
  const key = `tenant-logos/${params.id}-${Date.now()}.${ext}`;
  let url: string;
  try {
    url = await saveServerUpload(file, key);
  } catch (err) {
    console.error('[platform] logo upload failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save that logo.' }, { status: 500 });
  }

  const previous = (await db.select({ logoUrl: tenants.logoUrl }).from(tenants).where(eq(tenants.id, params.id)).limit(1))[0];
  await db.update(tenants).set({ logoUrl: url }).where(eq(tenants.id, params.id));
  if (previous?.logoUrl) await deleteStored({ url: previous.logoUrl });

  return NextResponse.json({ logoUrl: url });
}
