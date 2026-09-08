import fs from 'node:fs';
import path from 'node:path';

/**
 * Saves a job checklist photo and returns a public URL for it.
 *
 * On Vercel (BLOB_READ_WRITE_TOKEN set — automatic once Blob storage is
 * added from the Storage tab), photos go to Vercel Blob, since Vercel's
 * serverless functions don't have a persistent local disk.
 *
 * For local dev without a Vercel account, it falls back to writing under
 * public/uploads/ so `npm run dev` works with zero extra setup.
 */
export async function saveJobPhoto(
  file: File,
  jobId: string,
  itemId: string,
  kind: 'before' | 'after',
): Promise<string> {
  const ext = (file.type && file.type.split('/')[1]) || 'jpg';
  const filename = `${itemId}-${kind}-${Date.now()}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`jobs/${jobId}/${filename}`, file, {
      access: 'public',
      addRandomSuffix: true,
    });
    return blob.url;
  }

  const dir = path.join(process.cwd(), 'public', 'uploads', 'jobs', jobId);
  fs.mkdirSync(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/uploads/jobs/${jobId}/${filename}`;
}
